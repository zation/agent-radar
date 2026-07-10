import type { ToolCardReviewQueue } from "./review-queue.js";

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
  suggested_action: "resolve_before_release";
}

export interface ToolCardInterventionRequests {
  schema_version: "tool_card_intervention_requests.v1";
  generated_at: string;
  summary: {
    pending_intervention: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  items: ToolCardInterventionRequestItem[];
}

export function buildToolCardInterventionRequests(reviewQueue: ToolCardReviewQueue, generatedAt: string): ToolCardInterventionRequests {
  const items = reviewQueue.items
    .filter((item) => !item.approval)
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

  return {
    schema_version: "tool_card_intervention_requests.v1",
    generated_at: generatedAt,
    summary: {
      pending_intervention: items.length,
      duplicate_review_required: items.filter((item) => item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0).length,
      blocked_validation: items.filter((item) => item.review_status === "blocked_validation").length
    },
    items
  };
}
