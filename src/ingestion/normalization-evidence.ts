import { createHash } from "node:crypto";
import type { SourceDefinition, SourceRecord, ToolCard } from "../schema.js";

export const NORMALIZER_VERSION = "normalizer.v0.3" as const;

export const CRITICAL_TOOL_CARD_FIELDS = [
  "canonical_identity",
  "type",
  "summary",
  "source_urls",
  "install_methods",
  "permissions",
  "security",
  "maintenance",
  "license",
  "confidence",
] as const;

export type ToolCardFieldTransformation = "copy" | "normalize" | "merge" | "derive" | "override";
export type ToolCardConflictType =
  | "format_difference"
  | "freshness_difference"
  | "confidence_difference"
  | "semantic_conflict"
  | "override";
export type ToolCardConflictResolutionStatus = "resolved" | "unresolved";

export interface ToolCardFieldCandidate {
  tool_id: string;
  tool_card_field: string;
  source_record_id: string;
  source_id: string;
  source_field_path: string;
  source_leaf_paths: string[];
  input_source_field_paths?: string[];
  evidence_state: "source_value" | "derived" | "inspected_absent";
  source_value_preview: unknown;
  source_value_hash: string;
  source_confidence: number;
  source_updated_at?: string;
  fetched_at: string;
  parser_version: string;
  selected: boolean;
}

export interface ToolCardFieldSelection {
  tool_id: string;
  tool_card_field: string;
  normalized_value_preview: unknown;
  transformation_type: ToolCardFieldTransformation;
  normalizer_version: typeof NORMALIZER_VERSION;
  selected_source_record_ids: string[];
  override_record_id?: string;
  override_evidence_urls?: string[];
  override_reason?: string;
  override_created_by?: string;
  override_created_at?: string;
  reason_code:
    | "explicit_override"
    | "official_direct_evidence"
    | "exact_metadata"
    | "higher_source_confidence"
    | "newer_non_empty_evidence"
    | "merged_unique_values"
    | "single_candidate"
    | "derived_from_selected_fields"
    | "unresolved_conflict_fallback";
}

export interface ToolCardFieldConflictDecision {
  conflict_id: string;
  tool_id: string;
  tool_card_field: string;
  critical: boolean;
  conflict_type: ToolCardConflictType;
  candidate_source_record_ids: string[];
  selected_source_record_ids: string[];
  resolution_status: ToolCardConflictResolutionStatus;
  reason_code: string;
}

export interface ToolCardNormalizationEvidence {
  schema_version: "tool_card_normalization_evidence.v1";
  field_candidates: ToolCardFieldCandidate[];
  field_selections: ToolCardFieldSelection[];
  conflicts: ToolCardFieldConflictDecision[];
}

export interface NormalizationOverride {
  id: string;
  target_id: string;
  field: keyof ToolCard;
  reason?: string;
  evidence_urls?: string[];
  created_by?: string;
  created_at?: string;
}

interface CandidateInput {
  field: string;
  path: string;
  value: unknown;
  input_source_field_paths?: string[];
}

interface RecordRank {
  official: number;
  exact: number;
  confidence: number;
  freshness: number;
}

const MERGED_FIELDS = new Set(["source_urls", "install_methods"]);

export function orderSourceRecords(
  records: SourceRecord[],
  sourceDefinitions: SourceDefinition[],
): SourceRecord[] {
  const definitions = new Map(sourceDefinitions.map((source) => [source.id, source]));
  return [...records].sort((left, right) => {
    const comparison = compareRank(recordRank(right, definitions), recordRank(left, definitions));
    return comparison || left.id.localeCompare(right.id);
  });
}

export function buildNormalizationEvidence(
  draft: ToolCard,
  records: SourceRecord[],
  overrides: NormalizationOverride[],
  sourceDefinitions: SourceDefinition[],
): ToolCardNormalizationEvidence {
  const definitions = new Map(sourceDefinitions.map((source) => [source.id, source]));
  const candidates = records.flatMap((record) =>
    candidateInputs(record).map((input) => toCandidate(draft.id, record, input)),
  );
  const selections: ToolCardFieldSelection[] = [];
  const conflicts: ToolCardFieldConflictDecision[] = [];
  const overridesByField = new Map(overrides.map((override) => [override.field as string, override]));

  for (const field of new Set(candidates.map((candidate) => candidate.tool_card_field))) {
    const fieldCandidates = candidates.filter((candidate) => candidate.tool_card_field === field);
    const override = overridesByField.get(field);
    const merged = MERGED_FIELDS.has(field);
    const ranked = [...fieldCandidates].sort((left, right) => {
      const leftRecord = records.find((record) => record.id === left.source_record_id)!;
      const rightRecord = records.find((record) => record.id === right.source_record_id)!;
      const comparison = compareRank(
        recordRank(rightRecord, definitions),
        recordRank(leftRecord, definitions),
      );
      return comparison || left.source_record_id.localeCompare(right.source_record_id);
    });
    const selectedIds = merged
      ? [...new Set(ranked.map((candidate) => candidate.source_record_id))]
      : ranked[0]
        ? [ranked[0].source_record_id]
        : [];
    const conflict = buildConflict(draft.id, field, ranked, records, definitions, selectedIds);
    if (conflict) conflicts.push(conflict);
    if (override) {
      conflicts.push({
        conflict_id: `${draft.id}:${field}:override:${override.id}`,
        tool_id: draft.id,
        tool_card_field: field,
        critical: (CRITICAL_TOOL_CARD_FIELDS as readonly string[]).includes(field),
        conflict_type: "override",
        candidate_source_record_ids: [...new Set(fieldCandidates.map((candidate) => candidate.source_record_id))],
        selected_source_record_ids: selectedIds,
        resolution_status: "resolved",
        reason_code: "explicit_override",
      });
    }

    for (const candidate of fieldCandidates) {
      candidate.selected = selectedIds.includes(candidate.source_record_id);
    }

    selections.push({
      tool_id: draft.id,
      tool_card_field: field,
      normalized_value_preview: readDraftField(draft, field),
      transformation_type: override
        ? "override"
        : merged
          ? "merge"
          : field === "confidence"
            ? "derive"
            : conflict?.conflict_type === "format_difference"
              ? "normalize"
              : "copy",
      normalizer_version: NORMALIZER_VERSION,
      selected_source_record_ids: selectedIds,
      override_record_id: override?.id,
      override_evidence_urls: override?.evidence_urls,
      override_reason: override?.reason,
      override_created_by: override?.created_by,
      override_created_at: override?.created_at,
      reason_code: override
        ? "explicit_override"
        : merged
          ? "merged_unique_values"
          : conflict?.resolution_status === "unresolved"
            ? "unresolved_conflict_fallback"
            : selectionReason(ranked, records, definitions),
    });
  }

  const fallbackRecord = orderSourceRecords(records, sourceDefinitions)[0];
  if (fallbackRecord) {
    for (const field of CRITICAL_TOOL_CARD_FIELDS) {
      if (selections.some((selection) => selection.tool_card_field === field)) continue;
      const candidate = toCandidate(draft.id, fallbackRecord, {
        field,
        path: `derived.${field}`,
        value: readDraftField(draft, field) ?? "unknown",
        input_source_field_paths: fallbackDependencyPaths(field, fallbackRecord),
      });
      candidate.selected = true;
      candidates.push(candidate);
      selections.push({
        tool_id: draft.id,
        tool_card_field: field,
        normalized_value_preview: readDraftField(draft, field) ?? "unknown",
        transformation_type: "derive",
        normalizer_version: NORMALIZER_VERSION,
        selected_source_record_ids: [fallbackRecord.id],
        reason_code: "derived_from_selected_fields",
      });
    }
  }

  return {
    schema_version: "tool_card_normalization_evidence.v1",
    field_candidates: candidates,
    field_selections: selections,
    conflicts,
  };
}

export function mergeNormalizationEvidence(
  artifacts: ToolCardNormalizationEvidence[],
): ToolCardNormalizationEvidence {
  return {
    schema_version: "tool_card_normalization_evidence.v1",
    field_candidates: artifacts.flatMap((artifact) => artifact.field_candidates),
    field_selections: artifacts.flatMap((artifact) => artifact.field_selections),
    conflicts: artifacts.flatMap((artifact) => artifact.conflicts),
  };
}

function candidateInputs(record: SourceRecord): CandidateInput[] {
  if (record.record_type === "manual") return manualCandidateInputs(record);
  const profile = isRecord(record.parsed_fields.source_profile)
    ? record.parsed_fields.source_profile
    : undefined;
  const inputs: CandidateInput[] = [];
  addInput(inputs, "summary", profile?.summary !== undefined ? "parsed_fields.source_profile.summary" : "description", profile?.summary ?? record.description);
  addInput(inputs, "type", "parsed_fields.source_profile.type", profile?.type);
  addInput(inputs, "license", "parsed_fields.license", record.parsed_fields.license);
  addInput(inputs, "permissions", "parsed_fields.source_profile.permissions", profile?.permissions);
  addInput(inputs, "security", "parsed_fields.source_profile.security", profile?.security);
  addInput(inputs, "maintenance", "parsed_fields.source_profile.maintenance", profile?.maintenance);
  addInput(inputs, "install_methods", "parsed_fields.source_profile.install_methods", profile?.install_methods);
  addInput(inputs, "confidence", "source_confidence", record.source_confidence);

  for (const [index, url] of record.urls.entries()) {
    addInput(inputs, "source_urls", `urls[${index}]`, url);
  }
  for (const field of ["repo_url", "package_url", "homepage_url", "docs_url"] as const) {
    addInput(inputs, "source_urls", `parsed_fields.${field}`, record.parsed_fields[field]);
  }

  const repo = readString(record.parsed_fields.repo_url) ?? record.urls.find((url) => url.includes("github.com"));
  const packageUrl = readString(record.parsed_fields.package_url);
  const docs = readString(record.parsed_fields.docs_url);
  addInput(inputs, "canonical_identity", repo ? "parsed_fields.repo_url" : packageUrl ? "parsed_fields.package_url" : "parsed_fields.docs_url", repo ?? packageUrl ?? docs);

  return inputs;
}

function manualCandidateInputs(record: SourceRecord): CandidateInput[] {
  const inputs: CandidateInput[] = [];
  for (const field of CRITICAL_TOOL_CARD_FIELDS) {
    if (field === "canonical_identity" || field === "source_urls") continue;
    addInput(inputs, field, `raw_fields.${field}`, record.raw_fields[field]);
  }
  const sourceUrls = Array.isArray(record.raw_fields.source_urls)
    ? record.raw_fields.source_urls
    : record.urls;
  for (const [index, url] of sourceUrls.entries()) {
    addInput(inputs, "source_urls", `raw_fields.source_urls[${index}]`, url);
  }
  const canonicalIdentity =
    readString(record.raw_fields.repo_url) ??
    (Array.isArray(record.raw_fields.package_urls)
      ? readString(record.raw_fields.package_urls[0])
      : undefined) ??
    readString(record.raw_fields.docs_url) ??
    readString(sourceUrls[0]);
  addInput(inputs, "canonical_identity", "raw_fields.canonical_identity", canonicalIdentity);
  return inputs;
}

function addInput(inputs: CandidateInput[], field: string, path: string, value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  inputs.push({ field, path, value });
}

function toCandidate(toolId: string, record: SourceRecord, input: CandidateInput): ToolCardFieldCandidate {
  const sourceUpdatedAt =
    readString(record.parsed_fields.updated_at) ??
    readString(record.parsed_fields.last_commit_at) ??
    readString(record.parsed_fields.last_release_at);
  return {
    tool_id: toolId,
    tool_card_field: input.field,
    source_record_id: record.id,
    source_id: record.source_id,
    source_field_path: input.path,
    source_leaf_paths: leafPaths(input.path, input.value),
    input_source_field_paths: input.input_source_field_paths,
    evidence_state: input.path.startsWith("derived.")
      ? input.value === "unknown" ? "inspected_absent" : "derived"
      : "source_value",
    source_value_preview: input.value,
    source_value_hash: createHash("sha256").update(stableSerialize(input.value)).digest("hex"),
    source_confidence: confidenceRank(record.source_confidence),
    source_updated_at: sourceUpdatedAt,
    fetched_at: record.parsed_at,
    parser_version: record.parser_version,
    selected: false,
  };
}

function leafPaths(path: string, value: unknown): string[] {
  if (Array.isArray(value)) return value.length === 0 ? [path] : value.flatMap((item, index) => leafPaths(`${path}[${index}]`, item));
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    return entries.length === 0 ? [path] : entries.flatMap(([key, item]) => leafPaths(`${path}.${key}`, item));
  }
  return [path];
}

function fallbackDependencyPaths(field: string, record: SourceRecord): string[] {
  const profile = isRecord(record.parsed_fields.source_profile) ? record.parsed_fields.source_profile : undefined;
  if (profile && field in profile) return leafPaths(`parsed_fields.source_profile.${field}`, profile[field]);
  if (field === "license") return ["raw_fields.license", "parsed_fields.license"];
  if (field === "canonical_identity") return ["parsed_fields.repo_url", "parsed_fields.package_url", "parsed_fields.docs_url"];
  if (field === "source_urls") return record.urls.map((_, index) => `urls[${index}]`);
  if (field === "summary") return ["description"];
  if (field === "confidence") return ["source_confidence"];
  if (field === "install_methods") return ["parsed_fields.repo_url", "parsed_fields.package_url", "parsed_fields.package_name", "parsed_fields.docs_url", "parsed_fields.homepage_url", "source_confidence", "urls"];
  if (field === "maintenance") return ["parsed_fields.last_commit_at", "parsed_fields.last_release_at", "raw_fields.archived", "record_type"];
  if (field === "permissions") return ["parsed_fields.repo_url", "urls"];
  if (field === "type") return ["source_id", "name", "description", "parsed_fields.topics", "parsed_fields.keywords"];
  if (field === "security") return ["record_type", "source_id"];
  return ["record_type", "source_id"];
}

function buildConflict(
  toolId: string,
  field: string,
  candidates: ToolCardFieldCandidate[],
  records: SourceRecord[],
  definitions: Map<string, SourceDefinition>,
  selectedIds: string[],
): ToolCardFieldConflictDecision | undefined {
  if (candidates.length < 2 || MERGED_FIELDS.has(field)) return undefined;
  const rawValues = new Set(candidates.map((candidate) => stableSerialize(candidate.source_value_preview)));
  if (rawValues.size < 2) return undefined;
  const normalizedValues = new Set(candidates.map((candidate) => comparableValue(candidate.source_value_preview)));
  const firstRecord = records.find((record) => record.id === candidates[0]?.source_record_id)!;
  const secondRecord = records.find((record) => record.id === candidates[1]?.source_record_id)!;
  const firstRank = recordRank(firstRecord, definitions);
  const secondRank = recordRank(secondRecord, definitions);
  const sameRank = compareRank(firstRank, secondRank) === 0;
  const conflictType: ToolCardConflictType =
    normalizedValues.size === 1
      ? "format_difference"
      : firstRank.official !== secondRank.official || firstRank.exact !== secondRank.exact || firstRank.confidence !== secondRank.confidence
        ? "confidence_difference"
        : firstRank.freshness !== secondRank.freshness
          ? "freshness_difference"
          : "semantic_conflict";
  const unresolved = normalizedValues.size > 1 && sameRank;
  return {
    conflict_id: `${toolId}:${field}`,
    tool_id: toolId,
    tool_card_field: field,
    critical: (CRITICAL_TOOL_CARD_FIELDS as readonly string[]).includes(field),
    conflict_type: conflictType,
    candidate_source_record_ids: [...new Set(candidates.map((candidate) => candidate.source_record_id))],
    selected_source_record_ids: selectedIds,
    resolution_status: unresolved ? "unresolved" : "resolved",
    reason_code: unresolved ? "equal_rank_semantic_conflict" : normalizedValues.size === 1 ? "normalized_values_match" : selectionReason(candidates, records, definitions),
  };
}

function selectionReason(
  candidates: ToolCardFieldCandidate[],
  records: SourceRecord[],
  definitions: Map<string, SourceDefinition>,
): ToolCardFieldSelection["reason_code"] {
  if (candidates.length <= 1) return "single_candidate";
  const first = records.find((record) => record.id === candidates[0]?.source_record_id)!;
  const second = records.find((record) => record.id === candidates[1]?.source_record_id)!;
  const firstRank = recordRank(first, definitions);
  const secondRank = recordRank(second, definitions);
  if (firstRank.official > secondRank.official) return "official_direct_evidence";
  if (firstRank.exact > secondRank.exact) return "exact_metadata";
  if (firstRank.confidence > secondRank.confidence) return "higher_source_confidence";
  if (firstRank.freshness > secondRank.freshness) return "newer_non_empty_evidence";
  return "unresolved_conflict_fallback";
}

function recordRank(record: SourceRecord, definitions: Map<string, SourceDefinition>): RecordRank {
  const definition = definitions.get(record.source_id);
  return {
    official: definition?.trust_level === "official" ? 1 : 0,
    exact: isExactMetadataSource(record, definition) ? 1 : 0,
    confidence: confidenceRank(record.source_confidence),
    freshness: Date.parse(record.parsed_at) || 0,
  };
}

function isExactMetadataSource(record: SourceRecord, definition: SourceDefinition | undefined): boolean {
  if (record.record_type !== "repository" && record.record_type !== "package" && record.record_type !== "doc_page") {
    return false;
  }
  if (!definition) return false;
  if (definition.source_type === "community_list" || definition.source_type === "news") return false;
  if (definition.url.includes("/topics/") || definition.id.includes("topic")) return false;
  return true;
}

function compareRank(left: RecordRank, right: RecordRank): number {
  return (
    left.official - right.official ||
    left.exact - right.exact ||
    left.confidence - right.confidence ||
    left.freshness - right.freshness
  );
}

function confidenceRank(confidence: SourceRecord["source_confidence"]): number {
  if (confidence === "high") return 1;
  if (confidence === "medium") return 0.66;
  if (confidence === "low") return 0.33;
  return 0;
}

function readDraftField(draft: ToolCard, field: string): unknown {
  if (field === "canonical_identity") return draft.repo_url ?? draft.package_urls?.[0] ?? draft.docs_url;
  return (draft as unknown as Record<string, unknown>)[field];
}

function comparableValue(value: unknown): string {
  if (typeof value === "string") return value.trim().toLowerCase();
  return stableSerialize(value);
}

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
