import {
  RecommendationProviderError,
  recommendTools,
  type RecommendationLlmClient
} from "../recommendation/engine.js";
import { DEFAULT_RECOMMENDATION_MODEL } from "../recommendation/provider-registry.js";
import type { SearchDocument, ToolType } from "../schema.js";
import type { ToolRepository } from "./repository.js";
import type { ToolInput, ToolName } from "./tool-contracts.js";

export interface ApiVersionInfo {
  schema_version: "agent_radar_version.v1";
  service: "agent-radar";
  release_id: string;
  commit_sha: string;
  data_version: string;
  api_version: string;
  web_version: string;
}

export interface ToolRequestContext {
  llmApiKey?: string;
}

export interface ToolServiceOptions {
  recommendationClient?: RecommendationLlmClient;
  versionInfo?: Partial<ApiVersionInfo>;
  fallbackLlmApiKey?: string;
  fallbackModel?: string;
}

export interface SafeToolErrorBody {
  code: string;
  message: string;
  recovery?: string;
  provider?: string;
  status?: number;
}

export class ToolServiceError extends Error {
  constructor(public readonly body: SafeToolErrorBody, public readonly httpStatus: number) {
    super(body.message);
    this.name = "ToolServiceError";
  }
}

export interface ToolService {
  execute<Name extends ToolName>(
    name: Name,
    input: ToolInput<Name>,
    context?: ToolRequestContext
  ): Promise<Record<string, unknown>>;
}

export function createToolService(repository: ToolRepository, options: ToolServiceOptions = {}): ToolService {
  return {
    async execute(name, input, context = {}) {
      if (name === "search_tools") {
        return searchTools(repository, input as ToolInput<"search_tools">);
      }
      if (name === "get_tool_card") {
        return getToolCard(repository, (input as ToolInput<"get_tool_card">).tool_id);
      }
      if (name === "explain_rating") {
        return explainRating(repository, (input as ToolInput<"explain_rating">).tool_id);
      }
      if (name === "recommend_tools") {
        return recommend(repository, input as ToolInput<"recommend_tools">, context, options);
      }
      throw new ToolServiceError({ code: "unknown_tool", message: "Unknown Agent Radar tool." }, 404);
    }
  };
}

function searchTools(repository: ToolRepository, input: ToolInput<"search_tools">): Record<string, unknown> {
  const query = input.query.toLowerCase();
  const filters = input.filters ?? {};
  const words = query.split(/\s+/).filter(Boolean);
  const results = repository
    .getSearchIndex()
    .documents.filter((document) => matchesFilters(document, filters))
    .map((document) => {
      const matchedFields = [
        ...words.filter((word) => document.text.includes(word)).map((word) => `query:${word}`),
        ...document.tags.filter((tag) => words.includes(tag)).map((tag) => `tag:${tag}`)
      ];
      return {
        document,
        score: matchedFields.length * 25 + document.rating_overall * 0.2,
        matchedFields
      };
    })
    .filter((entry) => query.length === 0 || entry.matchedFields.length > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, input.top_k)
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

function getToolCard(repository: ToolRepository, toolId: string): Record<string, unknown> {
  const toolCard = repository.getToolCard(toolId);
  if (!toolCard) {
    throw new ToolServiceError({ code: "tool_not_found", message: `Tool card not found: ${toolId}` }, 404);
  }
  return {
    schema_version: "tool_card_lookup_result.v1",
    tool_card: toolCard,
    rating: repository.getRating(toolId)
  };
}

async function recommend(
  repository: ToolRepository,
  input: ToolInput<"recommend_tools">,
  context: ToolRequestContext,
  options: ToolServiceOptions
): Promise<Record<string, unknown>> {
  const apiKey = context.llmApiKey?.trim() || options.fallbackLlmApiKey?.trim();
  if (!apiKey) {
    throw new ToolServiceError({
      code: "missing_provider_key",
      message: "recommend_tools requires an LLM provider API key.",
      recovery: "Send the key in the X-Agent-Radar-LLM-API-Key request header."
    }, 400);
  }
  const model = input.model?.trim() || options.fallbackModel?.trim() || DEFAULT_RECOMMENDATION_MODEL;
  const { model: _model, ...query } = input;
  try {
    return await recommendTools(query, repository.listToolCards(), repository.listRatings(), {
      apiKey,
      model,
      release: {
        release_id: options.versionInfo?.release_id ?? "unknown",
        commit_sha: options.versionInfo?.commit_sha ?? "unknown"
      },
      client: options.recommendationClient
    }) as unknown as Record<string, unknown>;
  } catch (error) {
    if (error instanceof RecommendationProviderError) {
      throw new ToolServiceError({
        code: error.code,
        message: publicProviderErrorMessage(error.code),
        provider: error.provider,
        status: error.status
      }, 502);
    }
    throw error;
  }
}

function publicProviderErrorMessage(code: RecommendationProviderError["code"]): string {
  if (code === "provider_auth_failed") return "Provider rejected the API key or authorization scope.";
  if (code === "provider_rate_limited") return "Provider rate limit was reached. Try again later or use another model.";
  if (code === "provider_model_unavailable") return "Provider model or endpoint was not available.";
  if (code === "provider_schema_error") return "Provider response did not match the recommendation schema.";
  return "Provider request failed. Check the provider configuration and try again.";
}

function explainRating(repository: ToolRepository, toolId: string): Record<string, unknown> {
  const rating = repository.getRating(toolId);
  if (!rating) {
    throw new ToolServiceError({ code: "rating_not_found", message: `Rating not found: ${toolId}` }, 404);
  }
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

function matchesFilters(
  document: SearchDocument,
  filters: { type?: ToolType; tags?: string[]; risk_level?: string }
): boolean {
  if (filters.type && document.type !== filters.type) return false;
  if (filters.risk_level && document.risk_level !== filters.risk_level) return false;
  if (filters.tags?.length && !filters.tags.every((tag) => document.tags.includes(tag))) return false;
  return true;
}
