export type ApprovalDecision = "approved" | "rejected" | "needs_changes";

export interface ApprovalRecord {
  id: string;
  schema_version: "approval_record.v1";
  target_type: "tool_card_draft";
  target_id: string;
  source_record_id: string;
  decision: ApprovalDecision;
  reason: string;
  reviewer: string;
  reviewed_at: string;
}

export interface ApprovalArtifact {
  schema_version: "approval_records.v1";
  generated_at: string;
  summary: {
    total: number;
    approved: number;
    rejected: number;
    needs_changes: number;
  };
  records: ApprovalRecord[];
}

export function buildApprovalArtifact(records: ApprovalRecord[], generatedAt: string): ApprovalArtifact {
  validateApprovalRecords(records);
  return {
    schema_version: "approval_records.v1",
    generated_at: generatedAt,
    summary: {
      total: records.length,
      approved: records.filter((record) => record.decision === "approved").length,
      rejected: records.filter((record) => record.decision === "rejected").length,
      needs_changes: records.filter((record) => record.decision === "needs_changes").length
    },
    records
  };
}

function validateApprovalRecords(records: ApprovalRecord[]): void {
  for (const record of records) {
    if (record.schema_version !== "approval_record.v1") throw new Error(`${record.id}: schema_version must be approval_record.v1`);
    if (record.target_type !== "tool_card_draft") throw new Error(`${record.id}: target_type must be tool_card_draft`);
    if (!record.target_id.trim()) throw new Error(`${record.id}: target_id is required`);
    if (!record.source_record_id.trim()) throw new Error(`${record.id}: source_record_id is required`);
    if (!record.reviewer.trim()) throw new Error(`${record.id}: reviewer is required`);
    if (!record.reason.trim()) throw new Error(`${record.id}: reason is required`);
    if (Number.isNaN(Date.parse(record.reviewed_at))) throw new Error(`${record.id}: reviewed_at must be ISO 8601`);
  }
}
