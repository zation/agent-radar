import type { SourceRecord, ToolCard } from "../schema.js";
import type { OverrideRecord } from "./normalizer.js";

export interface ToolCardFieldValueProvenanceItem {
  tool_id: string;
  source_record_id: string;
  tool_card_field: string;
  source_field_path: string;
  source_value_preview: string;
  normalized_value_preview: string;
  provenance_type: "source_record" | "override_record";
  override_record_id?: string;
}

export interface ToolCardFieldValueProvenance {
  schema_version: "tool_card_field_value_provenance.v1";
  generated_at: string;
  summary: {
    tool_cards: number;
    field_values: number;
  };
  items: ToolCardFieldValueProvenanceItem[];
}

export function buildToolCardFieldValueProvenance(
  drafts: ToolCard[],
  sourceRecords: SourceRecord[],
  generatedAt: string,
  overrideRecords: OverrideRecord[] = []
): ToolCardFieldValueProvenance {
  const sourceRecordsById = new Map(sourceRecords.map((record) => [record.id, record]));
  const overridesByToolId = groupOverridesByToolId(overrideRecords);
  const items = drafts.flatMap((draft) => {
    const sourceRecordId = draft.evidence_refs[0] ?? "";
    const sourceRecord = sourceRecordsById.get(sourceRecordId);
    if (!sourceRecord) return [];

    const sourceItems = Object.entries(sourceRecord.raw_fields).flatMap(([field, sourceValue]) => {
      if (!(field in draft)) return [];
      const normalizedValue = draft[field as keyof ToolCard];
      return [
        {
          tool_id: draft.id,
          source_record_id: sourceRecord.id,
          tool_card_field: field,
          source_field_path: `raw_fields.${field}`,
          source_value_preview: previewValue(sourceValue),
          normalized_value_preview: previewValue(normalizedValue),
          provenance_type: "source_record" as const
        }
      ];
    });

    const overrideItems = (overridesByToolId.get(draft.id) ?? []).flatMap((override) => {
      if (!draft.evidence_refs.includes(override.id)) return [];
      return [
        {
          tool_id: draft.id,
          source_record_id: sourceRecord.id,
          tool_card_field: String(override.field),
          source_field_path: `override_records.${override.id}.new_value`,
          source_value_preview: previewValue(override.new_value),
          normalized_value_preview: previewValue(draft[override.field]),
          provenance_type: "override_record" as const,
          override_record_id: override.id
        }
      ];
    });

    return [...sourceItems, ...overrideItems];
  });

  return {
    schema_version: "tool_card_field_value_provenance.v1",
    generated_at: generatedAt,
    summary: {
      tool_cards: new Set(items.map((item) => item.tool_id)).size,
      field_values: items.length
    },
    items
  };
}

function groupOverridesByToolId(overrideRecords: OverrideRecord[]): Map<string, OverrideRecord[]> {
  const grouped = new Map<string, OverrideRecord[]>();
  for (const override of overrideRecords) {
    grouped.set(override.target_id, [...(grouped.get(override.target_id) ?? []), override]);
  }
  return grouped;
}

function previewValue(value: unknown): string {
  const serialized = typeof value === "string" ? value : JSON.stringify(value);
  if (!serialized) return "";
  return serialized.length > 160 ? `${serialized.slice(0, 157)}...` : serialized;
}
