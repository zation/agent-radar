import type { ToolCard } from "../schema.js";
import type { ApprovalRecord } from "./approval.js";
import type { ToolCardReleaseAdmission } from "./release-admission.js";

export interface ToolCardPromotionCandidateItem {
  tool_id: string;
  source_record_id: string;
  draft: ToolCard;
  approval: {
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
  generatedAt: string
): ToolCardPromotionCandidates {
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
  const approvalsByTarget = new Map(approvalRecords.map((record) => [`${record.target_id}:${record.source_record_id}`, record]));

  const items = releaseAdmission.items
    .filter((item) => item.status === "eligible_for_publish")
    .flatMap((item) => {
      const draft = draftsById.get(item.tool_id);
      const approval = approvalsByTarget.get(`${item.tool_id}:${item.source_record_id}`);
      if (!draft || !approval) return [];

      return [
        {
          tool_id: item.tool_id,
          source_record_id: item.source_record_id,
          draft,
          approval: {
            reviewed_by: approval.reviewer,
            reviewed_at: approval.reviewed_at,
            reason: approval.reason
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
