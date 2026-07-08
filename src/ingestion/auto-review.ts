import type { RiskLevel, SourceRecord, ToolCard } from "../schema.js";
import type { ToolCardReviewQueue } from "./review-queue.js";

export type AutoReviewSuggestedAction = "promote" | "keep_draft" | "needs_review" | "reject" | "retire";

export interface ToolCardAutoReviewItem {
  tool_id: string;
  source_record_id: string;
  suggested_action: AutoReviewSuggestedAction;
  confidence: number;
  evidence_urls: string[];
  key_evidence: string[];
  key_risks: string[];
  missing_fields: string[];
  human_review_reasons: string[];
  scorecard: {
    evidence_quality: number;
    field_completeness: number;
    maintenance_health: number;
    safety_clarity: number;
    feedback_health: number;
    duplicate_risk: number;
    total: number;
  };
}

export interface ToolCardAutoReview {
  schema_version: "tool_card_auto_review.v1";
  generated_at: string;
  summary: {
    total: number;
    promote: number;
    keep_draft: number;
    needs_review: number;
    reject: number;
    retire: number;
  };
  items: ToolCardAutoReviewItem[];
}

export function buildToolCardAutoReview(drafts: ToolCard[], sourceRecords: SourceRecord[], reviewQueue: ToolCardReviewQueue, generatedAt: string): ToolCardAutoReview {
  const recordsById = new Map(sourceRecords.map((record) => [record.id, record]));
  const reviewItemsByDraft = new Map(reviewQueue.items.map((item) => [item.tool_id, item]));
  const items = drafts.map((draft) => {
    const sourceRecordId = draft.evidence_refs[0] ?? "";
    const sourceRecord = recordsById.get(sourceRecordId);
    const reviewItem = reviewItemsByDraft.get(draft.id);
    const scorecard = buildScorecard(draft, sourceRecord, reviewItem);
    const missingFields = collectMissingFields(draft);
    const keyRisks = collectKeyRisks(draft);
    const humanReviewReasons = collectHumanReviewReasons(draft, sourceRecord, reviewItem, missingFields, scorecard.total);
    const suggestedAction = chooseSuggestedAction(draft, reviewItem, humanReviewReasons, scorecard.total);

    return {
      tool_id: draft.id,
      source_record_id: sourceRecordId,
      suggested_action: suggestedAction,
      confidence: suggestedAction === "promote" ? 0.82 : suggestedAction === "keep_draft" ? 0.66 : 0.48,
      evidence_urls: draft.source_urls,
      key_evidence: collectKeyEvidence(draft, sourceRecord),
      key_risks: keyRisks,
      missing_fields: missingFields,
      human_review_reasons: humanReviewReasons,
      scorecard
    };
  });

  return {
    schema_version: "tool_card_auto_review.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      promote: items.filter((item) => item.suggested_action === "promote").length,
      keep_draft: items.filter((item) => item.suggested_action === "keep_draft").length,
      needs_review: items.filter((item) => item.suggested_action === "needs_review").length,
      reject: items.filter((item) => item.suggested_action === "reject").length,
      retire: items.filter((item) => item.suggested_action === "retire").length
    },
    items
  };
}

function buildScorecard(draft: ToolCard, sourceRecord: SourceRecord | undefined, reviewItem: ToolCardReviewQueue["items"][number] | undefined): ToolCardAutoReviewItem["scorecard"] {
  const evidenceQuality = scoreEvidenceQuality(draft, sourceRecord);
  const fieldCompleteness = scoreFieldCompleteness(draft);
  const maintenanceHealth = scoreMaintenanceHealth(draft);
  const safetyClarity = scoreSafetyClarity(draft);
  const feedbackHealth = 10;
  const duplicateRisk = reviewItem && (reviewItem.duplicate_of_tool_ids.length > 0 || reviewItem.duplicate_of_draft_tool_ids.length > 0) ? 0 : 10;
  const total = Math.round(evidenceQuality * 0.25 + fieldCompleteness * 0.2 + maintenanceHealth * 0.2 + safetyClarity * 0.2 + feedbackHealth * 0.05 + duplicateRisk * 0.1);

  return {
    evidence_quality: evidenceQuality,
    field_completeness: fieldCompleteness,
    maintenance_health: maintenanceHealth,
    safety_clarity: safetyClarity,
    feedback_health: feedbackHealth,
    duplicate_risk: duplicateRisk,
    total
  };
}

function scoreEvidenceQuality(draft: ToolCard, sourceRecord: SourceRecord | undefined): number {
  if (draft.source_urls.length === 0) return 0;
  if (sourceRecord?.source_confidence === "high" || draft.confidence === "high") return 10;
  if (sourceRecord?.source_confidence === "medium" || draft.confidence === "medium") return 8;
  if (sourceRecord?.source_confidence === "low" || draft.confidence === "low") return 5;
  return 3;
}

function scoreFieldCompleteness(draft: ToolCard): number {
  const checks = [
    Boolean(draft.summary.trim()),
    draft.source_urls.length > 0,
    Boolean(draft.repo_url || draft.docs_url || draft.homepage_url),
    draft.use_cases.length > 0,
    draft.not_for.length > 0,
    draft.install_methods.length > 0,
    draft.permissions.length > 0,
    draft.maintenance.status !== "unknown",
    draft.security.risk_level !== "unknown",
    draft.tags.length > 0
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 10);
}

function scoreMaintenanceHealth(draft: ToolCard): number {
  if (draft.maintenance.status === "active") return 10;
  if (draft.maintenance.status === "slow") return 6;
  if (draft.maintenance.status === "inactive") return 3;
  if (draft.maintenance.status === "deprecated") return 0;
  return 4;
}

function scoreSafetyClarity(draft: ToolCard): number {
  if (draft.security.risk_level === "unknown") return 0;
  if (draft.permissions.some((permission) => permission.scope === "unknown" || permission.access === "unknown")) return 2;
  if (draft.security.risk_level === "critical") return 2;
  if (draft.security.risk_level === "high") return 5;
  return 9;
}

function chooseSuggestedAction(
  draft: ToolCard,
  reviewItem: ToolCardReviewQueue["items"][number] | undefined,
  humanReviewReasons: string[],
  totalScore: number
): AutoReviewSuggestedAction {
  if (draft.maintenance.status === "deprecated" || draft.maturity === "deprecated") return "retire";
  if (reviewItem?.status === "blocked_validation") return "keep_draft";
  if (humanReviewReasons.length > 0) return "needs_review";
  if (totalScore >= 8) return "promote";
  if (totalScore >= 6) return "keep_draft";
  return "reject";
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
    ...draft.permissions.map((permission) => `${permission.scope}:${permission.access}`)
  ];
}

function collectHumanReviewReasons(
  draft: ToolCard,
  sourceRecord: SourceRecord | undefined,
  reviewItem: ToolCardReviewQueue["items"][number] | undefined,
  missingFields: string[],
  totalScore: number
): string[] {
  const reasons: string[] = [];
  const sourceProfileReviewed = Boolean(sourceRecord?.parsed_fields.source_profile);
  if ((isHighRisk(draft.security.risk_level) || draft.security.requires_human_approval) && !sourceProfileReviewed) reasons.push("high_risk_requires_human_review");
  if (reviewItem && (reviewItem.duplicate_of_tool_ids.length > 0 || reviewItem.duplicate_of_draft_tool_ids.length > 0)) reasons.push("possible_duplicate");
  if ((sourceRecord?.warnings?.length ?? 0) > 0) reasons.push("parser_warnings");
  if (missingFields.length > 0) reasons.push("missing_required_fields");
  if (totalScore < 8) reasons.push("score_below_auto_promote_threshold");
  return [...new Set(reasons)];
}

function isHighRisk(riskLevel: RiskLevel): boolean {
  return riskLevel === "high" || riskLevel === "critical" || riskLevel === "unknown";
}
