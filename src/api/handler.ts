import { RecommendationProviderError, recommendTools, type RecommendationLlmClient } from "../recommendation/engine.js";
import { DEFAULT_RECOMMENDATION_MODEL } from "../recommendation/provider-registry.js";
import type { RecommendationQuery, SearchDocument } from "../schema.js";
import { buildMcpToolManifest } from "./mcp-manifest.js";
import type { ToolRepository } from "./repository.js";

export interface ApiHandlerOptions {
  recommendationClient?: RecommendationLlmClient;
  versionInfo?: Partial<ApiVersionInfo>;
}

export interface ApiVersionInfo {
  schema_version: "agent_radar_version.v1";
  service: "agent-radar";
  release_id: string;
  commit_sha: string;
  data_version: string;
  api_version: string;
  web_version: string;
}

interface RecommendToolsInput extends RecommendationQuery {
  api_key?: string;
  model?: string;
}

export function createApiHandler(repository: ToolRepository, options: ApiHandlerOptions = {}): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const url = new URL(request.url);
    try {
      if (!url.pathname.startsWith("/api/")) return json({ error: "not_found", message: "Unknown route." }, 404);
      if (!["GET", "POST", "OPTIONS"].includes(request.method)) {
        return json({ error: "method_not_allowed", message: "Agent Radar API is read-only." }, 405);
      }
      if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders() });

      if (url.pathname === "/api/version") return json(buildVersionInfo(options.versionInfo));
      if (url.pathname === "/api/search_tools") return json(searchTools(repository, await readInput(request, url)));
      if (url.pathname === "/api/get_tool_card") return json(getToolCard(repository, getRequiredToolId(await readInput(request, url))));
      if (url.pathname === "/api/recommend_tools") return json(await recommend(repository, (await readInput(request, url)) as unknown as RecommendToolsInput, options));
      if (url.pathname === "/api/explain_rating") return json(explainRating(repository, getRequiredToolId(await readInput(request, url))));
      if (url.pathname === "/api/mcp_manifest") return json(buildMcpToolManifest());
      if (url.pathname === "/api/mcp") return json(await handleMcpJsonRpc(repository, request, options));

      return json({ error: "not_found", message: "Unknown route." }, 404);
    } catch (error) {
      if (error instanceof RecommendationProviderError) {
        return json(
          {
            error: error.code,
            message: error.message,
            provider: error.provider,
            provider_status: error.status
          },
          502
        );
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

async function handleMcpJsonRpc(repository: ToolRepository, request: Request, options: ApiHandlerOptions): Promise<Record<string, unknown>> {
  if (request.method !== "POST") {
    return jsonRpcError(null, -32600, "MCP JSON-RPC endpoint requires POST.");
  }

  const rpc = (await request.json()) as JsonRpcRequest;
  if (rpc.jsonrpc !== "2.0" || !rpc.method) return jsonRpcError(rpc.id ?? null, -32600, "Invalid JSON-RPC request.");

  try {
    if (rpc.method === "initialize") {
      return jsonRpcResult(rpc.id ?? null, {
        protocolVersion: "2024-11-05",
        serverInfo: {
          name: "agent-radar",
          version: "0.1.0"
        },
        capabilities: {
          tools: {
            listChanged: false
          }
        }
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
      const result = await callMcpTool(repository, rpc.params ?? {}, options);
      return jsonRpcResult(rpc.id ?? null, {
        content: [
          {
            type: "text",
            text: JSON.stringify(result, null, 2)
          }
        ]
      });
    }

    return jsonRpcError(rpc.id ?? null, -32601, `Unknown MCP method: ${rpc.method}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP tool call failed.";
    return jsonRpcError(rpc.id ?? null, -32000, message);
  }
}

async function callMcpTool(repository: ToolRepository, params: Record<string, unknown>, options: ApiHandlerOptions): Promise<unknown> {
  const name = readString(params.name);
  const toolArguments = ((params.arguments ?? {}) as Record<string, unknown>) ?? {};

  if (name === "search_tools") return searchTools(repository, toolArguments);
  if (name === "get_tool_card") return getToolCard(repository, getRequiredToolId(toolArguments));
  if (name === "recommend_tools") return recommend(repository, toolArguments as unknown as RecommendToolsInput, options);
  if (name === "explain_rating") return explainRating(repository, getRequiredToolId(toolArguments));
  throw new Error(`Unknown MCP tool: ${name}`);
}

function jsonRpcResult(id: string | number | null, result: unknown): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    result
  };
}

function jsonRpcError(id: string | number | null, code: number, message: string): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message
    }
  };
}

function searchTools(repository: ToolRepository, input: Record<string, unknown>) {
  const query = readString(input.query).toLowerCase();
  const filters = (input.filters ?? {}) as { type?: string; tags?: string[]; risk_level?: string };
  const topK = Number(input.top_k ?? 5);
  const words = query.split(/\s+/).filter(Boolean);

  const results = repository
    .getSearchIndex()
    .documents.filter((document) => matchesFilters(document, filters))
    .map((document) => {
      const matchedFields = [
        ...words.filter((word) => document.text.includes(word)).map((word) => `query:${word}`),
        ...document.tags.filter((tag) => words.includes(tag)).map((tag) => `tag:${tag}`)
      ];
      const score = matchedFields.length * 25 + document.rating_overall * 0.2;
      return { document, score, matchedFields };
    })
    .filter((entry) => query.length === 0 || entry.matchedFields.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => ({
      tool_id: entry.document.tool_id,
      type: entry.document.type,
      risk_level: entry.document.risk_level,
      confidence: entry.document.confidence,
      score: Math.round(entry.score),
      matched_fields: entry.matchedFields
    }));

  return { schema_version: "search_tools_result.v1", results };
}

function getToolCard(repository: ToolRepository, toolId: string) {
  const toolCard = repository.getToolCard(toolId);
  if (!toolCard) throw new Error(`Tool card not found: ${toolId}`);
  return {
    schema_version: "tool_card_lookup_result.v1",
    tool_card: toolCard,
    rating: repository.getRating(toolId)
  };
}

async function recommend(repository: ToolRepository, input: RecommendToolsInput, options: ApiHandlerOptions) {
  if (!input.task) throw new Error("recommend_tools requires task");
  const apiKey = input.api_key ?? readEnv("AGENT_RADAR_LLM_API_KEY");
  const model = input.model ?? readEnv("AGENT_RADAR_LLM_MODEL") ?? DEFAULT_RECOMMENDATION_MODEL;
  if (!apiKey) throw new Error("recommend_tools requires api_key");
  const { api_key: _apiKey, model: _model, ...query } = input;
  return recommendTools(query, repository.listToolCards(), repository.listRatings(), {
    apiKey,
    model,
    release: {
      release_id: buildVersionInfo(options.versionInfo).release_id,
      commit_sha: buildVersionInfo(options.versionInfo).commit_sha
    },
    client: options.recommendationClient
  });
}

function readEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function explainRating(repository: ToolRepository, toolId: string) {
  const rating = repository.getRating(toolId);
  if (!rating) throw new Error(`Rating not found: ${toolId}`);
  return {
    schema_version: "rating_explanation_result.v1",
    tool_id: toolId,
    rules_version: rating.rules_version,
    overall_score: rating.overall_score,
    recommendation_level: rating.recommendation_level,
    risk_level: rating.risk_level,
    dimension_scores: rating.dimension_scores,
    explanations: rating.explanations,
    penalties: rating.penalties,
    boosts: rating.boosts
  };
}

function matchesFilters(document: SearchDocument, filters: { type?: string; tags?: string[]; risk_level?: string }): boolean {
  if (filters.type && document.type !== filters.type) return false;
  if (filters.risk_level && document.risk_level !== filters.risk_level) return false;
  if (filters.tags?.length && !filters.tags.every((tag) => document.tags.includes(tag))) return false;
  return true;
}

async function readInput(request: Request, url: URL): Promise<Record<string, unknown>> {
  const queryInput = Object.fromEntries(url.searchParams.entries());
  if (request.method === "GET") return queryInput;
  const contentLength = request.headers.get("content-length");
  if (contentLength === "0") return queryInput;
  const rawBody = await request.text();
  if (!rawBody) return queryInput;
  return { ...queryInput, ...(JSON.parse(rawBody) as Record<string, unknown>) };
}

function getRequiredToolId(input: Record<string, unknown>): string {
  const toolId = readString(input.tool_id);
  if (!toolId) throw new Error("tool_id is required");
  return toolId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...corsHeaders()
    }
  });
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function corsHeaders(): Record<string, string> {
  return {
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  };
}
