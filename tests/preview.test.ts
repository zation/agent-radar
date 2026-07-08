import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createPreviewBundle } from "../src/preview/bundle.js";
import { renderArtifactManifestSummaryMarkdown } from "../src/preview/github-summary.js";
import { renderIngestionReviewMarkdown } from "../src/preview/ingestion-review.js";
import { buildArtifactManifest } from "../src/preview/manifest.js";
import type { RunIngestionResult } from "../src/ingestion/run.js";

const ingestionResult: RunIngestionResult = {
  crawlPlan: {
    schema_version: "source_crawl_plan.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 1,
      ready: 1,
      disabled: 0,
      blocked: 0
    },
    items: [
      {
        source_id: "manual-agent-radar-seed",
        source_url: "internal://manual-review/seed-tool-cards",
        collection_method: "manual",
        recommended_frequency: "manual",
        parser: "manual_seed_parser",
        status: "ready",
        reason: "enabled_source_ready_for_crawl"
      }
    ]
  },
  crawlAudit: {
    schema_version: "crawl_audit.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 1,
      success: 1,
      partial: 0,
      failed: 0
    },
    items: [
      {
        source_id: "manual-agent-radar-seed",
        source_url: "internal://manual-review/seed-tool-cards",
        snapshot_id: "manual-agent-radar-seed-20260707-abc123",
        fetched_at: "2026-07-07T00:00:00Z",
        fetch_method: "manual",
        status: "success",
        http_status: 200,
        content_hash: "sha256:abc123",
        content_path: "data/raw/manual-agent-radar-seed/2026-07-07/abc123.json",
        request_meta: {}
      }
    ]
  },
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
  approvalArtifact: {
    schema_version: "approval_records.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 1,
      approved: 1,
      rejected: 0,
      needs_changes: 0
    },
    records: [
      {
        id: "approval-agent-codex-20260707",
        schema_version: "approval_record.v1",
        target_type: "tool_card_draft",
        target_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        decision: "approved",
        reason: "Reviewed for preview.",
        reviewer: "maintainer",
        reviewed_at: "2026-07-07T12:00:00Z"
      }
    ]
  },
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
  },
  releaseAdmission: {
    schema_version: "tool_card_release_admission.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 1,
      eligible_for_publish: 1,
      blocked: 0
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        status: "eligible_for_publish",
        blocking_reasons: []
      }
    ]
  },
  promotionCandidates: {
    schema_version: "tool_card_promotion_candidates.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      candidates: 1
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
  assert.match(markdown, /Crawl audit: 1 success, 0 partial, 0 failed/);
  assert.match(markdown, /Approvals: 1 approved, 0 rejected, 0 needs changes/);
  assert.match(markdown, /Release admission: 1 eligible, 0 blocked/);
  assert.match(markdown, /Promotion candidates: 1/);
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

test("renders artifact manifest summary with eval failure categories for GitHub Actions", () => {
  const markdown = renderArtifactManifestSummaryMarkdown({
    schema_version: "artifact_manifest.v1",
    git_sha: "abc123",
    built_at: "2026-07-07T00:00:00Z",
    data_version: "data-test",
    eval: {
      passed: 1,
      total: 3,
      model: "deepseek-v4-flash",
      failure_categories: {
        none: 1,
        blocked_no_key: 1,
        quality_failure: 1
      }
    },
    checksums: {
      "data/manifest.json": "sha256:manifest",
      "data/provider_registry.json": "sha256:provider"
    }
  });

  assert.match(markdown, /### Artifact Manifest/);
  assert.match(markdown, /- Schema: `artifact_manifest\.v1`/);
  assert.match(markdown, /- Eval: 1\/3 using `deepseek-v4-flash`/);
  assert.match(markdown, /- Eval failure categories: `blocked_no_key=1`, `none=1`, `quality_failure=1`/);
  assert.match(markdown, /- Checksums: 2 files/);
});

test("creates preview bundle review assets and artifact manifest", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-preview-"));
  const artifactsDir = await mkdtemp(join(tmpdir(), "agent-radar-review-"));

  try {
    await mkdir(join(outputDir, "data"), { recursive: true });
    await writeFile(join(outputDir, "index.html"), "<html></html>", "utf8");
    await writeFile(join(outputDir, "data", "manifest.json"), JSON.stringify({ data_version: "data-test" }), "utf8");
    await writeFile(join(outputDir, "data", "eval_summary.json"), JSON.stringify({ passed: 5, total: 5, results: [] }), "utf8");
    await writeFile(
      join(outputDir, "data", "source_registry_diff.json"),
      JSON.stringify({
        schema_version: "source_registry_diff.v1",
        summary: { added: 2, removed: 0, changed: 1 },
        changed: [
          {
            id: "github-topic-mcp",
            changed_fields: ["enabled", "last_reviewed_at"],
            review_requirements: [
              {
                field: "enabled",
                reason: "Source enablement changes crawl scope and require maintainer confirmation.",
                confirmation_required: true
              }
            ]
          }
        ]
      }),
      "utf8"
    );
    await writeFile(
      join(outputDir, "data", "tool_card_url_validation.json"),
      JSON.stringify({ schema_version: "tool_card_url_validation.v1", summary: { checked: 0, reachable: 0, failed: 0, skipped: 12 } }),
      "utf8"
    );
    await writeFile(
      join(outputDir, "data", "tool_card_field_provenance.json"),
      JSON.stringify({
        schema_version: "tool_card_field_provenance.v1",
        summary: { cards_checked: 20, fields_checked: 60, covered: 0, covered_by_manual_review: 60, missing: 0 }
      }),
      "utf8"
    );
    await writeFile(
      join(outputDir, "data", "source_registry_review.json"),
      JSON.stringify({
        schema_version: "source_registry_review.v1",
        summary: { total_requirements: 1, confirmed: 0, rejected: 0, needs_changes: 0, pending: 1 }
      }),
      "utf8"
    );

    await createPreviewBundle({
      distDir: outputDir,
      reviewDir: artifactsDir,
      ingestion: ingestionResult,
      gitSha: "abc123",
      builtAt: "2026-07-07T00:00:00Z",
      providerModel: "deepseek-v4-flash"
    });

    const reviewMarkdown = await readFile(join(artifactsDir, "ingestion.md"), "utf8");
    const artifactManifest = JSON.parse(await readFile(join(outputDir, "artifact-manifest.json"), "utf8")) as {
      git_sha: string;
      crawl_audit: { total: number; success: number; partial: number; failed: number };
      source_registry_diff: { added: number; removed: number; changed: number };
      source_registry_review: { total_requirements: number; confirmed: number; rejected: number; needs_changes: number; pending: number };
      tool_card_url_validation: { checked: number; reachable: number; failed: number; skipped: number };
      tool_card_field_provenance: { cards_checked: number; fields_checked: number; covered: number; covered_by_manual_review: number; missing: number };
      ingestion_review: { approvals: { approved: number; rejected: number; needs_changes: number } };
      release_admission: { eligible_for_publish: number; blocked: number };
      promotion_candidates: { candidates: number };
    };

    assert.match(reviewMarkdown, /# Ingestion Review/);
    assert.match(reviewMarkdown, /## Source Registry Review Requirements/);
    assert.match(reviewMarkdown, /github-topic-mcp: enabled - Source enablement changes crawl scope and require maintainer confirmation\./);
    assert.equal(artifactManifest.git_sha, "abc123");
    assert.deepEqual(artifactManifest.crawl_audit, { total: 1, success: 1, partial: 0, failed: 0 });
    assert.deepEqual(artifactManifest.source_registry_diff, { added: 2, removed: 0, changed: 1 });
    assert.deepEqual(artifactManifest.source_registry_review, { total_requirements: 1, confirmed: 0, rejected: 0, needs_changes: 0, pending: 1 });
    assert.deepEqual(artifactManifest.tool_card_url_validation, { checked: 0, reachable: 0, failed: 0, skipped: 12 });
    assert.deepEqual(artifactManifest.tool_card_field_provenance, { cards_checked: 20, fields_checked: 60, covered: 0, covered_by_manual_review: 60, missing: 0 });
    assert.deepEqual(artifactManifest.ingestion_review.approvals, { approved: 1, rejected: 0, needs_changes: 0 });
    assert.deepEqual(artifactManifest.release_admission, { eligible_for_publish: 1, blocked: 0 });
    assert.deepEqual(artifactManifest.promotion_candidates, { candidates: 1 });
    await assert.rejects(() => stat(join(outputDir, "review", "ingestion.md")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(artifactsDir, { recursive: true, force: true });
  }
});
