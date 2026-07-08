import type { ToolCardReviewQueue } from "./review-queue.js";

export type ToolCardReleaseAdmissionStatus = "eligible_for_publish" | "blocked";

export interface ToolCardReleaseAdmissionItem {
  tool_id: string;
  source_record_id: string;
  status: ToolCardReleaseAdmissionStatus;
  blocking_reasons: string[];
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

export function buildToolCardReleaseAdmission(reviewQueue: ToolCardReviewQueue, generatedAt: string): ToolCardReleaseAdmission {
  const items: ToolCardReleaseAdmissionItem[] = reviewQueue.items.map((item) => {
    const blockingReasons: string[] = [];
    if (item.status !== "ready_for_review") blockingReasons.push("validation_not_ready");
    if (item.approval?.decision !== "approved") blockingReasons.push("approval_not_approved");
    if (item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0) blockingReasons.push("possible_duplicate");

    return {
      tool_id: item.tool_id,
      source_record_id: item.source_record_id,
      status: blockingReasons.length === 0 ? "eligible_for_publish" : "blocked",
      blocking_reasons: blockingReasons
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
