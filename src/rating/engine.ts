import type { Confidence, FeedbackAdjustment, RatingResult, RiskLevel, ToolCard } from "../schema.js";
import { emptyFeedbackAdjustment } from "../feedback-processing/scoring.js";

const ratedAt = "2026-07-06T00:00:00Z";

const confidenceScore: Record<Confidence, number> = {
  high: 95,
  medium: 75,
  low: 45,
  unknown: 20
};

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  unknown: 5
};

export function rateAllToolCards(cards: ToolCard[], feedbackByTool: ReadonlyMap<string, FeedbackAdjustment> = new Map()): RatingResult[] {
  return cards.map((card) => rateToolCard(card, feedbackByTool.get(card.id)));
}

export function rateToolCard(card: ToolCard, feedbackAdjustment: FeedbackAdjustment = emptyFeedbackAdjustment()): RatingResult {
  const penalties: string[] = [];
  const boosts: string[] = [];
  const riskLevel = deriveRiskLevel(card, penalties);
  const dimensionScores = scoreDimensions(card, riskLevel, penalties, boosts);
  const baseScore = Math.round(Object.values(dimensionScores).reduce((sum, score) => sum + score, 0) / Object.keys(dimensionScores).length);
  const overall = clampToTenth(baseScore + feedbackAdjustment.applied);
  const evidenceQuality = card.confidence;
  const recommendationLevel = chooseRecommendationLevel(card, overall, riskLevel, evidenceQuality);

  return {
    id: `rating:${card.id}:20260706`,
    schema_version: "rating_result.v2",
    tool_id: card.id,
    tool_type: card.type,
    rules_version: "rating_rules.v0.1-draft",
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

function scoreDimensions(card: ToolCard, riskLevel: RiskLevel, penalties: string[], boosts: string[]): Record<string, number> {
  const hasInstall = card.install_methods.length > 0;
  const hasEvidence = card.evidence_refs.length > 0 && card.source_urls.length > 0;
  if (!hasInstall) penalties.push("missing_install_method");
  if (!hasEvidence) penalties.push("missing_evidence");
  if (card.security.trust_level === "official") boosts.push("official_source");
  if (card.maintenance.status === "active") boosts.push("active_maintenance");
  if (card.permissions.length === 0 || card.security.security_notes.length > 0) boosts.push("permission_boundary_documented");

  const riskPenalty = riskLevel === "critical" ? 45 : riskLevel === "high" ? 25 : riskLevel === "unknown" ? 40 : riskLevel === "medium" ? 10 : 0;
  const maintenanceScore = card.maintenance.status === "active" ? 90 : card.maintenance.status === "slow" ? 65 : card.maintenance.status === "unknown" ? 45 : 25;
  const docsScore = card.docs_url || card.source_urls.some((url) => url.startsWith("http")) ? 85 : 65;

  return {
    task_fit: clamp(70 + Math.min(card.use_cases.length, 4) * 5),
    evidence_quality: confidenceScore[card.confidence],
    documentation_quality: docsScore,
    maintenance_health: maintenanceScore,
    integration_cost: hasInstall ? 78 : 45,
    security_posture: clamp(95 - riskPenalty),
    community_signal: card.security.trust_level === "official" || card.security.trust_level === "well_known_org" ? 80 : 55
  };
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

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function clampToTenth(value: number): number {
  return Math.round(clamp(value) * 10) / 10;
}
