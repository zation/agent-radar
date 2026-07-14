import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildReviewSummaryV2,
  renderReviewSummaryV2Markdown,
  verifyFinalArtifactManifest,
  verifyReviewSummaryChecksums,
} from "../src/preview/review-summary.js";
import type { ArtifactManifest } from "../src/preview/manifest.js";
import type { DataQualityReport } from "../src/validation/data-quality-report.js";
import { EvalTokenUsageCollector } from "../src/eval/token-usage.js";

const manifest: ArtifactManifest = {
  schema_version: "artifact_manifest.v1",
  git_sha: "abc123",
  built_at: "2026-07-10T00:00:00Z",
  data_version: "data-test",
  eval: { passed: 10, total: 10, model: "test", failure_categories: {} },
  eval_token_usage: {
    schema_version: "eval_token_usage.v1",
    providers: [{ provider: "openai", model_identifier: "gpt-4.1" }],
    case_count: 1,
    request_attempts: 1,
    reported_attempts: 1,
    unavailable_attempts: 0,
    retry_count: 0,
    input_tokens: 10,
    cached_input_tokens: 0,
    cached_usage_available_attempts: 0,
    output_tokens: 2,
    total_tokens: 12,
    average_total_tokens_per_reported_attempt: 12,
    highest_usage_cases: [{ case_id: "gq-a", total_tokens: 12 }],
  },
  source_registry_diff: { added: 2, removed: 1, changed: 1 },
  feedback: {
    rules_version: "feedback_rules.v0.1", vote_snapshot_checksum: `sha256:${"b".repeat(64)}`,
    processing_plan_checksum: `sha256:${"c".repeat(64)}`, d1_rows: 4, affected_tools: 2,
    accepted: 1, rejected: 1, needs_human_review: 1, deprecated: 1, max_absolute_adjustment: 1.2,
  },
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
  assert.equal(summary.summaries.feedback.max_absolute_adjustment, 1.2);
  assert.ok(markdown.indexOf("## Blocking") < markdown.indexOf("## Warnings"));
  assert.ok(markdown.indexOf("## Warnings") < markdown.indexOf("## Changes"));
  assert.match(markdown, /data\/field_provenance\/tool_card_fields\.v2\.json/);
  assert.match(markdown, /Feedback: 4 D1 rows, 2 affected Tools/);
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

test("review summary includes actionable non-blocking URL and validation evidence", () => {
  const summary = buildReviewSummaryV2({
    manifest: {
      ...manifest,
      promotion_check: { candidates: 50, ready_for_publish: 50, blocked: 0, duplicate_tool_ids: 0, validation_errors: 0, validation_warnings: 2, passed: true },
      ingestion_review: { approvals: { approved: 0, rejected: 0, needs_changes: 0 }, overrides: 1 },
    },
    dataQualityReport: {
      ...quality,
      conflicts: { total: 1, unresolved: 1, unresolved_critical: 0 },
      urls: { by_status: { reachable: 48, auth_required: 1, rate_limited: 1 }, stale: 0, blocking: 0 },
      gates: [],
      status: "pass",
    },
    generatedAt: "2026-07-10T00:00:00Z",
  });

  assert.deepEqual(summary.warning_items.map((item) => item.reason_code), [
    "parser_warning",
    "auth_required_url",
    "rate_limited_url",
    "noncritical_unresolved_conflict",
    "validation_warning",
    "override_applied",
  ]);
});

test("final manifest verifier detects Review Summary tampering", async () => {
  const distDir = await mkdtemp(join(tmpdir(), "agent-radar-final-manifest-"));
  try {
    await mkdir(join(distDir, "data"), { recursive: true });
    await mkdir(join(distDir, "reports"), { recursive: true });
    await writeFile(join(distDir, "data", "input.json"), "input", "utf8");
    const release = { release_id: "all-v0.7.0-test", commit_sha: "abc123" };
    const collector = new EvalTokenUsageCollector({ caseIds: ["gq-a"], generatedAt: "2026-07-10T00:00:00Z", release });
    collector.record({ case_id: "gq-a", attempt: 1, provider: "openai", model_identifier: "gpt-4.1", outcome: "completed", failure_category: "none", usage: { status: "reported", input_tokens: 10, cached_input_tokens: null, output_tokens: 2, total_tokens: 12 } });
    const usageText = JSON.stringify(collector.build([{ case_id: "gq-a", execution_status: "completed" }]), null, 2);
    const evalText = JSON.stringify({ passed: 1, total: 1, release, results: [{ case_id: "gq-a", failure_category: "none" }] }, null, 2);
    await writeFile(join(distDir, "data", "eval_summary.json"), evalText);
    await writeFile(join(distDir, "reports", "eval_token_usage.json"), usageText);
    const inputDigest = createHash("sha256").update("input").digest("hex");
    const summary = buildReviewSummaryV2({
      manifest: { ...manifest, checksums: { "data/input.json": `sha256:${inputDigest}` } },
      dataQualityReport: { ...quality, gates: [], status: "pass" },
      generatedAt: "2026-07-10T00:00:00Z",
    });
    const summaryText = JSON.stringify(summary, null, 2);
    const markdown = renderReviewSummaryV2Markdown(summary);
    await writeFile(join(distDir, "data", "review_summary.v2.json"), summaryText);
    await writeFile(join(distDir, "reports", "review_summary.v2.md"), markdown);
    const checksums = Object.fromEntries([
      ["data/input.json", "input"],
      ["data/eval_summary.json", evalText],
      ["data/review_summary.v2.json", summaryText],
      ["reports/eval_token_usage.json", usageText],
      ["reports/review_summary.v2.md", markdown],
    ].map(([path, value]) => [path, `sha256:${createHash("sha256").update(value).digest("hex")}`]));
    const finalManifest = { ...manifest, checksums };
    await writeFile(join(distDir, "artifact-manifest.json"), JSON.stringify(finalManifest));

    await assert.doesNotReject(() => verifyFinalArtifactManifest(distDir));
    await writeFile(join(distDir, "data", "unexpected.json"), "{}");
    await assert.rejects(() => verifyFinalArtifactManifest(distDir), /artifact_manifest_unexpected_file: data\/unexpected\.json/);
    await rm(join(distDir, "data", "unexpected.json"));
    await writeFile(join(distDir, "data", "review_summary.v2.json"), `${summaryText}\n`);
    await assert.rejects(() => verifyFinalArtifactManifest(distDir), /artifact_manifest_checksum_mismatch: data\/review_summary\.v2\.json/);
    await writeFile(join(distDir, "data", "review_summary.v2.json"), summaryText);
    const tamperedUsage = JSON.parse(usageText) as { summary: { total_tokens: number } };
    tamperedUsage.summary.total_tokens += 1;
    const tamperedUsageText = JSON.stringify(tamperedUsage, null, 2);
    await writeFile(join(distDir, "reports", "eval_token_usage.json"), tamperedUsageText);
    finalManifest.checksums["reports/eval_token_usage.json"] = `sha256:${createHash("sha256").update(tamperedUsageText).digest("hex")}`;
    await writeFile(join(distDir, "artifact-manifest.json"), JSON.stringify(finalManifest));
    await assert.rejects(() => verifyFinalArtifactManifest(distDir), /eval_token_usage.*total_tokens.*mismatch/);
  } finally {
    await rm(distDir, { recursive: true, force: true });
  }
});
