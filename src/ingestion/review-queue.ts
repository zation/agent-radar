import type { SourceRecord, ToolCard } from "../schema.js";
import { validateToolCards } from "../validation/tool-card-validator.js";

export type ToolCardReviewStatus = "ready_for_review" | "blocked_validation";

export interface ToolCardReviewQueueItem {
  tool_id: string;
  name: string;
  source_id: string;
  source_record_id: string;
  duplicate_of_tool_ids: string[];
  status: ToolCardReviewStatus;
  validation_errors: string[];
  validation_warnings: string[];
}

export interface ToolCardReviewQueue {
  schema_version: "tool_card_review_queue.v1";
  generated_at: string;
  summary: {
    total: number;
    ready_for_review: number;
    blocked_validation: number;
  };
  items: ToolCardReviewQueueItem[];
}

export function buildToolCardReviewQueue(
  drafts: ToolCard[],
  sourceRecords: SourceRecord[],
  existingToolCards: ToolCard[],
  generatedAt: string
): ToolCardReviewQueue {
  const recordsById = new Map(sourceRecords.map((record) => [record.id, record]));
  const items = drafts.map((draft) => buildReviewQueueItem(draft, recordsById, existingToolCards));

  return {
    schema_version: "tool_card_review_queue.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      ready_for_review: items.filter((item) => item.status === "ready_for_review").length,
      blocked_validation: items.filter((item) => item.status === "blocked_validation").length
    },
    items
  };
}

function buildReviewQueueItem(draft: ToolCard, recordsById: Map<string, SourceRecord>, existingToolCards: ToolCard[]): ToolCardReviewQueueItem {
  const validation = validateToolCards([draft]);
  const sourceRecordId = draft.evidence_refs[0] ?? "";
  const sourceRecord = recordsById.get(sourceRecordId);

  return {
    tool_id: draft.id,
    name: draft.name,
    source_id: sourceRecord?.source_id ?? "unknown",
    source_record_id: sourceRecordId,
    duplicate_of_tool_ids: findDuplicateToolIds(draft, existingToolCards),
    status: validation.passed ? "ready_for_review" : "blocked_validation",
    validation_errors: validation.errors,
    validation_warnings: validation.warnings
  };
}

function findDuplicateToolIds(draft: ToolCard, existingToolCards: ToolCard[]): string[] {
  const draftKeys = canonicalToolKeys(draft);
  return existingToolCards.filter((card) => card.id === draft.id || canonicalToolKeys(card).some((key) => draftKeys.includes(key))).map((card) => card.id);
}

function canonicalToolKeys(card: ToolCard): string[] {
  return [card.repo_url, card.homepage_url, card.docs_url, ...(card.package_urls ?? [])]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\.git$/, "").replace(/\/$/, ""));
}
