import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreviewBundle } from "../src/preview/bundle.js";
import { renderIngestionReviewMarkdown } from "../src/preview/ingestion-review.js";
import { buildArtifactManifest } from "../src/preview/manifest.js";
import type { RunIngestionResult } from "../src/ingestion/run.js";

const ingestionResult: RunIngestionResult = {
  snapshots: [
    {
      id: "manual-agent-radar-seed-20260707-abc123",
      schema_version: "raw_snapshot.v1",
      source_id: "manual-agent-radar-seed",
      source_url: "internal://manual-review/seed-tool-cards",
      fetched_at: "2026-07-07T00:00:00Z",
      fetch_method: "manual",
      status: "success",
      http_status: 200,
      content_type: "application/json",
      content_hash: "sha256:abc123",
      content_path: "data/raw/manual-agent-radar-seed/2026-07-07/abc123.json",
      request_meta: {}
    }
  ],
  sourceRecords: [
    {
      id: "manual-agent-radar-seed-agent-codex-20260707",
      schema_version: "source_record.v1",
      snapshot_id: "manual-agent-radar-seed-20260707-abc123",
      source_id: "manual-agent-radar-seed",
      record_type: "manual",
      name: "Codex",
      urls: ["https://developers.openai.com/codex"],
      raw_fields: { id: "agent-codex" },
      parsed_fields: { tool_id: "agent-codex", type: "agent" },
      source_confidence: "high",
      parsed_at: "2026-07-07T00:00:00Z",
      parser_version: "manual_seed_parser.v1",
      warnings: []
    }
  ],
  toolCardDrafts: [],
  overrideRecords: [],
  duplicateReport: {
    schema_version: "tool_card_duplicate_report.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total_drafts: 0,
      possible_duplicates: 0
    },
    items: []
  },
  reviewQueue: {
    schema_version: "tool_card_review_queue.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 0,
      ready_for_review: 0,
      blocked_validation: 0
    },
    items: []
  }
};

test("renders ingestion review markdown for preview reviewers", () => {
  const markdown = renderIngestionReviewMarkdown(ingestionResult);

  assert.match(markdown, /^# Ingestion Review/m);
  assert.match(markdown, /manual-agent-radar-seed/);
  assert.match(markdown, /Codex/);
  assert.match(markdown, /https:\/\/developers.openai.com\/codex/);
  assert.match(markdown, /Review ready: 0/);
});

test("builds artifact manifest with checksums and eval summary", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-preview-"));

  try {
    await mkdir(join(outputDir, "data"), { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<html></html>", "utf8");
    await writeFile(join(outputDir, "data", "manifest.json"), JSON.stringify({ data_version: "data-test" }), "utf8");
    await writeFile(
      join(outputDir, "data", "eval_summary.json"),
      JSON.stringify({
        passed: 1,
        total: 3,
        results: [
          { case_id: "a", passed: true, failure_category: "none", failures: [], recommended_action: "use", top_tool_ids: ["tool-a"] },
          { case_id: "b", passed: false, failure_category: "blocked_no_key", failures: ["missing key"], recommended_action: "blocked", top_tool_ids: [] },
          { case_id: "c", passed: false, failure_category: "quality_failure", failures: ["missing tag"], recommended_action: "use", top_tool_ids: ["tool-c"] }
        ]
      }),
      "utf8"
    );

    const manifest = await buildArtifactManifest({
      distDir: outputDir,
      gitSha: "abc123",
      builtAt: "2026-07-07T00:00:00Z",
      providerModel: "deepseek-v4-flash"
    });

    assert.equal(manifest.schema_version, "artifact_manifest.v1");
    assert.equal(manifest.git_sha, "abc123");
    assert.equal(manifest.data_version, "data-test");
    assert.equal(manifest.eval.passed, 1);
    assert.equal(manifest.eval.model, "deepseek-v4-flash");
    assert.deepEqual(manifest.eval.failure_categories, { none: 1, blocked_no_key: 1, quality_failure: 1 });
    assert.match(manifest.checksums["index.html"] ?? "", /^sha256:/);
    assert.match(manifest.checksums["data/manifest.json"] ?? "", /^sha256:/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("creates preview bundle review assets and artifact manifest", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-preview-"));
  const artifactsDir = await mkdtemp(join(tmpdir(), "agent-radar-review-"));

  try {
    await mkdir(join(outputDir, "data"), { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<html></html>", "utf8");
    await writeFile(join(outputDir, "data", "manifest.json"), JSON.stringify({ data_version: "data-test" }), "utf8");
    await writeFile(join(outputDir, "data", "eval_summary.json"), JSON.stringify({ passed: 5, total: 5, results: [] }), "utf8");

    await createPreviewBundle({
      distDir: outputDir,
      reviewDir: artifactsDir,
      ingestion: ingestionResult,
      gitSha: "abc123",
      builtAt: "2026-07-07T00:00:00Z",
      providerModel: "deepseek-v4-flash"
    });

    const reviewMarkdown = await readFile(join(artifactsDir, "ingestion.md"), "utf8");
    const artifactManifest = JSON.parse(await readFile(join(outputDir, "artifact-manifest.json"), "utf8")) as { git_sha: string };

    assert.match(reviewMarkdown, /# Ingestion Review/);
    assert.equal(artifactManifest.git_sha, "abc123");
    await assert.rejects(() => stat(join(outputDir, "review", "ingestion.md")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(artifactsDir, { recursive: true, force: true });
  }
});
