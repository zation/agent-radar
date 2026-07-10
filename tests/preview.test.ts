import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { createPreviewBundle } from "../src/preview/bundle.js";
import { renderArtifactManifestSummaryMarkdown, renderCompactReviewSummaryMarkdown } from "../src/preview/github-summary.js";
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
        source_url: "internal://manual-review/tool-card-fixtures",
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
        source_url: "internal://manual-review/tool-card-fixtures",
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
      source_url: "internal://manual-review/tool-card-fixtures",
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
  discoveryCandidates: {
    schema_version: "tool_discovery_candidates.v2",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      candidates: 1,
      pending_production_gate: 1,
      by_source: { "github-topic-mcp": 1 }
    },
    items: [
      {
        source_record_id: "github-topic-mcp-modelcontextprotocol-servers-20260708",
        source_id: "github-topic-mcp",
        name: "modelcontextprotocol/servers",
        description: "Model Context Protocol servers",
        repo_url: "https://github.com/modelcontextprotocol/servers",
        stars: 51000,
        license: "MIT",
        last_commit_at: "2026-07-07T12:00:00Z",
        topics: ["mcp", "model-context-protocol"],
        source_confidence: "medium",
        review_status: "pending_production_gate",
        recommended_action: "review_in_production_gate"
      }
    ]
  },
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
  interventionRequests: {
    schema_version: "tool_card_intervention_requests.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      pending_intervention: 1,
      duplicate_review_required: 1,
      blocked_validation: 0
    },
    items: [
      {
        tool_id: "agent-blocked",
        name: "Blocked Agent",
        source_id: "manual-agent-radar-seed",
        source_record_id: "manual-agent-radar-seed-agent-blocked-20260707",
        review_status: "ready_for_review",
        duplicate_of_tool_ids: ["agent-codex"],
        duplicate_of_draft_tool_ids: ["agent-draft-twin"],
        validation_errors: [],
        validation_warnings: [],
        id: "intervention-agent-blocked-manual-agent-radar-seed-agent-blocked-20260707",
        schema_version: "tool_card_intervention_request.v1",
        target_id: "agent-blocked",
        suggested_action: "resolve_before_release"
      }
    ]
  },
  fieldProvenance: {
    schema_version: "tool_card_field_value_provenance.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      tool_cards: 1,
      field_values: 2
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        tool_card_field: "summary",
        source_field_path: "raw_fields.summary",
        source_value_preview: "Cloud coding agent for software development tasks.",
        normalized_value_preview: "Cloud coding agent for software development tasks.",
        provenance_type: "source_record"
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
  autoReview: {
    schema_version: "tool_card_auto_review.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 2,
      promote: 1,
      keep_draft: 0,
      needs_review: 1,
      reject: 0,
      retire: 0
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        suggested_action: "promote",
        confidence: 0.82,
        evidence_urls: ["https://developers.openai.com/codex"],
        key_evidence: ["source_urls:1", "confidence:high"],
        key_risks: ["risk_level:medium"],
        missing_fields: [],
        human_review_reasons: [],
        scorecard: {
          evidence_quality: 10,
          field_completeness: 10,
          maintenance_health: 10,
          safety_clarity: 9,
          feedback_health: 10,
          duplicate_risk: 10,
          total: 10
        }
      },
      {
        tool_id: "agent-blocked",
        source_record_id: "manual-agent-radar-seed-agent-blocked-20260707",
        suggested_action: "needs_review",
        confidence: 0.48,
        evidence_urls: ["https://example.com/blocked"],
        key_evidence: ["source_urls:1", "confidence:medium"],
        key_risks: ["risk_level:high"],
        missing_fields: [],
        human_review_reasons: ["possible_duplicate"],
        scorecard: {
          evidence_quality: 8,
          field_completeness: 8,
          maintenance_health: 10,
          safety_clarity: 5,
          feedback_health: 10,
          duplicate_risk: 0,
          total: 6
        }
      }
    ]
  },
  releaseAdmission: {
    schema_version: "tool_card_release_admission.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      total: 2,
      eligible_for_publish: 1,
      blocked: 1
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        status: "eligible_for_publish",
        gate: "approval_override",
        blocking_reasons: []
      },
      {
        tool_id: "agent-blocked",
        source_record_id: "manual-agent-radar-seed-agent-blocked-20260707",
        status: "blocked",
        gate: "blocked",
        blocking_reasons: ["approval_or_auto_review_not_passed", "possible_duplicate"]
      }
    ]
  },
  promotionCandidates: {
    schema_version: "tool_card_promotion_candidates.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      candidates: 1
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        draft: {
          id: "agent-codex",
          schema_version: "tool_card.v1",
          name: "Codex",
          type: "agent",
          summary: "Cloud coding agent for software development tasks.",
          source_urls: ["https://developers.openai.com/codex"],
          docs_url: "https://developers.openai.com/codex",
          primary_purpose: "coding_agent",
          use_cases: ["modify code", "run tests"],
          not_for: ["unreviewed destructive commands"],
          tags: ["coding", "agent"],
          install_methods: [{ method: "hosted", command: "", docs_url: "https://developers.openai.com/codex", confidence: "high" }],
          auth_required: "account",
          permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Works in the user's workspace." }],
          maintenance: {
            status: "active",
            issue_activity: "active",
            maintainer_type: "official",
            signals: ["official_product"]
          },
          security: {
            risk_level: "high",
            trust_level: "official",
            known_risks: ["filesystem_write"],
            requires_human_approval: true,
            security_notes: "Review diffs before accepting changes."
          },
          maturity: "stable",
          evidence_refs: ["manual-review-codex"],
          last_checked_at: "2026-07-07T00:00:00Z",
          confidence: "high",
          created_at: "2026-07-07T00:00:00Z",
          updated_at: "2026-07-07T00:00:00Z"
        },
        review: {
          gate: "approval_override",
          reviewed_by: "maintainer",
          reviewed_at: "2026-07-07T12:00:00Z",
          reason: "Reviewed for preview."
        },
        promotion_status: "candidate"
      }
    ]
  },
  promotionPlan: {
    schema_version: "tool_card_promotion_plan.v1",
    generated_at: "2026-07-07T00:00:00Z",
    summary: {
      candidates: 1,
      reliable_publish_ready: true
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        recommended_action: "publish_via_reliable_pipeline",
        target_artifact: "public/data/tool_cards.jsonl",
        candidate_artifact_path: "data/promotion_candidates/tool_cards.json",
        review: {
          gate: "approval_override",
          reviewed_by: "maintainer",
          reviewed_at: "2026-07-07T12:00:00Z",
          reason: "Reviewed for preview."
        },
        checks: ["Run npm run pipeline to rebuild reliable Tool Card artifacts from admitted candidates."]
      }
    ]
  },
  promotionCheck: {
    schema_version: "tool_card_promotion_check.v1",
    generated_at: "2026-07-07T00:00:00Z",
    passed: true,
    summary: {
      candidates: 1,
      ready_for_publish: 1,
      blocked: 0,
      duplicate_tool_ids: 0,
      validation_errors: 0,
      validation_warnings: 0
    },
    items: [
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260707",
        status: "ready_for_publish",
        blocking_reasons: [],
        duplicate_of_tool_ids: [],
        validation_errors: [],
        validation_warnings: []
      }
    ]
  }
};

test("renders ingestion review markdown for preview reviewers", () => {
  const markdown = renderIngestionReviewMarkdown(ingestionResult);

  assert.match(markdown, /^# Ingestion Review/m);
  assert.match(markdown, /manual-agent-radar-seed/);
  assert.match(markdown, /Codex/);
  assert.match(markdown, /https:\/\/developers.openai.com\/codex/);
  assert.match(markdown, /Review ready: 0/);
  assert.match(markdown, /Discovery candidates: 1 pending production gate review/);
  assert.match(markdown, /## Discovery Candidates/);
  assert.match(markdown, /modelcontextprotocol\/servers source=github-topic-mcp source_record=github-topic-mcp-modelcontextprotocol-servers-20260708 repo=https:\/\/github.com\/modelcontextprotocol\/servers stars=51000 review_status=pending_production_gate action=review_in_production_gate/);
  assert.match(markdown, /Crawl audit: 1 success, 0 partial, 0 failed/);
  assert.match(markdown, /Approval overrides: 1 approved, 0 rejected, 0 needs changes/);
  assert.match(markdown, /Auto review: 1 promote, 1 needs review, 0 keep draft/);
  assert.match(markdown, /## Field Value Provenance/);
  assert.match(markdown, /agent-codex summary type=source_record source=raw_fields\.summary source_record=manual-agent-radar-seed-agent-codex-20260707 value=Cloud coding agent for software development tasks\./);
  assert.match(markdown, /## Intervention Requests/);
  assert.match(markdown, /agent-blocked \(Blocked Agent\) source_record=manual-agent-radar-seed-agent-blocked-20260707 review_status=ready_for_review published_duplicates=agent-codex draft_duplicates=agent-draft-twin action=resolve_before_release/);
  assert.match(markdown, /Release admission: 1 eligible, 1 blocked/);
  assert.match(markdown, /## Auto Review/);
  assert.match(markdown, /agent-codex source_record=manual-agent-radar-seed-agent-codex-20260707 action=promote score=10/);
  assert.match(markdown, /## Release Admission/);
  assert.match(markdown, /agent-codex source_record=manual-agent-radar-seed-agent-codex-20260707 status=eligible_for_publish gate=approval_override blocking_reasons=none/);
  assert.match(markdown, /agent-blocked source_record=manual-agent-radar-seed-agent-blocked-20260707 status=blocked gate=blocked blocking_reasons=approval_or_auto_review_not_passed,possible_duplicate/);
  assert.match(markdown, /Promotion candidates: 1/);
  assert.match(markdown, /Promotion plan: 1 candidates, ready for reliable publish/);
  assert.match(markdown, /## Promotion Candidates/);
  assert.match(markdown, /agent-codex \(Codex\) source_record=manual-agent-radar-seed-agent-codex-20260707 gate=approval_override reviewer=maintainer reviewed_at=2026-07-07T12:00:00Z/);
  assert.match(markdown, /review_reason=Reviewed for preview\./);
  assert.match(markdown, /## Promotion Plan/);
  assert.match(markdown, /agent-codex target=public\/data\/tool_cards\.jsonl action=publish_via_reliable_pipeline candidate_artifact=data\/promotion_candidates\/tool_cards\.json/);
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
    tool_card_field_provenance: {
      cards_checked: 20,
      fields_checked: 60,
      covered: 12,
      covered_by_manual_review: 45,
      missing: 3
    },
    crawl_audit: {
      total: 3,
      success: 1,
      partial: 1,
      failed: 1
    },
    source_registry_review: {
      total_requirements: 2,
      confirmed: 1,
      rejected: 0,
      needs_changes: 0,
      pending: 1
    },
    source_registry_review_requests: {
      pending_review: 1,
      confirmation_required: 1
    },
    ingestion_review: {
      approvals: {
        approved: 2,
        rejected: 1,
        needs_changes: 1
      }
    },
    intervention_requests: {
      pending_intervention: 18,
      duplicate_review_required: 12,
      blocked_validation: 1
    },
    field_value_provenance: {
      tool_cards: 20,
      field_values: 240
    },
    auto_review: {
      promote: 12,
      keep_draft: 3,
      needs_review: 5,
      reject: 1,
      retire: 0
    },
    release_admission: {
      eligible_for_publish: 2,
      blocked: 18
    },
    discovery_candidates: {
      candidates: 3,
      pending_production_gate: 3
    },
    promotion_candidates: {
      candidates: 2
    },
    promotion_plan: {
      candidates: 2,
      reliable_publish_ready: true
    },
    promotion_check: {
      candidates: 2,
      ready_for_publish: 1,
      blocked: 1,
      duplicate_tool_ids: 1,
      validation_errors: 2,
      validation_warnings: 3,
      passed: false
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
  assert.match(markdown, /- Tool Card field provenance: 57\/60 fields covered \(12 field refs, 45 manual review, 3 missing\)/);
  assert.match(markdown, /- Crawl audit: 1 success, 1 partial, 1 failed \(3 total\)/);
  assert.match(markdown, /- Source registry review: 1\/2 confirmed, 1 pending, 0 rejected, 0 needs changes/);
  assert.match(markdown, /- Source registry review requests: 1 pending, 1 confirmation required/);
  assert.match(markdown, /- Approval overrides: 2 approved, 1 rejected, 1 needs changes/);
  assert.match(markdown, /- Intervention requests: 18 pending, 12 duplicate review, 1 blocked validation/);
  assert.match(markdown, /- Field value provenance: 240 field values across 20 Tool Cards/);
  assert.match(markdown, /- Auto review: 12 promote, 5 needs review, 3 keep draft, 1 reject, 0 retire/);
  assert.match(markdown, /- Release admission: 2 eligible, 18 blocked/);
  assert.match(markdown, /- Discovery candidates: 3 candidates, 3 pending production gate review/);
  assert.match(markdown, /- Promotion candidates: 2/);
  assert.match(markdown, /- Promotion plan: 2 candidates, ready for reliable publish/);
  assert.match(markdown, /- Promotion check: 1 ready, 1 blocked, failed/);
  assert.match(markdown, /- Checksums: 2 files/);
});

test("renders compact review summary with only actionable review items", () => {
  const markdown = renderCompactReviewSummaryMarkdown(
    {
      schema_version: "artifact_manifest.v1",
      git_sha: "abc123",
      built_at: "2026-07-07T00:00:00Z",
      data_version: "data-test",
      eval: {
        passed: 9,
        total: 10,
        model: "deepseek-v4-flash",
        failure_categories: { none: 9, quality_failure: 1 }
      },
      source_registry_review: {
        total_requirements: 2,
        confirmed: 1,
        rejected: 0,
        needs_changes: 0,
        pending: 1
      },
      source_registry_review_requests: {
        pending_review: 1,
        confirmation_required: 1
      },
      intervention_requests: {
        pending_intervention: 2,
        duplicate_review_required: 1,
        blocked_validation: 0
      },
      release_admission: {
        eligible_for_publish: 8,
        blocked: 2
      },
      promotion_check: {
        candidates: 10,
        ready_for_publish: 8,
        blocked: 2,
        duplicate_tool_ids: 1,
        validation_errors: 1,
        validation_warnings: 3,
        passed: false
      },
      tool_card_field_provenance: {
        cards_checked: 10,
        fields_checked: 30,
        covered: 27,
        covered_by_manual_review: 0,
        missing: 3
      },
      crawl_audit: {
        total: 11,
        success: 10,
        partial: 1,
        failed: 0
      },
      checksums: {
        "data/manifest.json": "sha256:manifest"
      }
    },
    {
      refName: "v0.2.1",
      sha: "abc123",
      deployOutput: "Preview available at https://example.pages.dev",
      mcpSmoke: { endpoint: "https://agent-radar.example/api/mcp", passed: 4, total: 4, skipped: false }
    }
  );

  assert.match(markdown, /## Agent Radar Preview/);
  assert.match(markdown, /- Preview: https:\/\/example\.pages\.dev/);
  assert.match(markdown, /### Review Required/);
  assert.match(markdown, /- Source registry: 1 pending confirmation, 1 required/);
  assert.match(markdown, /- Tool Card interventions: 2 pending, 1 duplicate review, 0 blocked validation/);
  assert.match(markdown, /- Golden eval: 1 failing/);
  assert.match(markdown, /- Field provenance: 3 critical fields missing evidence/);
  assert.match(markdown, /- Crawl audit: 0 failed, 1 partial/);
  assert.match(markdown, /- NEEDS REVIEW eval 9\/10/);
  assert.match(markdown, /- NEEDS REVIEW promotion 8\/10 ready/);
  assert.match(markdown, /- PASS MCP smoke 4\/4/);
  assert.doesNotMatch(markdown, /Field value provenance/);
  assert.doesNotMatch(markdown, /Checksums: /);
});

test("renders compact review summary as clean when no action is needed", () => {
  const markdown = renderCompactReviewSummaryMarkdown(
    {
      schema_version: "artifact_manifest.v1",
      git_sha: "abc123",
      built_at: "2026-07-07T00:00:00Z",
      data_version: "data-test",
      eval: { passed: 10, total: 10, model: "deepseek-v4-flash", failure_categories: { none: 10 } },
      source_registry_review: { total_requirements: 0, confirmed: 0, rejected: 0, needs_changes: 0, pending: 0 },
      source_registry_review_requests: { pending_review: 0, confirmation_required: 0 },
      intervention_requests: { pending_intervention: 0, duplicate_review_required: 0, blocked_validation: 0 },
      release_admission: { eligible_for_publish: 10, blocked: 0 },
      promotion_check: { candidates: 10, ready_for_publish: 10, blocked: 0, duplicate_tool_ids: 0, validation_errors: 0, validation_warnings: 0, passed: true },
      tool_card_field_provenance: { cards_checked: 10, fields_checked: 30, covered: 30, covered_by_manual_review: 0, missing: 0 },
      crawl_audit: { total: 11, success: 11, partial: 0, failed: 0 },
      checksums: {}
    },
    { refName: "main", sha: "abc123", mcpSmoke: { endpoint: "not configured", passed: 0, total: 0, skipped: true } }
  );

  assert.match(markdown, /- None\. Review the full artifact only if you want detailed provenance\./);
  assert.match(markdown, /- PASS eval 10\/10/);
  assert.match(markdown, /- PASS promotion 10\/10 ready/);
  assert.match(markdown, /- PASS source review 0\/0 confirmed/);
  assert.match(markdown, /- PASS MCP smoke skipped/);
});

test("creates preview bundle review assets and artifact manifest", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-preview-"));
  const artifactsDir = await mkdtemp(join(tmpdir(), "agent-radar-review-"));

  try {
    await mkdir(join(outputDir, "data"), { recursive: true });
    await writeIngestionReviewEvidenceFixture(outputDir, ingestionResult);
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
    await writeFile(
      join(outputDir, "data", "source_registry_review_requests.json"),
      JSON.stringify({
        schema_version: "source_registry_review_requests.v1",
        summary: { pending_review: 1, confirmation_required: 1 },
        items: [
          {
            source_id: "github-topic-mcp",
            field: "enabled",
            reason: "Source enablement changes crawl scope and require maintainer confirmation.",
            confirmation_required: true,
            suggested_action: "review_in_production_gate"
          }
        ]
      }),
      "utf8"
    );

    await createPreviewBundle({
      distDir: outputDir,
      reviewDir: artifactsDir,
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
      source_registry_review_requests: { pending_review: number; confirmation_required: number };
      tool_card_url_validation: { checked: number; reachable: number; failed: number; skipped: number };
      tool_card_field_provenance: { cards_checked: number; fields_checked: number; covered: number; covered_by_manual_review: number; missing: number };
      ingestion_review: { approvals: { approved: number; rejected: number; needs_changes: number } };
      intervention_requests: { pending_intervention: number; duplicate_review_required: number; blocked_validation: number };
      field_value_provenance: { tool_cards: number; field_values: number };
      auto_review: { promote: number; keep_draft: number; needs_review: number; reject: number; retire: number };
      release_admission: { eligible_for_publish: number; blocked: number };
      discovery_candidates: { candidates: number; pending_production_gate: number };
      promotion_candidates: { candidates: number };
      promotion_plan: { candidates: number; reliable_publish_ready: boolean };
      promotion_check: { candidates: number; ready_for_publish: number; blocked: number; duplicate_tool_ids: number; validation_errors: number; validation_warnings: number; passed: boolean };
    };

    assert.match(reviewMarkdown, /# Ingestion Review/);
    assert.match(reviewMarkdown, /## Source Registry Review Requirements/);
    assert.match(reviewMarkdown, /github-topic-mcp: enabled - Source enablement changes crawl scope and require maintainer confirmation\./);
    assert.match(reviewMarkdown, /## Source Registry Review Requests/);
    assert.match(reviewMarkdown, /github-topic-mcp:enabled action=review_in_production_gate/);
    assert.equal(artifactManifest.git_sha, "abc123");
    assert.deepEqual(artifactManifest.crawl_audit, { total: 1, success: 1, partial: 0, failed: 0 });
    assert.deepEqual(artifactManifest.source_registry_diff, { added: 2, removed: 0, changed: 1 });
    assert.deepEqual(artifactManifest.source_registry_review, { total_requirements: 1, confirmed: 0, rejected: 0, needs_changes: 0, pending: 1 });
    assert.deepEqual(artifactManifest.source_registry_review_requests, { pending_review: 1, confirmation_required: 1 });
    assert.deepEqual(artifactManifest.tool_card_url_validation, { checked: 0, reachable: 0, failed: 0, skipped: 12 });
    assert.deepEqual(artifactManifest.tool_card_field_provenance, { cards_checked: 20, fields_checked: 60, covered: 0, covered_by_manual_review: 60, missing: 0 });
    assert.deepEqual(artifactManifest.ingestion_review.approvals, { approved: 1, rejected: 0, needs_changes: 0 });
    assert.deepEqual(artifactManifest.intervention_requests, { pending_intervention: 1, duplicate_review_required: 1, blocked_validation: 0 });
    assert.deepEqual(artifactManifest.field_value_provenance, { tool_cards: 1, field_values: 2 });
    assert.deepEqual(artifactManifest.auto_review, { promote: 1, keep_draft: 0, needs_review: 1, reject: 0, retire: 0 });
    assert.deepEqual(artifactManifest.release_admission, { eligible_for_publish: 1, blocked: 1 });
    assert.deepEqual(artifactManifest.discovery_candidates, { candidates: 1, pending_production_gate: 1 });
    assert.deepEqual(artifactManifest.promotion_candidates, { candidates: 1 });
    assert.deepEqual(artifactManifest.promotion_plan, { candidates: 1, reliable_publish_ready: true });
    assert.deepEqual(artifactManifest.promotion_check, {
      candidates: 1,
      ready_for_publish: 1,
      blocked: 0,
      duplicate_tool_ids: 0,
      validation_errors: 0,
      validation_warnings: 0,
      passed: true
    });
    await assert.rejects(() => stat(join(outputDir, "review", "ingestion.md")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(artifactsDir, { recursive: true, force: true });
  }
});

test("rejects preview evidence that differs from the reviewed bundle artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-preview-mismatch-"));
  const artifactsDir = await mkdtemp(join(tmpdir(), "agent-radar-review-mismatch-"));

  try {
    await writeIngestionReviewEvidenceFixture(outputDir, ingestionResult);
    await writeFile(
      join(outputDir, "data", "promotion_candidates", "promotion_check.json"),
      JSON.stringify({ ...ingestionResult.promotionCheck, passed: false }),
      "utf8"
    );

    await assert.rejects(
      createPreviewBundle({
        distDir: outputDir,
        reviewDir: artifactsDir,
        gitSha: "abc123",
        builtAt: "2026-07-07T00:00:00Z",
        providerModel: "deepseek-v4-flash"
      }),
      /promotion check does not match ingestion review evidence/
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
    await rm(artifactsDir, { recursive: true, force: true });
  }
});

async function writeIngestionReviewEvidenceFixture(outputDir: string, result: RunIngestionResult): Promise<void> {
  const artifacts: Array<[string, unknown]> = [
    ["data/review/ingestion.json", { schema_version: "ingestion_review_evidence.v1", result }],
    ["data/crawl_audit/crawl_audit.json", result.crawlAudit],
    ["data/approvals/approval_records.json", result.approvalArtifact],
    ["data/intervention_requests/tool_card_drafts.json", result.interventionRequests],
    ["data/field_provenance/tool_card_fields.json", result.fieldProvenance],
    ["data/auto_review/tool_card_drafts.json", result.autoReview],
    ["data/release_admission/tool_card_drafts.json", result.releaseAdmission],
    ["data/discovery_candidates/tool_repositories.json", result.discoveryCandidates],
    ["data/promotion_candidates/tool_cards.json", result.promotionCandidates],
    ["data/promotion_candidates/promotion_plan.json", result.promotionPlan],
    ["data/promotion_candidates/promotion_check.json", result.promotionCheck]
  ];

  for (const [relativePath, value] of artifacts) {
    const path = join(outputDir, relativePath);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(value, null, 2), "utf8");
  }
}
