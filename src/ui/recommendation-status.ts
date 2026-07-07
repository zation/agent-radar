import type { RecommendedAction } from "../schema.js";

export interface RecommendationRunSummaryInput {
  runCount: number;
  action: RecommendedAction;
  query: string;
}

export function buildRecommendationRunSummary(input: RecommendationRunSummaryInput): string {
  return `Run ${input.runCount} complete · ${input.action} · ${input.query}`;
}
