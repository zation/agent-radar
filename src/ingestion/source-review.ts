import type { SourceRegistryDiff } from "./source-registry.js";

export type SourceRegistryReviewDecision = "confirmed" | "rejected" | "needs_changes";
export type SourceRegistryReviewStatus = SourceRegistryReviewDecision | "pending";

export interface SourceRegistryReviewRecord {
  id: string;
  schema_version: "source_registry_review_record.v1";
  source_id: string;
  field: string;
  decision: SourceRegistryReviewDecision;
  reason: string;
  reviewer: string;
  reviewed_at: string;
}

export interface SourceRegistryReviewItem {
  source_id: string;
  field: string;
  reason: string;
  confirmation_required: boolean;
  status: SourceRegistryReviewStatus;
  confirmation?: {
    record_id: string;
    decision: SourceRegistryReviewDecision;
    reason: string;
    reviewer: string;
    reviewed_at: string;
  };
}

export interface SourceRegistryReviewArtifact {
  schema_version: "source_registry_review.v1";
  generated_at: string;
  summary: {
    total_requirements: number;
    confirmed: number;
    rejected: number;
    needs_changes: number;
    pending: number;
  };
  items: SourceRegistryReviewItem[];
}

export function buildSourceRegistryReviewArtifact(
  diff: SourceRegistryDiff,
  records: SourceRegistryReviewRecord[],
  generatedAt: string
): SourceRegistryReviewArtifact {
  validateSourceRegistryReviewRecords(records);
  const recordsByTarget = new Map(records.map((record) => [`${record.source_id}:${record.field}`, record]));
  const items = diff.changed.flatMap((source) =>
    source.review_requirements.map((requirement) => {
      const record = recordsByTarget.get(`${source.id}:${requirement.field}`);
      const status: SourceRegistryReviewStatus = record?.decision ?? "pending";
      return {
        source_id: source.id,
        field: requirement.field,
        reason: requirement.reason,
        confirmation_required: requirement.confirmation_required,
        status,
        ...(record
          ? {
              confirmation: {
                record_id: record.id,
                decision: record.decision,
                reason: record.reason,
                reviewer: record.reviewer,
                reviewed_at: record.reviewed_at
              }
            }
          : {})
      };
    })
  );

  return {
    schema_version: "source_registry_review.v1",
    generated_at: generatedAt,
    summary: {
      total_requirements: items.length,
      confirmed: items.filter((item) => item.status === "confirmed").length,
      rejected: items.filter((item) => item.status === "rejected").length,
      needs_changes: items.filter((item) => item.status === "needs_changes").length,
      pending: items.filter((item) => item.status === "pending").length
    },
    items
  };
}

function validateSourceRegistryReviewRecords(records: SourceRegistryReviewRecord[]): void {
  for (const record of records) {
    if (record.schema_version !== "source_registry_review_record.v1") throw new Error(`${record.id}: schema_version must be source_registry_review_record.v1`);
    if (!record.source_id.trim()) throw new Error(`${record.id}: source_id is required`);
    if (!record.field.trim()) throw new Error(`${record.id}: field is required`);
    if (!record.reason.trim()) throw new Error(`${record.id}: reason is required`);
    if (!record.reviewer.trim()) throw new Error(`${record.id}: reviewer is required`);
    if (!isIsoUtc(record.reviewed_at)) throw new Error(`${record.id}: reviewed_at must be ISO 8601 UTC`);
  }
}

function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}
