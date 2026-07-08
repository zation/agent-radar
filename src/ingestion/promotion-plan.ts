import type { ToolCardPromotionCandidates } from "./promotion-candidates.js";

export interface ToolCardPromotionPlanItem {
  tool_id: string;
  source_record_id: string;
  recommended_action: "manual_merge_to_seed_tool_cards";
  target_file: "src/data/seed-tool-cards.ts";
  candidate_artifact_path: "data/promotion_candidates/tool_cards.json";
  seed_candidate_artifact_path: "data/promotion_candidates/seed_tool_card_candidates.ts";
  approval: {
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
    manual_merge_required: boolean;
  };
  items: ToolCardPromotionPlanItem[];
}

export function buildToolCardPromotionPlan(promotionCandidates: ToolCardPromotionCandidates, generatedAt: string): ToolCardPromotionPlan {
  const items = promotionCandidates.items.map((candidate) => ({
    tool_id: candidate.tool_id,
    source_record_id: candidate.source_record_id,
    recommended_action: "manual_merge_to_seed_tool_cards" as const,
    target_file: "src/data/seed-tool-cards.ts" as const,
    candidate_artifact_path: "data/promotion_candidates/tool_cards.json" as const,
    seed_candidate_artifact_path: "data/promotion_candidates/seed_tool_card_candidates.ts" as const,
    approval: candidate.approval,
    checks: ["Manually merge the candidate draft into src/data/seed-tool-cards.ts.", "Run npm run pipeline after manual merge.", "Run npm run release:check before publishing."]
  }));

  return {
    schema_version: "tool_card_promotion_plan.v1",
    generated_at: generatedAt,
    summary: {
      candidates: items.length,
      manual_merge_required: items.length > 0
    },
    items
  };
}
