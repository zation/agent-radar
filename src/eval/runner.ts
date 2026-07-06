import type { EvalCase, RatingResult, RecommendationResult, SearchIndex, ToolCard } from "../schema.js";
import { recommendTools } from "../recommendation/engine.js";

export interface EvalResult {
  case_id: string;
  passed: boolean;
  failures: string[];
  recommended_action: string;
  top_tool_ids: string[];
}

export interface EvalSummary {
  passed: number;
  total: number;
  results: EvalResult[];
}

export function runGoldenQueries(
  cases: EvalCase[],
  cards: ToolCard[],
  ratings: RatingResult[],
  index: SearchIndex
): EvalSummary {
  const results = cases.map((evalCase) => evaluateCase(evalCase, recommendTools(evalCase.query, cards, ratings, index), cards));
  return {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    results
  };
}

function evaluateCase(evalCase: EvalCase, result: RecommendationResult, cards: ToolCard[]): EvalResult {
  const failures: string[] = [];
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const topCards = result.candidates.map((candidate) => cardById.get(candidate.tool_id)).filter((card): card is ToolCard => Boolean(card));

  if (evalCase.expected.recommended_action && result.recommended_action !== evalCase.expected.recommended_action) {
    failures.push(`expected action ${evalCase.expected.recommended_action}, got ${result.recommended_action}`);
  }

  for (const tag of evalCase.expected.must_include_tags ?? []) {
    if (!topCards.some((card) => card.tags.includes(tag)) && result.recommended_action !== "no_reliable_match") {
      failures.push(`missing required tag ${tag}`);
    }
  }

  for (const permission of evalCase.expected.must_warn_permissions ?? []) {
    const warnedInCandidates = result.candidates.some((candidate) => candidate.risks.some((risk) => risk.includes(permission)));
    const warnedInUnderstanding = result.query_understanding.likely_permissions.includes(permission);
    if (!warnedInCandidates && !warnedInUnderstanding) failures.push(`missing permission warning ${permission}`);
  }

  for (const toolId of evalCase.expected.should_not_recommend ?? []) {
    if (result.candidates.some((candidate) => candidate.tool_id === toolId)) failures.push(`should not recommend ${toolId}`);
  }

  return {
    case_id: evalCase.id,
    passed: failures.length === 0,
    failures,
    recommended_action: result.recommended_action,
    top_tool_ids: result.candidates.map((candidate) => candidate.tool_id)
  };
}
