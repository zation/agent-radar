import type { SourceRecord, ToolCard } from "../schema.js";
import { validateToolCards } from "../validation/tool-card-validator.js";
import type { ApprovalRecord } from "./approval.js";
import { findDuplicateToolIds } from "./deduper.js";

export type ToolCardReviewStatus = "ready_for_review" | "blocked_validation";

export interface ToolCardReviewQueueItem {
  tool_id: string;
  name: string;
  source_id: string;
  source_record_id: string;
  duplicate_of_tool_ids: string[];
  approval?: {
    decision: ApprovalRecord["decision"];
    reviewer: string;
    reviewed_at: string;
    reason: string;
  };
  status: ToolCardReviewStatus;
  validation_errors: string[];
  validation_warnings: string[];
}

export interface ToolCardReviewQueue {
  schema_version: "tool_card_review_queue.v1";
  generated_at: string;
  summary: {
    total: number;
    ready_for_review: number;
    blocked_validation: number;
  };
  items: ToolCardReviewQueueItem[];
}

export function buildToolCardReviewQueue(
  drafts: ToolCard[],
  sourceRecords: SourceRecord[],
  existingToolCards: ToolCard[],
  generatedAt: string,
  approvalRecords: ApprovalRecord[] = []
): ToolCardReviewQueue {
  const recordsById = new Map(sourceRecords.map((record) => [record.id, record]));
  const approvalsByDraft = new Map(approvalRecords.map((record) => [approvalKey(record.target_id, record.source_record_id), record]));
  const items = drafts.map((draft) => buildReviewQueueItem(draft, recordsById, existingToolCards, approvalsByDraft));

  return {
    schema_version: "tool_card_review_queue.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      ready_for_review: items.filter((item) => item.status === "ready_for_review").length,
      blocked_validation: items.filter((item) => item.status === "blocked_validation").length
    },
    items
  };
}

function buildReviewQueueItem(
  draft: ToolCard,
  recordsById: Map<string, SourceRecord>,
  existingToolCards: ToolCard[],
  approvalsByDraft: Map<string, ApprovalRecord>
): ToolCardReviewQueueItem {
  const validation = validateToolCards([draft]);
  const sourceRecordId = draft.evidence_refs[0] ?? "";
  const sourceRecord = recordsById.get(sourceRecordId);
  const approval = approvalsByDraft.get(approvalKey(draft.id, sourceRecordId));

  return {
    tool_id: draft.id,
    name: draft.name,
    source_id: sourceRecord?.source_id ?? "unknown",
    source_record_id: sourceRecordId,
    duplicate_of_tool_ids: findDuplicateToolIds(draft, existingToolCards),
    approval: approval
      ? {
          decision: approval.decision,
          reviewer: approval.reviewer,
          reviewed_at: approval.reviewed_at,
          reason: approval.reason
        }
      : undefined,
    status: validation.passed ? "ready_for_review" : "blocked_validation",
    validation_errors: validation.errors,
    validation_warnings: validation.warnings
  };
}

function approvalKey(toolId: string, sourceRecordId: string): string {
  return `${toolId}\u0000${sourceRecordId}`;
}
