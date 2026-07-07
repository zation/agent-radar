import type { RecommendationCandidate, RecommendationResult } from "../schema.js";
import type { ToolViewModel } from "./data.js";

export interface RecommendationItem {
  candidate: RecommendationCandidate;
  tool: ToolViewModel;
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
