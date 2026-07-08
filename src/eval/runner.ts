import type { EvalCase, RatingResult, RecommendationResult, ToolCard } from "../schema.js";
import { RecommendationProviderError, recommendTools, type RecommendToolsRuntime } from "../recommendation/engine.js";

export type EvalFailureCategory = "blocked_no_key" | "provider_error" | "schema_error" | "quality_failure" | "none";

export interface EvalResult {
  case_id: string;
  passed: boolean;
  failure_category: EvalFailureCategory;
  failures: string[];
  recommended_action: string;
  top_tool_ids: string[];
}

export interface EvalSummary {
  passed: number;
  total: number;
  results: EvalResult[];
}

export async function runGoldenQueries(
  cases: EvalCase[],
  cards: ToolCard[],
  ratings: RatingResult[],
  runtime: RecommendToolsRuntime
): Promise<EvalSummary> {
  const results = await Promise.all(cases.map(async (evalCase) => evaluateGoldenQuery(evalCase, cards, ratings, runtime)));
  return {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    results
  };
}

export function createBlockedEvalSummary(cases: EvalCase[], reason: string): EvalSummary {
  return {
    passed: 0,
    total: cases.length,
    results: cases.map((evalCase) => ({
      case_id: evalCase.id,
      passed: false,
      failure_category: "blocked_no_key",
      failures: [reason],
      recommended_action: "blocked",
      top_tool_ids: []
    }))
  };
}

async function evaluateGoldenQuery(
  evalCase: EvalCase,
  cards: ToolCard[],
  ratings: RatingResult[],
  runtime: RecommendToolsRuntime
): Promise<EvalResult> {
  try {
    return evaluateCase(evalCase, await recommendTools(evalCase.query, cards, ratings, runtime), cards);
  } catch (error) {
    return createFailedEvalResult(evalCase.id, classifyEvalError(error), describeEvalError(error));
  }
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
    failure_category: failures.length === 0 ? "none" : "quality_failure",
    failures,
    recommended_action: result.recommended_action,
    top_tool_ids: result.candidates.map((candidate) => candidate.tool_id)
  };
}

function createFailedEvalResult(caseId: string, category: EvalFailureCategory, failure: string): EvalResult {
  return {
    case_id: caseId,
    passed: false,
    failure_category: category,
    failures: [failure],
    recommended_action: "blocked",
    top_tool_ids: []
  };
}

function classifyEvalError(error: unknown): EvalFailureCategory {
  if (error instanceof RecommendationProviderError) {
    return error.code === "provider_schema_error" ? "schema_error" : "provider_error";
  }
  const message = error instanceof Error ? error.message : String(error);
  if (/schema|json|parse/i.test(message)) return "schema_error";
  if (/provider|llm_request_failed|rate|auth|model/i.test(message)) return "provider_error";
  return "quality_failure";
}

function describeEvalError(error: unknown): string {
  if (error instanceof RecommendationProviderError) {
    return `${error.code}: ${error.message}${error.status ? ` (HTTP ${error.status})` : ""}`;
  }
  return error instanceof Error ? error.message : String(error);
}
