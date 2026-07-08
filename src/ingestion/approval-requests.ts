import type { ApprovalDecision } from "./approval.js";
import type { ToolCardReviewQueue } from "./review-queue.js";

export interface ToolCardApprovalRecordTemplate {
  id: string;
  schema_version: "approval_record.v1";
  target_type: "tool_card_draft";
  target_id: string;
  source_record_id: string;
  required_fields: Array<"decision" | "reason" | "reviewer" | "reviewed_at">;
}

export interface ToolCardApprovalRequestItem {
  tool_id: string;
  name: string;
  source_id: string;
  source_record_id: string;
  review_status: string;
  duplicate_of_tool_ids: string[];
  duplicate_of_draft_tool_ids: string[];
  validation_errors: string[];
  validation_warnings: string[];
  decision_options: ApprovalDecision[];
  approval_record_template: ToolCardApprovalRecordTemplate;
}

export interface ToolCardApprovalRequests {
  schema_version: "tool_card_approval_requests.v1";
  generated_at: string;
  summary: {
    pending_approval: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  items: ToolCardApprovalRequestItem[];
}

export function buildToolCardApprovalRequests(reviewQueue: ToolCardReviewQueue, generatedAt: string): ToolCardApprovalRequests {
  const items = reviewQueue.items
    .filter((item) => !item.approval)
    .map((item) => ({
      tool_id: item.tool_id,
      name: item.name,
      source_id: item.source_id,
      source_record_id: item.source_record_id,
      review_status: item.status,
      duplicate_of_tool_ids: item.duplicate_of_tool_ids,
      duplicate_of_draft_tool_ids: item.duplicate_of_draft_tool_ids,
      validation_errors: item.validation_errors,
      validation_warnings: item.validation_warnings,
      decision_options: ["approved", "rejected", "needs_changes"] satisfies ApprovalDecision[],
      approval_record_template: {
        id: `approval-${item.tool_id}-${item.source_record_id}`,
        schema_version: "approval_record.v1" as const,
        target_type: "tool_card_draft" as const,
        target_id: item.tool_id,
        source_record_id: item.source_record_id,
        required_fields: ["decision", "reason", "reviewer", "reviewed_at"] as Array<"decision" | "reason" | "reviewer" | "reviewed_at">
      }
    }));

  return {
    schema_version: "tool_card_approval_requests.v1",
    generated_at: generatedAt,
    summary: {
      pending_approval: items.length,
      duplicate_review_required: items.filter((item) => item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0).length,
      blocked_validation: items.filter((item) => item.review_status === "blocked_validation").length
    },
    items
  };
}
