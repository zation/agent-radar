import type { Confidence, RiskLevel, SourceRecord, ToolCard, ToolType } from "../schema.js";
import { skillRatingPolicy } from "./skill-policy.js";

export interface RatingContext {
  sourceRecords: SourceRecord[];
}

export interface RatingPolicyInput {
  card: ToolCard;
  riskLevel: RiskLevel;
  penalties: string[];
  boosts: string[];
  context?: RatingContext;
}

export interface RatingPolicyResult {
  dimensionScores: Record<string, number>;
  baseScore: number;
}

export interface RatingPolicyHelpers {
  confidenceScore: (confidence: Confidence) => number;
  maintenanceScore: (status: ToolCard["maintenance"]["status"]) => number;
  riskPenalty: (riskLevel: RiskLevel) => number;
  clamp: (value: number) => number;
  applyCommonSignals: (input: RatingPolicyInput) => { hasInstall: boolean; hasEvidence: boolean };
}

export type RatingPolicy = (input: RatingPolicyInput) => RatingPolicyResult;

const confidenceScores: Record<Confidence, number> = { high: 95, medium: 75, low: 45, unknown: 20 };

export function confidenceScore(confidence: Confidence): number {
  return confidenceScores[confidence];
}

export function maintenanceScore(status: ToolCard["maintenance"]["status"]): number {
  return status === "active" ? 90 : status === "slow" ? 65 : status === "unknown" ? 45 : 25;
}

export function riskPenalty(riskLevel: RiskLevel): number {
  return riskLevel === "critical" ? 45 : riskLevel === "high" ? 25 : riskLevel === "unknown" ? 40 : riskLevel === "medium" ? 10 : 0;
}

export function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function applyCommonSignals(input: RatingPolicyInput): { hasInstall: boolean; hasEvidence: boolean } {
  const { card, penalties, boosts } = input;
  const hasInstall = card.install_methods.length > 0;
  const hasEvidence = card.evidence_refs.length > 0 && card.source_urls.length > 0;
  if (!hasInstall) penalties.push("missing_install_method");
  if (!hasEvidence) penalties.push("missing_evidence");
  if (card.security.trust_level === "official") boosts.push("official_source");
  if (card.maintenance.status === "active") boosts.push("active_maintenance");
  if (card.permissions.length === 0 || card.security.security_notes.length > 0) boosts.push("permission_boundary_documented");
  return { hasInstall, hasEvidence };
}

export const compatibilityRatingPolicy: RatingPolicy = (input) => {
  const { card, riskLevel } = input;
  const { hasInstall } = applyCommonSignals(input);
  const docsScore = card.docs_url || card.source_urls.some((url) => url.startsWith("http")) ? 85 : 65;
  const dimensionScores = {
    task_fit: clamp(70 + Math.min(card.use_cases.length, 4) * 5),
    evidence_quality: confidenceScore(card.confidence),
    documentation_quality: docsScore,
    maintenance_health: maintenanceScore(card.maintenance.status),
    integration_cost: hasInstall ? 78 : 45,
    security_posture: clamp(95 - riskPenalty(riskLevel)),
    community_signal: card.security.trust_level === "official" || card.security.trust_level === "well_known_org" ? 80 : 55,
  };
  return {
    dimensionScores,
    baseScore: Math.round(Object.values(dimensionScores).reduce((sum, score) => sum + score, 0) / Object.keys(dimensionScores).length),
  };
};

const helpers: RatingPolicyHelpers = { confidenceScore, maintenanceScore, riskPenalty, clamp, applyCommonSignals };

export function selectRatingPolicy(type: ToolType): RatingPolicy {
  return type === "skill" ? (input) => skillRatingPolicy(input, helpers) : compatibilityRatingPolicy;
}
