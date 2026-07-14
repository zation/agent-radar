import type { RatingPolicyHelpers, RatingPolicyInput, RatingPolicyResult } from "./policy.js";

interface SkillSignals {
  has_trigger_guidance: boolean;
  has_actionable_steps: boolean;
  has_boundary_guidance: boolean;
  heading_count: number;
  missing_resources: string[];
  platform_dependencies: string[];
  dangerous_instruction_patterns: string[];
}

export function skillRatingPolicy(input: RatingPolicyInput, helpers: RatingPolicyHelpers): RatingPolicyResult {
  const { card, riskLevel } = input;
  helpers.applyCommonSignals(input);
  const signals = readSkillSignals(input) ?? fallbackSignals(input);
  const dimensionScores = {
    trigger_clarity: helpers.clamp(30 + (signals.has_trigger_guidance ? 45 : 0) + (card.use_cases.length > 0 ? 25 : 0)),
    instruction_quality: helpers.clamp(20 + (signals.has_actionable_steps ? 35 : 0) + Math.min(signals.heading_count, 3) * 10 + (signals.missing_resources.length === 0 ? 15 : 0)),
    task_fit: helpers.clamp(45 + Math.min(card.use_cases.length, 3) * 15 + (card.primary_purpose.startsWith("skill_") ? 10 : 0)),
    boundary_clarity: helpers.clamp(20 + (signals.has_boundary_guidance ? 45 : 0) + (card.not_for.length > 0 ? 25 : 0) - signals.dangerous_instruction_patterns.length * 20),
    portability: helpers.clamp(90 - signals.platform_dependencies.length * 10 - signals.missing_resources.length * 15),
    evidence_quality: helpers.confidenceScore(card.confidence),
    maintenance_health: helpers.maintenanceScore(card.maintenance.status),
    security_posture: helpers.clamp(95 - helpers.riskPenalty(riskLevel) - signals.dangerous_instruction_patterns.length * 20),
  };
  const baseScore = Math.round(
    dimensionScores.trigger_clarity * 0.18
    + dimensionScores.instruction_quality * 0.20
    + dimensionScores.task_fit * 0.20
    + dimensionScores.boundary_clarity * 0.12
    + dimensionScores.portability * 0.10
    + dimensionScores.evidence_quality * 0.10
    + dimensionScores.maintenance_health * 0.05
    + dimensionScores.security_posture * 0.05
  );
  return { dimensionScores, baseScore };
}

function readSkillSignals(input: RatingPolicyInput): SkillSignals | undefined {
  for (const record of input.context?.sourceRecords ?? []) {
    const value = record.parsed_fields.skill_signals;
    if (!isRecord(value)) continue;
    return {
      has_trigger_guidance: value.has_trigger_guidance === true,
      has_actionable_steps: value.has_actionable_steps === true,
      has_boundary_guidance: value.has_boundary_guidance === true,
      heading_count: readNumber(value.heading_count),
      missing_resources: readStringArray(value.missing_resources),
      platform_dependencies: readStringArray(value.platform_dependencies),
      dangerous_instruction_patterns: readStringArray(value.dangerous_instruction_patterns),
    };
  }
  return undefined;
}

function fallbackSignals(input: RatingPolicyInput): SkillSignals {
  const { card } = input;
  return {
    has_trigger_guidance: card.use_cases.length > 0,
    has_actionable_steps: card.use_cases.length > 0,
    has_boundary_guidance: card.not_for.length > 0,
    heading_count: 0,
    missing_resources: [],
    platform_dependencies: [],
    dangerous_instruction_patterns: [],
  };
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
