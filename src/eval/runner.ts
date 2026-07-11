import type { EvalCase, RatingResult, RecommendationResult, RiskLevel, SafetyReasonCode, ToolCard } from "../schema.js";
import { RecommendationProviderError, recommendTools, type RecommendToolsRuntime } from "../recommendation/engine.js";

export type EvalFailureCategory = "blocked_no_key" | "provider_error" | "schema_error" | "quality_failure" | "none";

export interface EvalResult {
  case_id: string;
  passed: boolean;
  failure_category: EvalFailureCategory;
  failures: string[];
  recommended_action: string;
  top_tool_ids: string[];
  severity: EvalCase["severity"];
  risk_level: RiskLevel | "blocked";
  requires_human_approval: boolean | null;
  reason_codes: SafetyReasonCode[];
  release_blocking: boolean;
}

export interface EvalSummary {
  passed: number;
  total: number;
  results: EvalResult[];
  critical: { total: number; passed: number; failed: number; release_blocking: boolean };
  release: { release_id: string; commit_sha: string };
}

export async function runGoldenQueries(
  cases: EvalCase[],
  cards: ToolCard[],
  ratings: RatingResult[],
  runtime: RecommendToolsRuntime
): Promise<EvalSummary> {
  const results = await Promise.all(cases.map(async (evalCase) => evaluateGoldenQuery(evalCase, cards, ratings, runtime)));
  return buildSummary(results, runtime.release);
}

function buildSummary(results: EvalResult[], release = { release_id: "dev", commit_sha: "dev" }): EvalSummary {
  const critical = results.filter((result) => result.severity === "critical");
  return {
    passed: results.filter((result) => result.passed).length,
    total: results.length,
    results,
    critical: { total: critical.length, passed: critical.filter((item) => item.passed).length, failed: critical.filter((item) => !item.passed).length, release_blocking: critical.some((item) => !item.passed) },
    release
  };
}

export function createBlockedEvalSummary(cases: EvalCase[], reason: string, release = { release_id: "dev", commit_sha: "dev" }): EvalSummary {
  return buildSummary(cases.map((evalCase) => ({
      case_id: evalCase.id,
      passed: false,
      failure_category: "blocked_no_key",
      failures: [reason],
      recommended_action: "blocked",
      top_tool_ids: [], severity: evalCase.severity, risk_level: "blocked", requires_human_approval: null, reason_codes: [], release_blocking: evalCase.severity === "critical"
    })), release);
}

async function evaluateGoldenQuery(
  evalCase: EvalCase,
  cards: ToolCard[],
  ratings: RatingResult[],
  runtime: RecommendToolsRuntime
): Promise<EvalResult> {
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return evaluateCase(evalCase, await recommendTools(evalCase.query, cards, ratings, runtime), cards);
    } catch (error) {
      const category = classifyEvalError(error);
      if (category === "schema_error" && attempt === 1) continue;
      return createFailedEvalResult(evalCase, category, describeEvalError(error));
    }
  }
  return createFailedEvalResult(evalCase, "schema_error", "provider_schema_error: retry exhausted");
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
  const riskRank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4, unknown: 5 };
  if (evalCase.expected.minimum_risk_level && riskRank[result.safety_assessment.risk_level] < riskRank[evalCase.expected.minimum_risk_level]) failures.push(`risk below ${evalCase.expected.minimum_risk_level}`);
  if (evalCase.expected.requires_human_approval !== undefined && result.safety_assessment.requires_human_approval !== evalCase.expected.requires_human_approval) failures.push("human approval mismatch");
  for (const reason of evalCase.expected.must_include_reason_codes ?? []) if (!result.safety_assessment.reason_codes.includes(reason)) failures.push(`missing reason code ${reason}`);
  if (evalCase.expected.must_include_confirmation_questions && result.safety_assessment.confirmation_questions.length === 0) failures.push("missing confirmation questions");
  if (evalCase.expected.must_include_safe_defaults && result.safety_assessment.safe_defaults.length === 0) failures.push("missing safe defaults");

  return {
    case_id: evalCase.id,
    passed: failures.length === 0,
    failure_category: failures.length === 0 ? "none" : "quality_failure",
    failures,
    recommended_action: result.recommended_action,
    top_tool_ids: result.candidates.map((candidate) => candidate.tool_id), severity: evalCase.severity,
    risk_level: result.safety_assessment.risk_level, requires_human_approval: result.safety_assessment.requires_human_approval,
    reason_codes: result.safety_assessment.reason_codes, release_blocking: evalCase.severity === "critical" && failures.length > 0
  };
}

function createFailedEvalResult(evalCase: EvalCase, category: EvalFailureCategory, failure: string): EvalResult {
  return {
    case_id: evalCase.id,
    passed: false,
    failure_category: category,
    failures: [failure],
    recommended_action: "blocked",
    top_tool_ids: [], severity: evalCase.severity, risk_level: "blocked", requires_human_approval: null, reason_codes: [], release_blocking: evalCase.severity === "critical"
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
