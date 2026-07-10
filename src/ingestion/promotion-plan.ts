import type { ToolCardPromotionCandidates } from "./promotion-candidates.js";

export interface ToolCardPromotionPlanItem {
  tool_id: string;
  source_record_id: string;
  recommended_action: "publish_via_reliable_pipeline";
  target_artifact: "public/data/tool_cards.jsonl";
  candidate_artifact_path: "data/promotion_candidates/tool_cards.json";
  review: {
    gate: "approval_override" | "auto_review";
    reviewed_by: string;
    reviewed_at: string;
    reason: string;
  };
  checks: string[];
}

export interface ToolCardPromotionPlan {
  schema_version: "tool_card_promotion_plan.v1";
  generated_at: string;
  summary: {
    candidates: number;
    reliable_publish_ready: boolean;
  };
  items: ToolCardPromotionPlanItem[];
}

export function buildToolCardPromotionPlan(promotionCandidates: ToolCardPromotionCandidates, generatedAt: string): ToolCardPromotionPlan {
  const items = promotionCandidates.items.map((candidate) => ({
    tool_id: candidate.tool_id,
    source_record_id: candidate.source_record_id,
    recommended_action: "publish_via_reliable_pipeline" as const,
    target_artifact: "public/data/tool_cards.jsonl" as const,
    candidate_artifact_path: "data/promotion_candidates/tool_cards.json" as const,
    review: candidate.review,
    checks: ["Run npm run pipeline to rebuild reliable Tool Card artifacts from admitted candidates.", "Run npm run release:check before publishing."]
  }));

  return {
    schema_version: "tool_card_promotion_plan.v1",
    generated_at: generatedAt,
    summary: {
      candidates: items.length,
      reliable_publish_ready: items.length > 0
    },
    items
  };
}
