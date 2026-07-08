import type { SourceRecord, ToolCard } from "../schema.js";

export interface OverrideRecord {
  id: string;
  schema_version: "override_record.v1";
  target_type: "tool_card";
  target_id: string;
  field: keyof ToolCard;
  new_value: unknown;
  reason: string;
  evidence_urls: string[];
  created_by: string;
  created_at: string;
}

export function normalizeToolCardDrafts(sourceRecords: SourceRecord[], overrideRecords: OverrideRecord[] = []): ToolCard[] {
  validateOverrideRecords(overrideRecords);
  const overridesByToolId = groupOverridesByToolId(overrideRecords);

  return sourceRecords
    .filter((record) => record.record_type === "manual" && !record.warnings?.length)
    .map((record) => normalizeManualToolCardDraft(record, overridesByToolId.get(readToolId(record))))
    .filter((draft): draft is ToolCard => Boolean(draft));
}

function normalizeManualToolCardDraft(record: SourceRecord, overrideRecords: OverrideRecord[] | undefined): ToolCard | undefined {
  const rawToolCard = record.raw_fields;
  if (!isToolCard(rawToolCard)) return undefined;

  const draft: ToolCard = {
    ...rawToolCard,
    evidence_refs: [record.id],
    updated_at: record.parsed_at
  };

  for (const override of overrideRecords ?? []) {
    draft[override.field] = override.new_value as never;
    draft.evidence_refs = [...new Set([...draft.evidence_refs, override.id])];
  }

  return draft;
}

function validateOverrideRecords(overrideRecords: OverrideRecord[]): void {
  for (const override of overrideRecords) {
    if (override.schema_version !== "override_record.v1") throw new Error(`${override.id}: schema_version must be override_record.v1`);
    if (override.target_type !== "tool_card") throw new Error(`${override.id}: target_type must be tool_card`);
    if (override.evidence_urls.length === 0) throw new Error(`${override.id}: evidence_urls is required`);
    if (!override.reason.trim()) throw new Error(`${override.id}: reason is required`);
    if (!override.created_by.trim()) throw new Error(`${override.id}: created_by is required`);
    if (Number.isNaN(Date.parse(override.created_at))) throw new Error(`${override.id}: created_at must be ISO 8601`);
  }
}

function groupOverridesByToolId(overrideRecords: OverrideRecord[]): Map<string, OverrideRecord[]> {
  const grouped = new Map<string, OverrideRecord[]>();
  for (const override of overrideRecords) {
    grouped.set(override.target_id, [...(grouped.get(override.target_id) ?? []), override]);
  }
  return grouped;
}

function readToolId(record: SourceRecord): string {
  const parsedToolId = record.parsed_fields.tool_id;
  return typeof parsedToolId === "string" ? parsedToolId : "";
}

function isToolCard(value: unknown): value is ToolCard {
  if (!isRecord(value)) return false;

  return (
    value.schema_version === "tool_card.v1" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.source_urls) &&
    Array.isArray(value.use_cases) &&
    Array.isArray(value.not_for) &&
    Array.isArray(value.permissions) &&
    typeof value.security === "object" &&
    value.security !== null &&
    typeof value.confidence === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
