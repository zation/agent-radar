import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DataQualityGateItem, DataQualityReport } from "../validation/data-quality-report.js";
import type { ArtifactManifest } from "./manifest.js";

export interface ReviewSummaryActionItem {
  reason_code: string;
  object_id: string;
  evidence_path: string;
  suggested_action: string;
}

export interface ReviewSummaryV2 {
  schema_version: "review_summary.v2";
  generated_at: string;
  data_version: string;
  git_sha: string;
  rule_versions: Record<string, string>;
  artifact_checksums: Record<string, string>;
  changes: {
    source_registry: { added: number; removed: number; changed: number };
    tool_cards: { added: number; removed: number; changed: number };
  };
  summaries: {
    provenance: Record<string, number>;
    conflicts: Record<string, number>;
    urls: Record<string, number>;
    duplicates: Record<string, number>;
    interventions: Record<string, number>;
    validation: Record<string, number>;
    auto_review: Record<string, number>;
    release_admission: Record<string, number>;
    promotion: Record<string, number>;
  };
  blocking_items: ReviewSummaryActionItem[];
  warning_items: ReviewSummaryActionItem[];
  status: "pass" | "blocked";
}

export interface BuildReviewSummaryV2Options {
  manifest: ArtifactManifest;
  dataQualityReport: DataQualityReport;
  generatedAt: string;
}

export function buildReviewSummaryV2(options: BuildReviewSummaryV2Options): ReviewSummaryV2 {
  const { manifest, dataQualityReport: quality } = options;
  const toolDelta = quality.comparison.status === "compared"
    ? quality.comparison.deltas.tool_cards_total ?? 0
    : quality.tool_cards.total;
  const warningItems = buildWarnings(quality, manifest);
  const blockingItems = quality.gates
    .filter((gate) => gate.severity === "blocking")
    .map(toActionItem);

  return {
    schema_version: "review_summary.v2",
    generated_at: options.generatedAt,
    data_version: manifest.data_version,
    git_sha: manifest.git_sha,
    rule_versions: {
      normalizer: "normalizer.v0.3",
      provenance: "tool_card_field_value_provenance.v2",
      url_validation: "tool_card_url_validation.v2",
      data_quality: "data_quality_report.v1",
    },
    artifact_checksums: { ...manifest.checksums },
    changes: {
      source_registry: manifest.source_registry_diff ?? { added: 0, removed: 0, changed: 0 },
      tool_cards: {
        added: Math.max(0, toolDelta),
        removed: Math.max(0, -toolDelta),
        changed: 0,
      },
    },
    summaries: {
      provenance: {
        critical_coverage: quality.provenance.critical_coverage,
        missing: quality.provenance.missing.length,
      },
      conflicts: {
        total: quality.conflicts.total,
        unresolved: quality.conflicts.unresolved,
        unresolved_critical: quality.conflicts.unresolved_critical,
      },
      urls: {
        ...quality.urls.by_status,
        stale: quality.urls.stale,
        blocking: quality.urls.blocking,
      },
      duplicates: {
        candidates: quality.duplicates.candidates,
        unresolved: quality.duplicates.unresolved,
      },
      interventions: { pending: quality.review.interventions },
      validation: {
        errors: quality.gates.filter((gate) => gate.reason_code === "tool_card_validation_failed").length,
      },
      auto_review: manifest.auto_review ?? {},
      release_admission: manifest.release_admission ?? {},
      promotion: manifest.promotion_check
        ? {
            candidates: manifest.promotion_check.candidates,
            ready_for_publish: manifest.promotion_check.ready_for_publish,
            blocked: manifest.promotion_check.blocked,
            duplicate_tool_ids: manifest.promotion_check.duplicate_tool_ids,
            validation_errors: manifest.promotion_check.validation_errors,
            validation_warnings: manifest.promotion_check.validation_warnings,
          }
        : {},
    },
    blocking_items: blockingItems,
    warning_items: warningItems,
    status: blockingItems.length > 0 ? "blocked" : "pass",
  };
}

export function renderReviewSummaryV2Markdown(summary: ReviewSummaryV2): string {
  const lines = [
    "# Review Summary v2",
    "",
    `- Status: ${summary.status === "pass" ? "PASS" : "BLOCKED"}`,
    `- Data version: \`${summary.data_version}\``,
    `- Git SHA: \`${summary.git_sha}\``,
    `- Input checksums: ${Object.keys(summary.artifact_checksums).length}`,
    "",
    "## Blocking",
    ...renderActionItems(summary.blocking_items, "None."),
    "",
    "## Warnings",
    ...renderActionItems(summary.warning_items, "None."),
    "",
    "## Changes",
    `- Source Registry: +${summary.changes.source_registry.added} / -${summary.changes.source_registry.removed} / ${summary.changes.source_registry.changed} changed`,
    `- Tool Cards: +${summary.changes.tool_cards.added} / -${summary.changes.tool_cards.removed} / ${summary.changes.tool_cards.changed} changed`,
    "",
    "## Artifact Paths",
    "- `data/field_provenance/tool_card_fields.v2.json`",
    "- `data/conflicts/tool_card_conflicts.json`",
    "- `data/tool_card_url_validation.v2.json`",
    "- `data/data_quality_report.json`",
  ];
  return `${lines.join("\n")}\n`;
}

export async function verifyReviewSummaryChecksums(
  distDir: string,
  summary: ReviewSummaryV2,
): Promise<void> {
  for (const [relativePath, expected] of Object.entries(summary.artifact_checksums)) {
    const content = await readFile(join(distDir, relativePath));
    const actual = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    if (actual !== expected) {
      throw new Error(`review_summary_checksum_mismatch: ${relativePath}`);
    }
  }
}

function buildWarnings(quality: DataQualityReport, manifest: ArtifactManifest): ReviewSummaryActionItem[] {
  const warnings: ReviewSummaryActionItem[] = [];
  if (quality.review.parser_warnings > 0) {
    warnings.push(warning("parser_warning", "source_records", "data/source_records", "Review parser warnings before expanding source coverage."));
  }
  if (quality.urls.stale > 0) {
    warnings.push(warning("stale_url_evidence", "tool_cards", "data/tool_card_url_validation.v2.json", "Refresh stale URL evidence."));
  }
  if ((quality.urls.by_status.transient_error ?? 0) > 0) {
    warnings.push(warning("transient_url_error", "tool_cards", "data/tool_card_url_validation.v2.json", "Review transient URL failures and their history."));
  }
  if ((manifest.source_registry_review_requests?.pending_review ?? 0) > 0) {
    warnings.push(warning("source_registry_review_pending", "source_registry", "data/source_registry_review_requests.json", "Complete Source Registry production review."));
  }
  return warnings;
}

function warning(reasonCode: string, objectId: string, evidencePath: string, suggestedAction: string): ReviewSummaryActionItem {
  return { reason_code: reasonCode, object_id: objectId, evidence_path: evidencePath, suggested_action: suggestedAction };
}

function toActionItem(gate: DataQualityGateItem): ReviewSummaryActionItem {
  return {
    reason_code: gate.reason_code,
    object_id: gate.object_id,
    evidence_path: gate.evidence_path,
    suggested_action: gate.suggested_action,
  };
}

function renderActionItems(items: ReviewSummaryActionItem[], empty: string): string[] {
  if (items.length === 0) return [`- ${empty}`];
  return items.map((item) =>
    `- \`${item.reason_code}\` ${item.object_id}: ${item.suggested_action} Evidence: \`${item.evidence_path}\``
  );
}
