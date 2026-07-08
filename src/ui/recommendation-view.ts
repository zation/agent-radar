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

export async function parseRecommendationApiResponse(response: Response): Promise<RecommendationResult | RecommendationApiErrorBody> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Recommendation API returned an empty response. [HTTP ${response.status}]`);
  }

  try {
    return JSON.parse(text) as RecommendationResult | RecommendationApiErrorBody;
  } catch {
    throw new Error(`Recommendation API returned a non-JSON response. [HTTP ${response.status}]`);
  }
}
