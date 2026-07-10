import type { ToolCard } from "../schema.js";
import type { ApprovalRecord } from "./approval.js";
import type { ToolCardReleaseAdmission } from "./release-admission.js";
import type { ToolCardAutoReview } from "./auto-review.js";

export interface ToolCardPromotionCandidateItem {
  tool_id: string;
  source_record_id: string;
  draft: ToolCard;
  review: {
    gate: "approval_override" | "auto_review";
    reviewed_by: string;
    reviewed_at: string;
    reason: string;
  };
  promotion_status: "candidate";
}

export interface ToolCardPromotionCandidates {
  schema_version: "tool_card_promotion_candidates.v1";
  generated_at: string;
  summary: {
    candidates: number;
  };
  items: ToolCardPromotionCandidateItem[];
}

export function buildToolCardPromotionCandidates(
  drafts: ToolCard[],
  releaseAdmission: ToolCardReleaseAdmission,
  approvalRecords: ApprovalRecord[],
  generatedAt: string,
  autoReview?: ToolCardAutoReview
): ToolCardPromotionCandidates {
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
  const approvalsByTarget = new Map(approvalRecords.map((record) => [`${record.target_id}:${record.source_record_id}`, record]));
  const autoReviewByTarget = new Map((autoReview?.items ?? []).map((item) => [`${item.tool_id}:${item.source_record_id}`, item]));

  const items = releaseAdmission.items
    .filter((item) => item.status === "eligible_for_publish")
    .flatMap((item) => {
      const draft = draftsById.get(item.tool_id);
      const approval = approvalsByTarget.get(`${item.tool_id}:${item.source_record_id}`);
      const autoReviewItem = autoReviewByTarget.get(`${item.tool_id}:${item.source_record_id}`);
      if (!draft) return [];

      return [
        {
          tool_id: item.tool_id,
          source_record_id: item.source_record_id,
          draft,
          review: approval
            ? {
                gate: "approval_override" as const,
                reviewed_by: approval.reviewer,
                reviewed_at: approval.reviewed_at,
                reason: approval.reason
              }
            : {
                gate: "auto_review" as const,
                reviewed_by: "agent-radar-auto-review",
                reviewed_at: generatedAt,
                reason: `Auto review suggested ${autoReviewItem?.suggested_action ?? "promote"} with score ${autoReviewItem?.scorecard.total ?? "unknown"}.`
              },
          promotion_status: "candidate" as const
        }
      ];
    });

  return {
    schema_version: "tool_card_promotion_candidates.v1",
    generated_at: generatedAt,
    summary: {
      candidates: items.length
    },
    items
  };
}
