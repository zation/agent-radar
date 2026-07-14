import type { Confidence, FeedbackAdjustment, RatingResult, RiskLevel, ToolCard } from "../schema.js";
import { emptyFeedbackAdjustment } from "../feedback-processing/scoring.js";
import { clamp, selectRatingPolicy, type RatingContext } from "./policy.js";

const ratedAt = "2026-07-06T00:00:00Z";

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  unknown: 5
};

export function rateAllToolCards(
  cards: ToolCard[],
  feedbackByTool: ReadonlyMap<string, FeedbackAdjustment> = new Map(),
  contextByTool: ReadonlyMap<string, RatingContext> = new Map(),
): RatingResult[] {
  return cards.map((card) => rateToolCard(card, feedbackByTool.get(card.id), contextByTool.get(card.id)));
}

export function rateToolCard(card: ToolCard, feedbackAdjustment: FeedbackAdjustment = emptyFeedbackAdjustment(), context?: RatingContext): RatingResult {
  const penalties: string[] = [];
  const boosts: string[] = [];
  const riskLevel = deriveRiskLevel(card, penalties);
  const { dimensionScores, baseScore } = selectRatingPolicy(card.type)({ card, riskLevel, penalties, boosts, context });
  const overall = clampToTenth(baseScore + feedbackAdjustment.applied);
  const evidenceQuality = card.confidence;
  const recommendationLevel = chooseRecommendationLevel(card, overall, riskLevel, evidenceQuality);

  return {
    id: `rating:${card.id}:20260706`,
    schema_version: "rating_result.v2",
    tool_id: card.id,
    tool_type: card.type,
    rules_version: "rating_rules.v0.2",
    base_score: baseScore,
    overall_score: overall,
    feedback_adjustment: feedbackAdjustment,
    recommendation_level: recommendationLevel,
    risk_level: riskLevel,
    dimension_scores: dimensionScores,
    explanations: [
      {
        dimension: "task_fit",
        score: dimensionScores.task_fit,
        reason: `匹配 ${card.primary_purpose}，覆盖 ${card.use_cases.slice(0, 2).join("、")}。`,
        evidence_refs: card.evidence_refs
      },
      {
        dimension: "security_posture",
        score: dimensionScores.security_posture,
        reason: card.security.security_notes,
        evidence_refs: card.evidence_refs
      },
      {
        dimension: "evidence_quality",
        score: dimensionScores.evidence_quality,
        reason: `整体置信度为 ${card.confidence}，来源可信度为 ${card.security.trust_level}。`,
        evidence_refs: card.evidence_refs
      }
    ],
    penalties,
    boosts,
    evidence_quality: evidenceQuality,
    rated_at: ratedAt
  };
}

function deriveRiskLevel(card: ToolCard, penalties: string[]): RiskLevel {
  let risk: RiskLevel = card.security.risk_level;
  if (card.permissions.some((permission) => permission.scope === "unknown" || permission.access === "unknown")) {
    penalties.push("unknown_permissions");
    return "unknown";
  }

  for (const permission of card.permissions) {
    const minimum = minimumRiskForPermission(permission.scope, permission.access);
    if (risk === "unknown" || riskRank[minimum] > riskRank[risk]) risk = minimum;
  }

  if (
    card.security.trust_level === "unknown" &&
    card.permissions.some((permission) => permission.scope === "code_execution" || permission.scope === "shell")
  ) {
    penalties.push("unknown_trust_with_execution");
    if (riskRank.high > riskRank[risk]) risk = "high";
  }

  if (risk === "unknown" && card.permissions.length === 0) return "low";
  return risk;
}

function minimumRiskForPermission(scope: string, access: string): RiskLevel {
  if (scope === "payment") return "critical";
  if (scope === "database" && access !== "read") return "critical";
  if (scope === "cloud" && access === "admin") return "critical";
  if (scope === "email" || scope === "secrets" || scope === "shell" || scope === "code_execution") return "high";
  if (scope === "filesystem" && access !== "read") return "medium";
  if (scope === "browser" || scope === "network" || scope === "filesystem") return "medium";
  if (scope === "unknown") return "unknown";
  return "low";
}

function chooseRecommendationLevel(card: ToolCard, score: number, riskLevel: RiskLevel, evidence: Confidence) {
  if (card.maintenance.status === "deprecated") return "avoid";
  if (card.security.trust_level === "unknown" && card.permissions.some((permission) => permission.scope === "code_execution" || permission.scope === "shell")) return "avoid";
  if (evidence === "unknown") return "insufficient_evidence";
  if (evidence === "low") return score >= 60 ? "consider" : "insufficient_evidence";
  if (riskLevel === "critical") return "situational";
  if (riskLevel === "high") return score >= 65 ? "consider" : "avoid";
  if (score >= 75) return "recommended";
  if (score >= 60) return "consider";
  return "situational";
}

function clampToTenth(value: number): number {
  return Math.round(clamp(value) * 10) / 10;
}
