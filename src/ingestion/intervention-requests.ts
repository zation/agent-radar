import type { ToolCardReviewQueue } from "./review-queue.js";
import type { ToolCardConflictReport } from "./field-conflicts.js";
import type { ToolCardAutoReview } from "./auto-review.js";

export interface ToolCardInterventionRequestItem {
  id: string;
  schema_version: "tool_card_intervention_request.v1";
  tool_id: string;
  name: string;
  source_id: string;
  source_record_id: string;
  target_id: string;
  review_status: string;
  duplicate_of_tool_ids: string[];
  duplicate_of_draft_tool_ids: string[];
  validation_errors: string[];
  validation_warnings: string[];
  conflict_id?: string;
  tool_card_field?: string;
  suggested_action: "resolve_before_release" | "resolve_field_conflict";
}

export interface ToolCardInterventionRequests {
  schema_version: "tool_card_intervention_requests.v1";
  generated_at: string;
  summary: {
    pending_intervention: number;
    duplicate_review_required: number;
    blocked_validation: number;
    unresolved_critical_conflicts?: number;
  };
  items: ToolCardInterventionRequestItem[];
}

export function buildToolCardInterventionRequests(
  reviewQueue: ToolCardReviewQueue,
  generatedAt: string,
  conflictReport?: ToolCardConflictReport,
  autoReview?: ToolCardAutoReview,
): ToolCardInterventionRequests {
  const autoReviewByToolId = new Map((autoReview?.items ?? []).map((item) => [item.tool_id, item]));
  const reviewItems = reviewQueue.items
    .filter((item) => {
      if (item.approval) return false;
      const autoReviewItem = autoReviewByToolId.get(item.tool_id);
      return !(
        autoReviewItem?.suggested_action === "promote" &&
        autoReviewItem.human_review_reasons.length === 0
      );
    })
    .map((item) => ({
      id: `intervention-${item.tool_id}-${item.source_record_id}`,
      schema_version: "tool_card_intervention_request.v1" as const,
      tool_id: item.tool_id,
      name: item.name,
      source_id: item.source_id,
      source_record_id: item.source_record_id,
      target_id: item.tool_id,
      review_status: item.status,
      duplicate_of_tool_ids: item.duplicate_of_tool_ids,
      duplicate_of_draft_tool_ids: item.duplicate_of_draft_tool_ids,
      validation_errors: item.validation_errors,
      validation_warnings: item.validation_warnings,
      suggested_action: "resolve_before_release" as const
    }));
  const reviewByToolId = new Map(reviewQueue.items.map((item) => [item.tool_id, item]));
  const conflictItems: ToolCardInterventionRequestItem[] = (conflictReport?.items ?? [])
    .filter((item) => item.critical && item.resolution_status === "unresolved")
    .map((conflict) => {
      const review = reviewByToolId.get(conflict.tool_id);
      return {
        id: `intervention-${conflict.conflict_id}`,
        schema_version: "tool_card_intervention_request.v1",
        tool_id: conflict.tool_id,
        name: review?.name ?? conflict.tool_id,
        source_id: review?.source_id ?? "unknown",
        source_record_id: review?.source_record_id ?? conflict.candidate_source_record_ids[0] ?? "",
        target_id: conflict.tool_id,
        review_status: "blocked_conflict",
        duplicate_of_tool_ids: [],
        duplicate_of_draft_tool_ids: [],
        validation_errors: [],
        validation_warnings: [],
        conflict_id: conflict.conflict_id,
        tool_card_field: conflict.tool_card_field,
        suggested_action: "resolve_field_conflict",
      };
    });
  const items = [...reviewItems, ...conflictItems];

  return {
    schema_version: "tool_card_intervention_requests.v1",
    generated_at: generatedAt,
    summary: {
      pending_intervention: items.length,
      duplicate_review_required: items.filter((item) => item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0).length,
      blocked_validation: items.filter((item) => item.review_status === "blocked_validation").length,
      unresolved_critical_conflicts: conflictItems.length,
    },
    items
  };
}
