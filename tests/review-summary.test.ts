import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReviewSummaryV2,
  renderReviewSummaryV2Markdown,
  verifyReviewSummaryChecksums,
} from "../src/preview/review-summary.js";
import type { ArtifactManifest } from "../src/preview/manifest.js";
import type { DataQualityReport } from "../src/validation/data-quality-report.js";

const manifest: ArtifactManifest = {
  schema_version: "artifact_manifest.v1",
  git_sha: "abc123",
  built_at: "2026-07-10T00:00:00Z",
  data_version: "data-test",
  eval: { passed: 10, total: 10, model: "test", failure_categories: {} },
  source_registry_diff: { added: 2, removed: 1, changed: 1 },
  checksums: { "data/input.json": `sha256:${"a".repeat(64)}` },
};

const quality: DataQualityReport = {
  schema_version: "data_quality_report.v1",
  generated_at: "2026-07-10T00:00:00Z",
  data_version: "data-test",
  tool_cards: { total: 50, by_type: { mcp: 50 } },
  completeness: { required_field_rate: 1, missing: [] },
  provenance: { critical_coverage: 0.9, missing: ["mcp-example:license"] },
  confidence: { low: 0, medium: 10, high: 40, unknown: 0 },
  unknown_fields: { permissions: 0, security: 0, maintenance: 2 },
  duplicates: { candidates: 1, unresolved: 0 },
  conflicts: { total: 2, unresolved: 1, unresolved_critical: 1 },
  urls: { by_status: { reachable: 49, transient_error: 1 }, stale: 1, blocking: 0 },
  review: { parser_warnings: 1, interventions: 1, promotion_blocked: 0 },
  comparison: { status: "compared", deltas: { tool_cards_total: 3 } },
  gates: [{
    reason_code: "critical_provenance_incomplete",
    object_id: "mcp-example",
    evidence_path: "data/field_provenance/tool_card_fields.v2.json",
    suggested_action: "Add provenance.",
    severity: "blocking",
  }],
  status: "blocked",
};

test("review summary v2 puts blocking evidence before warnings and changes", () => {
  const summary = buildReviewSummaryV2({
    manifest,
    dataQualityReport: quality,
    generatedAt: "2026-07-10T00:00:00Z",
  });
  const markdown = renderReviewSummaryV2Markdown(summary);

  assert.equal(summary.schema_version, "review_summary.v2");
  assert.equal(summary.status, "blocked");
  assert.equal(summary.blocking_items[0]?.reason_code, "critical_provenance_incomplete");
  assert.deepEqual(summary.changes.source_registry, { added: 2, removed: 1, changed: 1 });
  assert.equal(summary.changes.tool_cards.added, 3);
  assert.ok(markdown.indexOf("## Blocking") < markdown.indexOf("## Warnings"));
  assert.ok(markdown.indexOf("## Warnings") < markdown.indexOf("## Changes"));
  assert.match(markdown, /data\/field_provenance\/tool_card_fields\.v2\.json/);
});

test("review summary checksum verification detects modified inputs", async () => {
  const distDir = await mkdtemp(join(tmpdir(), "agent-radar-review-summary-"));
  try {
    await mkdir(join(distDir, "data"), { recursive: true });
    await writeFile(join(distDir, "data", "input.json"), "original", "utf8");
    const digest = createHash("sha256").update("original").digest("hex");
    const summary = buildReviewSummaryV2({
      manifest: { ...manifest, checksums: { "data/input.json": `sha256:${digest}` } },
      dataQualityReport: { ...quality, gates: [], status: "pass" },
      generatedAt: "2026-07-10T00:00:00Z",
    });

    await assert.doesNotReject(() => verifyReviewSummaryChecksums(distDir, summary));
    await writeFile(join(distDir, "data", "input.json"), "modified", "utf8");
    await assert.rejects(
      () => verifyReviewSummaryChecksums(distDir, summary),
      /review_summary_checksum_mismatch: data\/input\.json/,
    );
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
