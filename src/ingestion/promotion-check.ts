import type { ToolCard } from "../schema.js";
import { validateToolCards } from "../validation/tool-card-validator.js";
import type { ToolCardPromotionCandidates } from "./promotion-candidates.js";

export interface ToolCardPromotionCheckItem {
  tool_id: string;
  source_record_id: string;
  status: "ready_for_manual_merge" | "blocked";
  blocking_reasons: string[];
  duplicate_of_tool_ids: string[];
  validation_errors: string[];
  validation_warnings: string[];
}

export interface ToolCardPromotionCheck {
  schema_version: "tool_card_promotion_check.v1";
  generated_at: string;
  passed: boolean;
  summary: {
    candidates: number;
    ready_for_manual_merge: number;
    blocked: number;
    duplicate_tool_ids: number;
    validation_errors: number;
    validation_warnings: number;
  };
  items: ToolCardPromotionCheckItem[];
}

export function buildToolCardPromotionCheck(
  promotionCandidates: ToolCardPromotionCandidates,
  existingToolCards: ToolCard[],
  generatedAt: string
): ToolCardPromotionCheck {
  const existingToolIds = new Set(existingToolCards.map((card) => card.id));
  const items = promotionCandidates.items.map((candidate) => {
    const validation = validateToolCards([candidate.draft]);
    const duplicateOfToolIds = existingToolIds.has(candidate.tool_id) ? [candidate.tool_id] : [];
    const blockingReasons = [
      ...(duplicateOfToolIds.length > 0 ? ["duplicate_existing_tool_id"] : []),
      ...(validation.errors.length > 0 ? ["tool_card_validation_failed"] : [])
    ];

    return {
      tool_id: candidate.tool_id,
      source_record_id: candidate.source_record_id,
      status: blockingReasons.length === 0 ? ("ready_for_manual_merge" as const) : ("blocked" as const),
      blocking_reasons: blockingReasons,
      duplicate_of_tool_ids: duplicateOfToolIds,
      validation_errors: validation.errors,
      validation_warnings: validation.warnings
    };
  });

  return {
    schema_version: "tool_card_promotion_check.v1",
    generated_at: generatedAt,
    passed: items.every((item) => item.status === "ready_for_manual_merge"),
    summary: {
      candidates: items.length,
      ready_for_manual_merge: items.filter((item) => item.status === "ready_for_manual_merge").length,
      blocked: items.filter((item) => item.status === "blocked").length,
      duplicate_tool_ids: items.filter((item) => item.duplicate_of_tool_ids.length > 0).length,
      validation_errors: items.reduce((sum, item) => sum + item.validation_errors.length, 0),
      validation_warnings: items.reduce((sum, item) => sum + item.validation_warnings.length, 0)
    },
    items
  };
}
