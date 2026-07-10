import { createHash } from "node:crypto";
import type { ToolCard } from "../schema.js";

export interface DataQualityGateItem {
  reason_code: string;
  object_id: string;
  evidence_path: string;
  suggested_action: string;
  severity: "warning" | "blocking";
}

export interface DataQualityReport {
  schema_version: "data_quality_report.v1";
  generated_at: string;
  data_version: string;
  tool_cards: { total: number; by_type: Record<string, number>; fingerprints?: Record<string, string> };
  completeness: { required_field_rate: number; missing: string[] };
  provenance: { critical_coverage: number; missing: string[] };
  confidence: { low: number; medium: number; high: number; unknown: number };
  unknown_fields: { permissions: number; security: number; maintenance: number };
  duplicates: { candidates: number; unresolved: number };
  conflicts: { total: number; unresolved: number; unresolved_critical: number };
  urls: { by_status: Record<string, number>; stale: number; blocking: number };
  review: { parser_warnings: number; interventions: number; promotion_blocked: number };
  comparison: { status: "compared" | "no_baseline"; deltas: Record<string, number> };
  gates: DataQualityGateItem[];
  status: "pass" | "blocked";
}

export interface BuildDataQualityReportOptions {
  toolCards: ToolCard[];
  fieldProvenanceV2: {
    summary: { critical_coverage: number };
    items: Array<{
      tool_id?: string;
      tool_card_field?: string;
      candidates?: unknown[];
      override_record_id?: string;
    }>;
  };
  conflictReport: {
    summary: { unresolved: number; unresolved_critical: number };
    items: unknown[];
  };
  urlValidationV2: {
    options?: { enabled: boolean };
    summary: Record<string, number> & { blocking: number; stale: number };
    items: unknown[];
  };
  validation: {
    summary: { errors: number; warnings: number };
    errors: string[];
    warnings: string[];
  };
  duplicateCandidates: number;
  unresolvedDuplicates: number;
  parserWarnings: number;
  interventions: number;
  promotionBlocked: number;
  dataVersion: string;
  generatedAt: string;
  previousReport?: DataQualityReport;
  coverageRange?: { min: number; max: number };
  requireUrlValidation?: boolean;
}

const REQUIRED_FIELDS = [
  "id",
  "name",
  "type",
  "summary",
  "source_urls",
  "install_methods",
  "permissions",
  "security",
  "maintenance",
  "use_cases",
  "not_for",
  "confidence",
] as const;

export function buildDataQualityReport(options: BuildDataQualityReportOptions): DataQualityReport {
  const missingRequired = options.toolCards.flatMap((card) =>
    REQUIRED_FIELDS.flatMap((field) => hasRequiredField(card, field) ? [] : [`${card.id}:${field}`]),
  );
  const requiredCount = options.toolCards.length * REQUIRED_FIELDS.length;
  const provenanceMissing = options.fieldProvenanceV2.items
    .filter((item) => !(item.candidates?.length || item.override_record_id))
    .map((item) => `${item.tool_id ?? "unknown"}:${item.tool_card_field ?? "unknown"}`);
  const byType = countBy(options.toolCards.map((card) => card.type));
  const confidence = {
    low: options.toolCards.filter((card) => card.confidence === "low").length,
    medium: options.toolCards.filter((card) => card.confidence === "medium").length,
    high: options.toolCards.filter((card) => card.confidence === "high").length,
    unknown: options.toolCards.filter((card) => card.confidence === "unknown").length,
  };
  const gates = buildGates(options);
  const baseMetrics = {
    tool_cards_total: options.toolCards.length,
    required_field_rate: requiredCount === 0 ? 1 : (requiredCount - missingRequired.length) / requiredCount,
    critical_provenance_coverage: options.fieldProvenanceV2.summary.critical_coverage,
    unresolved_duplicates: options.unresolvedDuplicates,
    unresolved_critical_conflicts: options.conflictReport.summary.unresolved_critical,
    blocking_urls: options.urlValidationV2.summary.blocking,
    interventions: options.interventions,
    promotion_blocked: options.promotionBlocked,
  };

  const fingerprints = Object.fromEntries(options.toolCards.map((card) => [card.id, fingerprint(card)]));
  const comparison = options.previousReport
    ? {
        status: "compared" as const,
        deltas: {
          ...compareMetrics(baseMetrics, reportMetrics(options.previousReport)),
          ...compareToolCardFingerprints(fingerprints, options.previousReport.tool_cards.fingerprints),
        },
      }
    : { status: "no_baseline" as const, deltas: {} };

  return {
    schema_version: "data_quality_report.v1",
    generated_at: options.generatedAt,
    data_version: options.dataVersion,
    tool_cards: { total: options.toolCards.length, by_type: byType, fingerprints },
    completeness: {
      required_field_rate: baseMetrics.required_field_rate,
      missing: missingRequired,
    },
    provenance: {
      critical_coverage: options.fieldProvenanceV2.summary.critical_coverage,
      missing: provenanceMissing,
    },
    confidence,
    unknown_fields: {
      permissions: options.toolCards.filter((card) =>
        card.permissions.some((permission) => permission.scope === "unknown" || permission.access === "unknown"),
      ).length,
      security: options.toolCards.filter((card) => card.security.risk_level === "unknown").length,
      maintenance: options.toolCards.filter((card) => card.maintenance.status === "unknown").length,
    },
    duplicates: {
      candidates: options.duplicateCandidates,
      unresolved: options.unresolvedDuplicates,
    },
    conflicts: {
      total: options.conflictReport.items.length,
      unresolved: options.conflictReport.summary.unresolved,
      unresolved_critical: options.conflictReport.summary.unresolved_critical,
    },
    urls: {
      by_status: Object.fromEntries(
        ["reachable", "permanent_failure", "auth_required", "rate_limited", "transient_error", "skipped"]
          .map((status) => [status, options.urlValidationV2.summary[status] ?? 0]),
      ),
      stale: options.urlValidationV2.summary.stale,
      blocking: options.urlValidationV2.summary.blocking,
    },
    review: {
      parser_warnings: options.parserWarnings,
      interventions: options.interventions,
      promotion_blocked: options.promotionBlocked,
    },
    comparison,
    gates,
    status: gates.some((gate) => gate.severity === "blocking") ? "blocked" : "pass",
  };
}

export function assertDataQualityReport(report: DataQualityReport): void {
  const blocking = report.gates.filter((gate) => gate.severity === "blocking");
  if (report.status === "blocked" || blocking.length > 0) {
    throw new Error(`data_quality_blocked: ${blocking.map((gate) => gate.reason_code).join(",")}`);
  }
}

function buildGates(options: BuildDataQualityReportOptions): DataQualityGateItem[] {
  const gates: DataQualityGateItem[] = [];
  if (
    options.coverageRange &&
    (options.toolCards.length < options.coverageRange.min || options.toolCards.length > options.coverageRange.max)
  ) {
    gates.push(gate("tool_card_coverage_out_of_range", "tool_cards", "data/tool_cards.jsonl", `Keep reliable Tool Cards between ${options.coverageRange.min} and ${options.coverageRange.max}.`));
  }
  if (options.fieldProvenanceV2.summary.critical_coverage !== 1) {
    gates.push(gate("critical_provenance_incomplete", "tool_cards", "data/field_provenance/tool_card_fields.v2.json", "Add source-backed or explicit unknown provenance for every critical field."));
  }
  if (options.conflictReport.summary.unresolved_critical > 0) {
    gates.push(gate("unresolved_critical_field_conflict", "tool_cards", "data/conflicts/tool_card_conflicts.json", "Resolve each critical conflict or add an evidence-backed Override Record."));
  }
  if (options.unresolvedDuplicates > 0) {
    gates.push(gate("unresolved_duplicate", "tool_cards", "data/dedup/tool_card_duplicates.json", "Resolve duplicate identities before promotion."));
  }
  if (options.requireUrlValidation && options.urlValidationV2.options?.enabled !== true) {
    gates.push(gate("url_validation_disabled", "tool_cards", "data/tool_card_url_validation.v2.json", "Enable URL validation for the reviewed release build."));
  }
  if (options.urlValidationV2.summary.blocking > 0) {
    gates.push(gate("blocking_url_validation", "tool_cards", "data/tool_card_url_validation.v2.json", "Repair or replace blocking evidence URLs."));
  }
  if (options.validation.summary.errors > 0) {
    gates.push(gate("tool_card_validation_failed", "tool_cards", "data/tool_card_validation.json", "Fix all deterministic Tool Card validation errors."));
  }
  if (options.interventions > 0) {
    gates.push(gate("pending_intervention", "tool_cards", "data/intervention_requests/tool_card_drafts.json", "Resolve all pending intervention requests."));
  }
  if (options.promotionBlocked > 0) {
    gates.push(gate("promotion_blocked", "tool_cards", "data/promotion_candidates/promotion_check.json", "Resolve all blocked promotion candidates."));
  }
  return gates;
}

function gate(reasonCode: string, objectId: string, evidencePath: string, suggestedAction: string): DataQualityGateItem {
  return {
    reason_code: reasonCode,
    object_id: objectId,
    evidence_path: evidencePath,
    suggested_action: suggestedAction,
    severity: "blocking",
  };
}

function reportMetrics(report: DataQualityReport): Record<string, number> {
  return {
    tool_cards_total: report.tool_cards.total,
    required_field_rate: report.completeness.required_field_rate,
    critical_provenance_coverage: report.provenance.critical_coverage,
    unresolved_duplicates: report.duplicates.unresolved,
    unresolved_critical_conflicts: report.conflicts.unresolved_critical,
    blocking_urls: report.urls.blocking,
    interventions: report.review.interventions,
    promotion_blocked: report.review.promotion_blocked,
  };
}

function compareMetrics(current: Record<string, number>, previous: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(current).map(([key, value]) => [key, value - (previous[key] ?? 0)]),
  );
}

function compareToolCardFingerprints(current: Record<string, string>, previous?: Record<string, string>): Record<string, number> {
  if (!previous) return {};
  const currentIds = new Set(Object.keys(current));
  const previousIds = new Set(Object.keys(previous));
  return {
    tool_cards_added: [...currentIds].filter((id) => !previousIds.has(id)).length,
    tool_cards_removed: [...previousIds].filter((id) => !currentIds.has(id)).length,
    tool_cards_changed: [...currentIds].filter((id) => previous[id] !== undefined && previous[id] !== current[id]).length,
  };
}

function fingerprint(card: ToolCard): string {
  const {
    created_at: _createdAt,
    updated_at: _updatedAt,
    last_checked_at: _lastCheckedAt,
    evidence_refs: _evidenceRefs,
    ...semanticCard
  } = card;
  return `sha256:${createHash("sha256").update(JSON.stringify(semanticCard)).digest("hex")}`;
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) counts[value] = (counts[value] ?? 0) + 1;
  return counts;
}

function hasRequiredField(card: ToolCard, field: (typeof REQUIRED_FIELDS)[number]): boolean {
  const value = card[field];
  if (typeof value === "string") return value.trim().length > 0;
  if (field === "permissions") return Array.isArray(value);
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null;
}
