import type { ToolCardReviewQueue } from "./review-queue.js";
import type { ToolCardAutoReview } from "./auto-review.js";

export type ToolCardReleaseAdmissionStatus = "eligible_for_publish" | "blocked";
export type ToolCardReleaseAdmissionGate = "approval_override" | "auto_review";

export interface ToolCardReleaseAdmissionItem {
  tool_id: string;
  source_record_id: string;
  status: ToolCardReleaseAdmissionStatus;
  gate: ToolCardReleaseAdmissionGate | "blocked";
  blocking_reasons: string[];
  auto_review?: {
    suggested_action: string;
    score: number;
    human_review_reasons: string[];
  };
}

export interface ToolCardReleaseAdmission {
  schema_version: "tool_card_release_admission.v1";
  generated_at: string;
  summary: {
    total: number;
    eligible_for_publish: number;
    blocked: number;
  };
  items: ToolCardReleaseAdmissionItem[];
}

export function buildToolCardReleaseAdmission(reviewQueue: ToolCardReviewQueue, generatedAt: string, autoReview?: ToolCardAutoReview): ToolCardReleaseAdmission {
  const autoReviewByToolId = new Map((autoReview?.items ?? []).map((item) => [item.tool_id, item]));
  const items: ToolCardReleaseAdmissionItem[] = reviewQueue.items.map((item) => {
    const autoReviewItem = autoReviewByToolId.get(item.tool_id);
    const blockingReasons: string[] = [];
    if (item.status !== "ready_for_review") blockingReasons.push("validation_not_ready");
    const approvalOverridePassed = item.approval?.decision === "approved";
    const autoReviewPassed = autoReviewItem?.suggested_action === "promote" && autoReviewItem.human_review_reasons.length === 0;
    if (!approvalOverridePassed && !autoReviewPassed) blockingReasons.push("approval_override_or_auto_review_not_passed");
    if (item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0) blockingReasons.push("possible_duplicate");

    return {
      tool_id: item.tool_id,
      source_record_id: item.source_record_id,
      status: blockingReasons.length === 0 ? "eligible_for_publish" : "blocked",
      gate: blockingReasons.length > 0 ? "blocked" : approvalOverridePassed ? "approval_override" : "auto_review",
      blocking_reasons: blockingReasons,
      auto_review: autoReviewItem
        ? {
            suggested_action: autoReviewItem.suggested_action,
            score: autoReviewItem.scorecard.total,
            human_review_reasons: autoReviewItem.human_review_reasons
          }
        : undefined
    };
  });

  return {
    schema_version: "tool_card_release_admission.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      eligible_for_publish: items.filter((item) => item.status === "eligible_for_publish").length,
      blocked: items.filter((item) => item.status === "blocked").length
    },
    items
  };
}
