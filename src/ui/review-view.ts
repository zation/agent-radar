import type { SourceRegistryReviewDecision, SourceRegistryReviewRecord, SourceRegistryReviewRequests } from "../ingestion/source-review.js";

export interface SourceReviewRow {
  id: string;
  sourceId: string;
  field: string;
  reason: string;
  priority: "confirmation required" | "review requested";
  decisionOptions: string;
  requiredFields: string;
}

export interface SourceReviewRecordDraftInput {
  decision: SourceRegistryReviewDecision;
  reason: string;
  reviewer: string;
  reviewedAt: string;
}

export interface SourceReviewRecordDraft {
  record: SourceRegistryReviewRecord;
  json: string;
  isValid: boolean;
  errors: string[];
}

export function formatCurrentIsoUtc(date = new Date()): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function createSourceReviewRows(requests: SourceRegistryReviewRequests): SourceReviewRow[] {
  return requests.items.map((item) => ({
    id: item.review_record_template.id,
    sourceId: item.source_id,
    field: item.field,
    reason: item.reason,
    priority: item.confirmation_required ? "confirmation required" : "review requested",
    decisionOptions: item.decision_options.join(", "),
    requiredFields: item.review_record_template.required_fields.join(", ")
  }));
}

export function buildSourceReviewRecordDraft(row: SourceReviewRow, input: SourceReviewRecordDraftInput): SourceReviewRecordDraft {
  const record: SourceRegistryReviewRecord = {
    id: row.id,
    schema_version: "source_registry_review_record.v1",
    source_id: row.sourceId,
    field: row.field,
    decision: input.decision,
    reason: input.reason.trim(),
    reviewer: input.reviewer.trim(),
    reviewed_at: input.reviewedAt.trim()
  };
  const errors = validateDraft(record);

  return {
    record,
    json: `${JSON.stringify(record, null, 2)}\n`,
    isValid: errors.length === 0,
    errors
  };
}

function validateDraft(record: SourceRegistryReviewRecord): string[] {
  const errors: string[] = [];
  if (!record.reason) errors.push("reason is required");
  if (!record.reviewer) errors.push("reviewer is required");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(record.reviewed_at)) errors.push("reviewed_at must be ISO 8601 UTC");
  return errors;
}
