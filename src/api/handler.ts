import { RecommendationProviderError, recommendTools, type RecommendationLlmClient } from "../recommendation/engine.js";
import type { RecommendationQuery, SearchDocument } from "../schema.js";
import { buildMcpToolManifest } from "./mcp-manifest.js";
import type { ToolRepository } from "./repository.js";

export interface ApiHandlerOptions {
  recommendationClient?: RecommendationLlmClient;
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

      if (url.pathname === "/api/search_tools") return json(searchTools(repository, await readInput(request, url)));
      if (url.pathname === "/api/get_tool_card") return json(getToolCard(repository, getRequiredToolId(await readInput(request, url))));
      if (url.pathname === "/api/recommend_tools") return json(await recommend(repository, (await readInput(request, url)) as unknown as RecommendToolsInput, options));
      if (url.pathname === "/api/explain_rating") return json(explainRating(repository, getRequiredToolId(await readInput(request, url))));
      if (url.pathname === "/api/mcp_manifest") return json(buildMcpToolManifest());

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
  if (!input.api_key) throw new Error("recommend_tools requires api_key");
  if (!input.model) throw new Error("recommend_tools requires model");
  const { api_key: apiKey, model, ...query } = input;
  return recommendTools(query, repository.listToolCards(), repository.listRatings(), {
    apiKey,
    model,
    client: options.recommendationClient
  });
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
