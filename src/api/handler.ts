import type { RecommendationQuery } from "../schema.js";
import { buildMcpToolManifest } from "./mcp-manifest.js";
import type { ToolRepository } from "./repository.js";
import {
  createToolService,
  ToolServiceError,
  type ApiVersionInfo,
  type ToolService,
  type ToolServiceOptions
} from "./tool-service.js";

export type { ApiVersionInfo } from "./tool-service.js";

export interface ApiHandlerOptions extends ToolServiceOptions {}

interface RecommendToolsInput extends RecommendationQuery {
  api_key?: string;
  model?: string;
}

export function createApiHandler(repository: ToolRepository, options: ApiHandlerOptions = {}): (request: Request) => Promise<Response> {
  const service = createToolService(repository, {
    ...options,
    fallbackLlmApiKey: options.fallbackLlmApiKey ?? readEnv("AGENT_RADAR_LLM_API_KEY"),
    fallbackModel: options.fallbackModel ?? readEnv("AGENT_RADAR_LLM_MODEL")
  });

  return async (request: Request) => {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return json({ error: "not_found", message: "Unknown route." }, 404);
      if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
        return json({ error: "method_not_allowed", message: "Agent Radar API is read-only." }, 405);
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

      if (url.pathname === "/api/version") return json(buildVersionInfo(options.versionInfo));
      if (url.pathname === "/api/search_tools") return json(await callSearch(service, await readInput(request, url)));
      if (url.pathname === "/api/get_tool_card") return json(await service.execute("get_tool_card", { tool_id: getRequiredToolId(await readInput(request, url)) }));
      if (url.pathname === "/api/recommend_tools") return json(await callRecommendation(service, (await readInput(request, url)) as unknown as RecommendToolsInput));
      if (url.pathname === "/api/explain_rating") return json(await service.execute("explain_rating", { tool_id: getRequiredToolId(await readInput(request, url)) }));
      if (url.pathname === "/api/mcp_manifest") return json(buildMcpToolManifest());
      if (url.pathname === "/api/mcp") return json(await handleMcpJsonRpc(service, request));

      return json({ error: "not_found", message: "Unknown route." }, 404);
    } catch (error) {
      if (error instanceof ToolServiceError) {
        const { status: providerStatus, ...body } = error.body;
        return json({ error: body.code, ...body, provider_status: providerStatus }, error.httpStatus);
      }
      const message = error instanceof Error ? error.message : "Unknown error";
      return json({ error: "bad_request", message }, 400);
    }
  };
}

function buildVersionInfo(versionInfo: Partial<ApiVersionInfo> = {}): ApiVersionInfo {
  return {
    schema_version: "agent_radar_version.v1",
    service: "agent-radar",
    release_id: versionInfo.release_id ?? "unknown",
    commit_sha: versionInfo.commit_sha ?? "unknown",
    data_version: versionInfo.data_version ?? "unknown",
    api_version: versionInfo.api_version ?? "unknown",
    web_version: versionInfo.web_version ?? "unknown"
  };
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

async function handleMcpJsonRpc(service: ToolService, request: Request): Promise<Record<string, unknown>> {
  if (request.method !== "POST") return jsonRpcError(null, -32600, "MCP JSON-RPC endpoint requires POST.");
  const rpc = (await request.json()) as JsonRpcRequest;
  if (rpc.jsonrpc !== "2.0" || !rpc.method) return jsonRpcError(rpc.id ?? null, -32600, "Invalid JSON-RPC request.");

  try {
    if (rpc.method === "initialize") {
      return jsonRpcResult(rpc.id ?? null, {
        protocolVersion: "2024-11-05",
        serverInfo: { name: "agent-radar", version: "0.1.0" },
        capabilities: { tools: { listChanged: false } }
      });
    }
    if (rpc.method === "tools/list") {
      return jsonRpcResult(rpc.id ?? null, {
        tools: buildMcpToolManifest().tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.input_schema
        }))
      });
    }
    if (rpc.method === "tools/call") {
      const result = await callMcpTool(service, rpc.params ?? {});
      return jsonRpcResult(rpc.id ?? null, { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
    }
    return jsonRpcError(rpc.id ?? null, -32601, `Unknown MCP method: ${rpc.method}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP tool call failed.";
    return jsonRpcError(rpc.id ?? null, -32000, message);
  }
}

async function callMcpTool(service: ToolService, params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const name = readString(params.name);
  const input = (params.arguments ?? {}) as Record<string, unknown>;
  if (name === "search_tools") return callSearch(service, input);
  if (name === "get_tool_card") return service.execute("get_tool_card", { tool_id: getRequiredToolId(input) });
  if (name === "recommend_tools") return callRecommendation(service, input as unknown as RecommendToolsInput);
  if (name === "explain_rating") return service.execute("explain_rating", { tool_id: getRequiredToolId(input) });
  throw new ToolServiceError({ code: "unknown_tool", message: `Unknown MCP tool: ${name}` }, 404);
}

function callSearch(service: ToolService, input: Record<string, unknown>) {
  return service.execute("search_tools", {
    query: readString(input.query),
    top_k: Number(input.top_k ?? 5),
    filters: (input.filters ?? undefined) as { type?: never; tags?: string[]; risk_level?: never } | undefined
  });
}

function callRecommendation(service: ToolService, input: RecommendToolsInput) {
  if (!input.task) throw new Error("recommend_tools requires task");
  const { api_key: apiKey, ...toolInput } = input;
  return service.execute("recommend_tools", toolInput, { llmApiKey: apiKey });
}

function jsonRpcResult(id: string | number | null, result: unknown): Record<string, unknown> {
  return { jsonrpc: "2.0", id, result };
}

function jsonRpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

async function readInput(request: Request, url: URL): Promise<Record<string, unknown>> {
  const queryInput = Object.fromEntries(url.searchParams.entries());
  if (request.method === "GET") return queryInput;
  if (request.headers.get("content-length") === "0") return queryInput;
  const rawBody = await request.text();
  return rawBody ? { ...queryInput, ...(JSON.parse(rawBody) as Record<string, unknown>) } : queryInput;
}

function getRequiredToolId(input: Record<string, unknown>): string {
  const toolId = readString(input.tool_id);
  if (!toolId) throw new Error("tool_id is required");
  return toolId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() }
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
