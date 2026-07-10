import type { SourceRecord, ToolCard } from "../schema.js";
import type { OverrideRecord } from "./normalizer.js";
import {
  CRITICAL_TOOL_CARD_FIELDS,
  type ToolCardFieldCandidate,
  type ToolCardFieldSelection,
  type ToolCardNormalizationEvidence,
} from "./normalization-evidence.js";

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

export interface ToolCardFieldValueProvenanceV2 {
  schema_version: "tool_card_field_value_provenance.v2";
  generated_at: string;
  normalizer_version: "normalizer.v0.3";
  critical_fields: string[];
  items: Array<ToolCardFieldSelection & {
    candidates: ToolCardFieldCandidate[];
    evidence_refs: string[];
  }>;
  summary: {
    published_tool_count: number;
    required_selection_count: number;
    covered_selection_count: number;
    critical_coverage: number;
  };
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

export function buildToolCardFieldValueProvenanceV2(
  drafts: ToolCard[],
  normalizationEvidence: ToolCardNormalizationEvidence,
  generatedAt: string,
): ToolCardFieldValueProvenanceV2 {
  const selectionsByKey = new Map(
    normalizationEvidence.field_selections.map((selection) => [
      `${selection.tool_id}:${selection.tool_card_field}`,
      selection,
    ]),
  );
  const candidatesByKey = groupCandidates(normalizationEvidence.field_candidates);
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
  const items = drafts.flatMap((draft) =>
    CRITICAL_TOOL_CARD_FIELDS.flatMap((field) => {
      const key = `${draft.id}:${field}`;
      const selection = selectionsByKey.get(key);
      if (!selection) return [];
      return [{
        ...selection,
        normalized_value_preview: redactPreview(selection.normalized_value_preview),
        candidates: (candidatesByKey.get(key) ?? []).map((candidate) => ({
          ...candidate,
          source_value_preview: redactPreview(candidate.source_value_preview),
        })),
        evidence_refs: draftsById.get(draft.id)?.evidence_refs ?? [],
      }];
    }),
  );
  const requiredSelectionCount = drafts.length * CRITICAL_TOOL_CARD_FIELDS.length;
  const coveredSelectionCount = items.filter(
    (item) => item.candidates.length > 0 || item.override_record_id,
  ).length;

  return {
    schema_version: "tool_card_field_value_provenance.v2",
    generated_at: generatedAt,
    normalizer_version: "normalizer.v0.3",
    critical_fields: [...CRITICAL_TOOL_CARD_FIELDS],
    items,
    summary: {
      published_tool_count: drafts.length,
      required_selection_count: requiredSelectionCount,
      covered_selection_count: coveredSelectionCount,
      critical_coverage: requiredSelectionCount === 0 ? 1 : coveredSelectionCount / requiredSelectionCount,
    },
  };
}

function groupCandidates(candidates: ToolCardFieldCandidate[]): Map<string, ToolCardFieldCandidate[]> {
  const grouped = new Map<string, ToolCardFieldCandidate[]>();
  for (const candidate of candidates) {
    const key = `${candidate.tool_id}:${candidate.tool_card_field}`;
    grouped.set(key, [...(grouped.get(key) ?? []), candidate]);
  }
  return grouped;
}

function redactPreview(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/(authorization\s*:\s*(?:bearer\s+)?)[^\s,;]+/gi, "$1[REDACTED]")
      .replace(/((?:api[_-]?key|token|cookie|password)\s*[=:]\s*)[^\s,;]+/gi, "$1[REDACTED]");
  }
  if (Array.isArray(value)) return value.map(redactPreview);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        /authorization|api[_-]?key|token|cookie|password/i.test(key) ? "[REDACTED]" : redactPreview(item),
      ]),
    );
  }
  return value;
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
