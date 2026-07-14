import type { RiskLevel, SourceRecord, ToolCard } from "../schema.js";
import type { ToolCardReviewQueue } from "./review-queue.js";

export interface ReviewFinding {
  code: string;
  severity: "info" | "warning" | "blocking";
  target: "missing_field" | "risk" | "evidence" | "human_review";
  message: string;
  evidence_refs: string[];
}

export function buildReviewFindings(
  draft: ToolCard,
  sourceRecord: SourceRecord | undefined,
  reviewItem: ToolCardReviewQueue["items"][number] | undefined,
  totalScore: number,
): ReviewFinding[] {
  const findings: ReviewFinding[] = [];
  const add = (finding: ReviewFinding) => findings.push(finding);
  const refs = sourceRecord ? [sourceRecord.id] : [];

  for (const message of collectKeyEvidence(draft, sourceRecord)) {
    add({ code: `evidence:${message.split(":")[0]}`, severity: "info", target: "evidence", message, evidence_refs: refs });
  }
  for (const message of collectMissingFields(draft)) {
    add({ code: `missing:${message}`, severity: "blocking", target: "missing_field", message, evidence_refs: refs });
  }
  for (const message of collectKeyRisks(draft)) {
    add({ code: `risk:${message}`, severity: "warning", target: "risk", message, evidence_refs: refs });
  }

  const skillSignals = draft.type === "skill" && isRecord(sourceRecord?.parsed_fields.skill_signals)
    ? sourceRecord.parsed_fields.skill_signals
    : undefined;
  if (draft.type === "skill") {
    const canonicalIdentity = readString(sourceRecord?.parsed_fields.canonical_identity);
    if (!canonicalIdentity || !/\/skills\/(?:[^/]+\/)+SKILL\.md$/i.test(new URL(canonicalIdentity, "https://invalid.local").pathname)) {
      add({ code: "skill_manifest_identity_invalid", severity: "blocking", target: "missing_field", message: "skill_manifest_identity", evidence_refs: refs });
      add({ code: "skill_evidence_ambiguous", severity: "blocking", target: "human_review", message: "skill_evidence_ambiguous", evidence_refs: refs });
    }
    for (const path of readStringArray(skillSignals?.missing_resources)) {
      add({ code: "skill_referenced_resource_missing", severity: "blocking", target: "missing_field", message: `referenced_resource:${path}`, evidence_refs: refs });
    }
    for (const dependency of readStringArray(skillSignals?.ambiguous_dependencies)) {
      add({ code: "skill_dependency_ambiguous", severity: "blocking", target: "human_review", message: "skill_evidence_ambiguous", evidence_refs: [...refs, `dependency:${dependency}`] });
    }
    if (draft.permissions.some((permission) => permission.scope === "unknown" || permission.access === "unknown")) {
      add({ code: "skill_execution_requirement_unknown", severity: "blocking", target: "human_review", message: "skill_evidence_ambiguous", evidence_refs: refs });
    }
    for (const pattern of readStringArray(skillSignals?.dangerous_instruction_patterns)) {
      add({ code: `skill_dangerous_instruction:${pattern}`, severity: "warning", target: "risk", message: `dangerous_instruction:${pattern}`, evidence_refs: refs });
    }
  }

  const sourceProfileReviewed = Boolean(sourceRecord?.parsed_fields.source_profile);
  const deterministicSkillEvidence = draft.type === "skill"
    && Boolean(sourceRecord?.parsed_fields.generated_tool_profile)
    && Boolean(skillSignals)
    && Boolean(readString(sourceRecord?.parsed_fields.canonical_identity));
  if ((isHighRisk(draft.security.risk_level) || draft.security.requires_human_approval) && !sourceProfileReviewed && !deterministicSkillEvidence) {
    add({ code: "high_risk_requires_human_review", severity: "blocking", target: "human_review", message: "high_risk_requires_human_review", evidence_refs: refs });
  }
  if (reviewItem && (reviewItem.duplicate_of_tool_ids.length > 0 || reviewItem.duplicate_of_draft_tool_ids.length > 0)) {
    add({ code: "possible_duplicate", severity: "blocking", target: "human_review", message: "possible_duplicate", evidence_refs: refs });
  }
  if ((sourceRecord?.warnings?.length ?? 0) > 0 && !sourceProfileReviewed) {
    add({ code: "parser_warnings", severity: "blocking", target: "human_review", message: "parser_warnings", evidence_refs: refs });
  }
  if (findings.some((finding) => finding.target === "missing_field")) {
    add({ code: "missing_required_fields", severity: "blocking", target: "human_review", message: "missing_required_fields", evidence_refs: refs });
  }
  if (totalScore < 8) {
    add({ code: "score_below_auto_promote_threshold", severity: "warning", target: "human_review", message: "score_below_auto_promote_threshold", evidence_refs: refs });
  }
  return findings;
}

function collectMissingFields(draft: ToolCard): string[] {
  const fields: string[] = [];
  if (!draft.summary.trim()) fields.push("summary");
  if (draft.source_urls.length === 0) fields.push("source_urls");
  if (draft.use_cases.length === 0) fields.push("use_cases");
  if (draft.not_for.length === 0) fields.push("not_for");
  if (draft.install_methods.length === 0) fields.push("install_methods");
  if (draft.permissions.length === 0) fields.push("permissions");
  if (draft.security.risk_level === "unknown") fields.push("security.risk_level");
  if (draft.maintenance.status === "unknown") fields.push("maintenance.status");
  return fields;
}

function collectKeyEvidence(draft: ToolCard, sourceRecord: SourceRecord | undefined): string[] {
  const evidence = [`source_urls:${draft.source_urls.length}`, `confidence:${draft.confidence}`];
  if (draft.repo_url) evidence.push(`repo:${draft.repo_url}`);
  if (typeof sourceRecord?.parsed_fields.stars === "number") evidence.push(`github_stars:${sourceRecord.parsed_fields.stars}`);
  if (draft.maintenance.last_commit_at) evidence.push(`last_commit_at:${draft.maintenance.last_commit_at}`);
  if (draft.license) evidence.push(`license:${draft.license}`);
  return evidence;
}

function collectKeyRisks(draft: ToolCard): string[] {
  return [
    `risk_level:${draft.security.risk_level}`,
    ...draft.security.known_risks,
    ...draft.permissions.map((permission) => `${permission.scope}:${permission.access}`),
  ];
}

function isHighRisk(riskLevel: RiskLevel): boolean {
  return riskLevel === "high" || riskLevel === "critical" || riskLevel === "unknown";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
