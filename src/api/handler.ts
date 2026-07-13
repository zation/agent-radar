import { buildMcpToolManifest } from "./mcp-manifest.js";
import { createMcpHttpHandler, type McpHttpHandlerOptions } from "./mcp-handler.js";
import type { ToolRepository } from "./repository.js";
import { toolContracts, type ToolInput } from "./tool-contracts.js";
import {
  createToolService,
  ToolServiceError,
  type ApiVersionInfo,
  type ToolService,
  type ToolServiceOptions
} from "./tool-service.js";

export type { ApiVersionInfo } from "./tool-service.js";

export interface ApiHandlerOptions extends ToolServiceOptions {
  mcp?: McpHttpHandlerOptions;
}

export function createApiHandler(repository: ToolRepository, options: ApiHandlerOptions = {}): (request: Request) => Promise<Response> {
  const service = createToolService(repository, {
    ...options
  });
  const mcpHandler = options.mcp ? createMcpHttpHandler(service, options.mcp) : undefined;

  return async (request: Request) => {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return json({ error: "not_found", message: "Unknown route." }, 404);
      if (url.pathname === "/api/mcp") {
        if (!mcpHandler) return json({ error: "mcp_not_configured", message: "MCP endpoint is not configured." }, 500);
        return mcpHandler(request);
      }
      if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
        return json({ error: "method_not_allowed", message: "Agent Radar API is read-only." }, 405);
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

      if (url.pathname === "/api/version") return json(buildVersionInfo(options.versionInfo));
      if (url.pathname === "/api/search_tools") return json(await callTool(service, "search_tools", await readInput(request, url)));
      if (url.pathname === "/api/get_tool_card") return json(await callTool(service, "get_tool_card", await readInput(request, url)));
      if (url.pathname === "/api/recommend_tools") return json(await callRecommendation(service, await readInput(request, url), request));
      if (url.pathname === "/api/explain_rating") return json(await callTool(service, "explain_rating", await readInput(request, url)));
      if (url.pathname === "/api/mcp_manifest") return json(buildMcpToolManifest());
      return json({ error: "not_found", message: "Unknown route." }, 404);
    } catch (error) {
      if (error instanceof ToolServiceError) {
        const { status: providerStatus, ...body } = error.body;
        return json({ error: body.code, ...body, provider_status: providerStatus }, error.httpStatus);
      }
      return json({ error: "internal_error", message: "Agent Radar could not complete the request." }, 500);
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

function callTool<Name extends Exclude<keyof typeof toolContracts, "recommend_tools">>(
  service: ToolService,
  name: Name,
  input: Record<string, unknown>
) {
  return service.execute(name, parseToolInput(name, normalizeHttpInput(name, input)));
}

function callRecommendation(service: ToolService, input: Record<string, unknown>, request: Request) {
  const toolInput = parseRecommendationInput(input);
  return service.execute("recommend_tools", toolInput, {
    llmApiKey: request.headers.get("X-Agent-Radar-LLM-API-Key") ?? undefined
  });
}

function parseRecommendationInput(input: Record<string, unknown>): ToolInput<"recommend_tools"> {
  if (Object.hasOwn(input, "api_key")) {
    throw new ToolServiceError({
      code: "legacy_credential_field",
      message: "api_key is not accepted in the request body or MCP tool arguments.",
      recovery: "Send the key in the X-Agent-Radar-LLM-API-Key request header."
    }, 400);
  }
  return parseToolInput("recommend_tools", input);
}

function parseToolInput<Name extends keyof typeof toolContracts>(
  name: Name,
  input: Record<string, unknown>
): ToolInput<Name> {
  const parsed = toolContracts[name].input.safeParse(input);
  if (!parsed.success) {
    throw new ToolServiceError({
      code: "invalid_tool_input",
      message: `${name} input is invalid.`,
      recovery: "Send only fields accepted by the published tool contract."
    }, 400);
  }
  return parsed.data as ToolInput<Name>;
}

function normalizeHttpInput(
  name: keyof typeof toolContracts,
  input: Record<string, unknown>
): Record<string, unknown> {
  if (name !== "search_tools" || typeof input.top_k !== "string") return input;
  if (!/^[1-9][0-9]*$/.test(input.top_k)) return input;
  return { ...input, top_k: Number(input.top_k) };
}

async function readInput(request: Request, url: URL): Promise<Record<string, unknown>> {
  const queryInput = Object.fromEntries(url.searchParams.entries());
  if (request.method === "GET") return queryInput;
  if (request.headers.get("content-length") === "0") return queryInput;
  const rawBody = await request.text();
  if (!rawBody) return queryInput;
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw new ToolServiceError({ code: "invalid_json", message: "Request body must be valid JSON." }, 400);
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    throw new ToolServiceError({ code: "invalid_tool_input", message: "Tool input must be a JSON object." }, 400);
  }
  return { ...queryInput, ...(body as Record<string, unknown>) };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...corsHeaders() }
  });
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type,x-agent-radar-llm-api-key"
  };
}
