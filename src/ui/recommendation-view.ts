import type { RecommendationCandidate, RecommendationResult } from "../schema.js";
import type { ToolViewModel } from "./data.js";

export interface RecommendationItem {
  candidate: RecommendationCandidate;
  tool: ToolViewModel;
}

export interface RecommendationApiErrorBody {
  error?: string;
  message?: string;
  provider?: string;
  provider_status?: number;
}

export function createRecommendationItems(result: RecommendationResult, tools: ToolViewModel[]): RecommendationItem[] {
  const toolsById = new Map(tools.map((tool) => [tool.card.id, tool]));
  return result.candidates
    .map((candidate) => {
      const tool = toolsById.get(candidate.tool_id);
      return tool ? { candidate, tool } : undefined;
    })
    .filter((item): item is RecommendationItem => Boolean(item));
}

export function formatRecommendationApiError(body: RecommendationApiErrorBody): string {
  const message = body.message?.trim() || "Recommendation request failed.";
  const details = [body.error, body.provider, typeof body.provider_status === "number" ? `HTTP ${body.provider_status}` : undefined].filter(Boolean);
  return details.length > 0 ? `${message} [${details.join(" · ")}]` : message;
}
