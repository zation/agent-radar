import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatIngestionCliSummary } from "../src/cli/ingest-summary.js";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import { parseSnapshot } from "../src/ingestion/parser.js";
import { runIngestion } from "../src/ingestion/run.js";
import { buildSourceRegistryReviewArtifact, buildSourceRegistryReviewRequests } from "../src/ingestion/source-review.js";
import { buildSourceRegistryDiff, getEnabledSources, sourceRegistry, validateSourceRegistry } from "../src/ingestion/source-registry.js";

test("source registry exposes only enabled MVP sources", () => {
  const enabled = getEnabledSources(sourceRegistry);

  assert.deepEqual(enabled.map((source) => source.id), ["manual-agent-radar-seed"]);
  assert.equal(enabled[0]?.collection_method, "manual");
  assert.equal(enabled[0]?.trust_level, "official");
});

test("ingestion CLI summary includes approval and release gates", () => {
  const summary = formatIngestionCliSummary({
    snapshots: [{ source_id: "manual-agent-radar-seed" }],
    sourceRecords: [{}, {}],
    approvalRequests: { summary: { pending_approval: 2, duplicate_review_required: 1, blocked_validation: 0 } },
    fieldProvenance: { summary: { tool_cards: 2, field_values: 24 } },
    releaseAdmission: { summary: { eligible_for_publish: 1, blocked: 1 } },
    promotionCandidates: { summary: { candidates: 1 } },
    promotionPlan: { summary: { candidates: 1, manual_merge_required: true } },
    promotionCheck: { passed: false, summary: { ready_for_manual_merge: 0, blocked: 1, validation_errors: 2, validation_warnings: 3 } }
  });

  assert.deepEqual(summary, {
    snapshots: 1,
    source_records: 2,
    source_ids: ["manual-agent-radar-seed"],
    approval_requests: {
      pending_approval: 2,
      duplicate_review_required: 1,
      blocked_validation: 0
    },
    field_value_provenance: {
      tool_cards: 2,
      field_values: 24
    },
    release_admission: {
      eligible_for_publish: 1,
      blocked: 1
    },
    promotion_candidates: 1,
    promotion_plan: {
      candidates: 1,
      manual_merge_required: true
    },
    promotion_check: {
      passed: false,
      ready_for_manual_merge: 0,
      blocked: 1,
      validation_errors: 2,
      validation_warnings: 3
    }
  });
});

test("source registry validator rejects unsafe enabled sources", () => {
  const errors = validateSourceRegistry([
    {
      ...sourceRegistry[1],
      enabled: true,
      parser: undefined,
      terms_notes: "",
      last_reviewed_at: "not-a-date"
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: enabled source requires parser/);
  assert.match(errors.join("\n"), /github-topic-mcp: terms_notes is required/);
  assert.match(errors.join("\n"), /github-topic-mcp: last_reviewed_at must be ISO 8601 UTC/);
});

test("source registry validator rejects enabled sources without parser coverage", () => {
  const errors = validateSourceRegistry([
    {
      ...sourceRegistry[1],
      enabled: true,
      parser: "unknown_parser"
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: parser unknown_parser is not implemented/);
});

test("github topic parser creates repository source records from API payloads", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const contentPath = "data/raw/github-topic-mcp/2026-07-08/topic.json";

  try {
    await mkdir(join(outputDir, "data", "raw", "github-topic-mcp", "2026-07-08"), { recursive: true });
    await writeFile(
      join(outputDir, contentPath),
      JSON.stringify({
        items: [
          {
            full_name: "modelcontextprotocol/servers",
            name: "servers",
            html_url: "https://github.com/modelcontextprotocol/servers",
            description: "Model Context Protocol servers",
            stargazers_count: 51000,
            license: { spdx_id: "MIT" },
            pushed_at: "2026-07-07T12:00:00Z",
            topics: ["mcp", "model-context-protocol"]
          }
        ]
      }),
      "utf8"
    );

    const records = await parseSnapshot(
      {
        id: "github-topic-mcp-20260708-topic",
        schema_version: "raw_snapshot.v1",
        source_id: "github-topic-mcp",
        source_url: "https://github.com/topics/mcp",
        fetched_at: "2026-07-08T00:00:00Z",
        fetch_method: "api",
        status: "success",
        content_type: "application/json",
        content_hash: "sha256:test",
        content_path: contentPath
      },
      sourceRegistry[1],
      outputDir,
      "2026-07-08T00:00:00Z"
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.schema_version, "source_record.v1");
    assert.equal(records[0]?.source_id, "github-topic-mcp");
    assert.equal(records[0]?.record_type, "repository");
    assert.equal(records[0]?.name, "modelcontextprotocol/servers");
    assert.equal(records[0]?.description, "Model Context Protocol servers");
    assert.deepEqual(records[0]?.urls, ["https://github.com/modelcontextprotocol/servers"]);
    assert.deepEqual(records[0]?.parsed_fields, {
      repo_url: "https://github.com/modelcontextprotocol/servers",
      stars: 51000,
      license: "MIT",
      last_commit_at: "2026-07-07T12:00:00Z",
      topics: ["mcp", "model-context-protocol"]
    });
    assert.equal(records[0]?.source_confidence, "medium");
    assert.equal(records[0]?.parser_version, "github_topic_parser.v1");
    assert.deepEqual(records[0]?.warnings, []);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("source registry validator rejects enabled sources without review owner", () => {
  const errors = validateSourceRegistry([
    {
      ...sourceRegistry[0],
      owner: ""
    }
  ]);

  assert.match(errors.join("\n"), /manual-agent-radar-seed: enabled source requires owner/);
});

test("source registry validator rejects enabled sources without robots and terms review", () => {
  const errors = validateSourceRegistry([
    {
      ...sourceRegistry[0],
      access_review: undefined
    }
  ]);

  assert.match(errors.join("\n"), /manual-agent-radar-seed: enabled source requires robots review/);
  assert.match(errors.join("\n"), /manual-agent-radar-seed: enabled source requires terms review/);
});

test("source registry diff records added removed and changed source ids", () => {
  const diff = buildSourceRegistryDiff(
    [
      sourceRegistry[0],
      {
        ...sourceRegistry[1],
        enabled: false
      }
    ],
    [
      {
        ...sourceRegistry[0],
        enabled: false,
        last_reviewed_at: "2026-07-08T00:00:00Z"
      },
      {
        ...sourceRegistry[1],
        id: "new-official-source",
        enabled: false
      }
    ],
    "2026-07-08T00:00:00Z"
  );

  assert.equal(diff.schema_version, "source_registry_diff.v1");
  assert.deepEqual(diff.summary, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(diff.added.map((source) => source.id), ["new-official-source"]);
  assert.deepEqual(diff.removed.map((source) => source.id), ["github-topic-mcp"]);
  assert.deepEqual(diff.changed[0]?.changed_fields, ["enabled", "last_reviewed_at"]);
  assert.deepEqual(diff.changed[0]?.review_requirements, [
    {
      field: "enabled",
      reason: "Source enablement changes crawl scope and require maintainer confirmation.",
      confirmation_required: true
    }
  ]);
});

test("source registry review artifact tracks pending and confirmed requirements", () => {
  const diff = buildSourceRegistryDiff(
    [sourceRegistry[1]],
    [
      {
        ...sourceRegistry[1],
        enabled: true,
        parser: "github_topic_parser",
        trust_level: "official",
        last_reviewed_at: "2026-07-08T00:00:00Z"
      }
    ],
    "2026-07-08T00:00:00Z"
  );

  const pendingReview = buildSourceRegistryReviewArtifact(diff, [], "2026-07-08T01:00:00Z");

  assert.equal(pendingReview.schema_version, "source_registry_review.v1");
  assert.deepEqual(pendingReview.summary, { total_requirements: 2, confirmed: 0, rejected: 0, needs_changes: 0, pending: 2 });
  assert.equal(pendingReview.items[0]?.source_id, "github-topic-mcp");
  assert.equal(pendingReview.items[0]?.status, "pending");

  const confirmedReview = buildSourceRegistryReviewArtifact(
    diff,
    [
      {
        id: "source-review-github-topic-mcp-enabled-20260708",
        schema_version: "source_registry_review_record.v1",
        source_id: "github-topic-mcp",
        field: "enabled",
        decision: "confirmed",
        reason: "Reviewed crawl scope for preview only.",
        reviewer: "maintainer",
        reviewed_at: "2026-07-08T01:00:00Z"
      }
    ],
    "2026-07-08T01:00:00Z"
  );

  assert.deepEqual(confirmedReview.summary, { total_requirements: 2, confirmed: 1, rejected: 0, needs_changes: 0, pending: 1 });
  assert.equal(confirmedReview.items.find((item) => item.field === "enabled")?.status, "confirmed");
  assert.equal(confirmedReview.items.find((item) => item.field === "enabled")?.confirmation?.reviewer, "maintainer");
});

test("source registry review requests provide templates for pending requirements", () => {
  const diff = buildSourceRegistryDiff(
    [sourceRegistry[1]],
    [
      {
        ...sourceRegistry[1],
        enabled: true,
        parser: "github_topic_parser",
        trust_level: "official",
        last_reviewed_at: "2026-07-08T00:00:00Z"
      }
    ],
    "2026-07-08T00:00:00Z"
  );
  const review = buildSourceRegistryReviewArtifact(
    diff,
    [
      {
        id: "source-review-github-topic-mcp-enabled-20260708",
        schema_version: "source_registry_review_record.v1",
        source_id: "github-topic-mcp",
        field: "enabled",
        decision: "confirmed",
        reason: "Reviewed crawl scope.",
        reviewer: "maintainer",
        reviewed_at: "2026-07-08T01:00:00Z"
      }
    ],
    "2026-07-08T01:00:00Z"
  );

  const requests = buildSourceRegistryReviewRequests(review, "2026-07-08T01:05:00Z");

  assert.equal(requests.schema_version, "source_registry_review_requests.v1");
  assert.deepEqual(requests.summary, { pending_review: 1, confirmation_required: 1 });
  assert.equal(requests.items[0]?.source_id, "github-topic-mcp");
  assert.equal(requests.items[0]?.field, "trust_level");
  assert.deepEqual(requests.items[0]?.decision_options, ["confirmed", "rejected", "needs_changes"]);
  assert.deepEqual(requests.items[0]?.review_record_template, {
    id: "source-review-github-topic-mcp-trust-level",
    schema_version: "source_registry_review_record.v1",
    source_id: "github-topic-mcp",
    field: "trust_level",
    required_fields: ["decision", "reason", "reviewer", "reviewed_at"]
  });
});

test("crawler saves immutable raw snapshots without request secrets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const [snapshot] = await crawlEnabledSources({
      sources: getEnabledSources(sourceRegistry),
      outputDir,
      now: "2026-07-07T00:00:00Z",
      fetchImpl: (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), null);
        return Promise.resolve(
          new Response(JSON.stringify({ tools: [{ id: "agent-codex", name: "Codex" }] }), {
            status: 200,
            headers: { "content-type": "application/json", etag: "seed-v1" }
          })
        );
      }
    });

    assert.equal(snapshot?.schema_version, "raw_snapshot.v1");
    assert.equal(snapshot?.source_id, "manual-agent-radar-seed");
    assert.equal(snapshot?.status, "success");
    assert.match(snapshot?.content_hash ?? "", /^sha256:/);
    assert.ok(snapshot?.content_path.endsWith(".json"));
    assert.deepEqual(snapshot?.request_meta, { etag: "seed-v1" });

    const content = await readFile(join(outputDir, snapshot?.content_path ?? ""), "utf8");
    const meta = JSON.parse(await readFile(join(outputDir, `${snapshot?.content_path}.meta.json`), "utf8")) as { request_meta: Record<string, string> };
    assert.match(content, /agent-codex/);
    assert.equal(JSON.stringify(meta).includes("authorization"), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("crawler fetches GitHub topic sources through public search API without secrets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const [snapshot] = await crawlEnabledSources({
      sources: [sourceRegistry[1]],
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: (url, init) => {
        assert.equal(url, "https://api.github.com/search/repositories?q=topic%3Amcp&sort=stars&order=desc&per_page=20");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("accept"), "application/vnd.github+json");
        assert.equal(headers.get("user-agent"), "agent-radar-crawler");
        return Promise.resolve(
          new Response(JSON.stringify({ items: [{ full_name: "modelcontextprotocol/servers", html_url: "https://github.com/modelcontextprotocol/servers" }] }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-limit": "60",
              "x-ratelimit-remaining": "59",
              "x-ratelimit-reset": "1783468800"
            }
          })
        );
      }
    });

    assert.equal(snapshot?.schema_version, "raw_snapshot.v1");
    assert.equal(snapshot?.source_id, "github-topic-mcp");
    assert.equal(snapshot?.source_url, "https://api.github.com/search/repositories?q=topic%3Amcp&sort=stars&order=desc&per_page=20");
    assert.equal(snapshot?.fetch_method, "api");
    assert.equal(snapshot?.status, "success");
    assert.deepEqual(snapshot?.request_meta, {
      rate_limit_limit: "60",
      rate_limit_remaining: "59",
      rate_limit_reset: "1783468800"
    });

    const meta = JSON.parse(await readFile(join(outputDir, `${snapshot?.content_path}.meta.json`), "utf8")) as { request_meta: Record<string, string> };
    assert.equal(JSON.stringify(meta).includes("authorization"), false);
    assert.equal(meta.request_meta.rate_limit_remaining, "59");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes a crawl plan for enabled sources", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ tools: [] }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    assert.equal(result.crawlPlan.schema_version, "source_crawl_plan.v1");
    assert.equal(result.crawlPlan.summary.total, 2);
    assert.equal(result.crawlPlan.summary.disabled, 1);
    assert.equal(result.crawlPlan.items[0]?.source_id, "manual-agent-radar-seed");
    assert.equal(result.crawlPlan.items[0]?.status, "ready");
    assert.equal(result.crawlPlan.items[0]?.parser, "manual_seed_parser");
    assert.equal(result.crawlPlan.items[1]?.source_id, "github-topic-mcp");
    assert.equal(result.crawlPlan.items[1]?.status, "disabled");

    const crawlPlan = JSON.parse(await readFile(join(outputDir, "data", "crawl_plan", "source_crawl_plan.json"), "utf8")) as {
      schema_version: string;
      items: Array<{ source_id: string; status: string }>;
    };
    assert.equal(crawlPlan.schema_version, "source_crawl_plan.v1");
    assert.equal(crawlPlan.items[0]?.source_id, "manual-agent-radar-seed");
    assert.equal(crawlPlan.items[1]?.status, "disabled");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes crawl audit log from snapshots", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ tools: [] }), { status: 200, headers: { "content-type": "application/json", etag: "audit-v1" } }))
    });

    assert.equal(result.crawlAudit.schema_version, "crawl_audit.v1");
    assert.equal(result.crawlAudit.summary.success, 1);
    assert.equal(result.crawlAudit.items[0]?.source_id, "manual-agent-radar-seed");
    assert.equal(result.crawlAudit.items[0]?.status, "success");
    assert.equal(result.crawlAudit.items[0]?.fetch_method, "manual");
    assert.match(result.crawlAudit.items[0]?.content_hash ?? "", /^sha256:/);
    assert.deepEqual(result.crawlAudit.items[0]?.request_meta, { etag: "audit-v1" });

    const audit = JSON.parse(await readFile(join(outputDir, "data", "crawl_audit", "crawl_audit.json"), "utf8")) as {
      schema_version: string;
      summary: { success: number };
      items: Array<{ source_id: string; status: string }>;
    };
    assert.equal(audit.schema_version, "crawl_audit.v1");
    assert.equal(audit.summary.success, 1);
    assert.equal(audit.items[0]?.source_id, "manual-agent-radar-seed");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion parses manual seed snapshots into source records", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-07T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "skill-openai-docs",
                name: "OpenAI Docs Skill",
                type: "skill",
                source_urls: ["https://platform.openai.com/docs"]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.snapshots.length, 1);
    assert.equal(result.sourceRecords.length, 1);
    assert.equal(result.sourceRecords[0]?.schema_version, "source_record.v1");
    assert.equal(result.sourceRecords[0]?.source_id, "manual-agent-radar-seed");
    assert.equal(result.sourceRecords[0]?.record_type, "manual");
    assert.equal(result.sourceRecords[0]?.name, "OpenAI Docs Skill");
    assert.equal(result.sourceRecords[0]?.parsed_fields.type, "skill");
    assert.equal(result.sourceRecords[0]?.source_confidence, "high");

    const recordsJsonl = await readFile(join(outputDir, "data", "source_records", "manual-agent-radar-seed.jsonl"), "utf8");
    assert.match(recordsJsonl, /skill-openai-docs/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes tool card drafts from complete manual source records", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-codex",
                schema_version: "tool_card.v1",
                name: "Codex",
                type: "agent",
                summary: "A coding agent that can inspect workspaces, edit files, and run tests.",
                source_urls: ["https://developers.openai.com/codex"],
                docs_url: "https://developers.openai.com/codex",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run test suites"],
                not_for: ["unapproved destructive commands"],
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
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.toolCardDrafts.length, 1);
    assert.equal(result.reviewQueue.items.length, 1);
    assert.equal(result.reviewQueue.items[0]?.status, "ready_for_review");
    assert.equal(result.reviewQueue.items[0]?.tool_id, "agent-codex");
    assert.deepEqual(result.reviewQueue.items[0]?.duplicate_of_tool_ids, ["agent-codex"]);
    assert.equal(result.approvalRequests.schema_version, "tool_card_approval_requests.v1");
    assert.equal(result.approvalRequests.summary.pending_approval, 1);
    assert.equal(result.approvalRequests.items[0]?.tool_id, "agent-codex");
    assert.equal(result.approvalRequests.items[0]?.source_record_id, "manual-agent-radar-seed-agent-codex-20260708");
    assert.deepEqual(result.approvalRequests.items[0]?.duplicate_of_tool_ids, ["agent-codex"]);
    assert.deepEqual(result.approvalRequests.items[0]?.decision_options, ["approved", "rejected", "needs_changes"]);
    assert.deepEqual(result.approvalRequests.items[0]?.approval_record_template, {
      id: "approval-agent-codex-manual-agent-radar-seed-agent-codex-20260708",
      schema_version: "approval_record.v1",
      target_type: "tool_card_draft",
      target_id: "agent-codex",
      source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
      required_fields: ["decision", "reason", "reviewer", "reviewed_at"]
    });
    assert.equal(result.fieldProvenance.schema_version, "tool_card_field_value_provenance.v1");
    assert.equal(result.fieldProvenance.summary.tool_cards, 1);
    assert.ok(result.fieldProvenance.summary.field_values >= 3);
    assert.deepEqual(
      result.fieldProvenance.items.find((item) => item.tool_card_field === "summary"),
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        tool_card_field: "summary",
        source_field_path: "raw_fields.summary",
        source_value_preview: "A coding agent that can inspect workspaces, edit files, and run tests.",
        normalized_value_preview: "A coding agent that can inspect workspaces, edit files, and run tests.",
        provenance_type: "source_record"
      }
    );
    assert.equal(result.toolCardDrafts[0]?.id, "agent-codex");
    assert.deepEqual(result.toolCardDrafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708"]);

    const draftsJsonl = await readFile(join(outputDir, "data", "tool_card_drafts", "manual-agent-radar-seed.jsonl"), "utf8");
    assert.match(draftsJsonl, /"id":"agent-codex"/);
    assert.match(draftsJsonl, /manual-agent-radar-seed-agent-codex-20260708/);

    const reviewQueue = JSON.parse(await readFile(join(outputDir, "data", "review_queue", "tool_card_drafts.json"), "utf8"));
    assert.equal(reviewQueue.schema_version, "tool_card_review_queue.v1");
    assert.equal(reviewQueue.summary.ready_for_review, 1);
    assert.equal(reviewQueue.items[0].source_record_id, "manual-agent-radar-seed-agent-codex-20260708");

    const duplicateReport = JSON.parse(await readFile(join(outputDir, "data", "dedup", "tool_card_duplicates.json"), "utf8"));
    assert.equal(duplicateReport.schema_version, "tool_card_duplicate_report.v1");
    assert.equal(duplicateReport.summary.possible_duplicates, 1);
    assert.deepEqual(duplicateReport.items[0].duplicate_of_tool_ids, ["agent-codex"]);

    const approvalRequests = JSON.parse(await readFile(join(outputDir, "data", "approval_requests", "tool_card_drafts.json"), "utf8")) as {
      schema_version: string;
      summary: { pending_approval: number };
      items: Array<{ tool_id: string; approval_record_template: { target_id: string } }>;
    };
    assert.equal(approvalRequests.schema_version, "tool_card_approval_requests.v1");
    assert.equal(approvalRequests.summary.pending_approval, 1);
    assert.equal(approvalRequests.items[0]?.approval_record_template.target_id, "agent-codex");

    const approvalTemplateText = await readFile(join(outputDir, "data", "approval_requests", "approval_record_templates.jsonl"), "utf8");
    assert.equal(approvalTemplateText.endsWith("\n"), true);
    const approvalTemplateLines = approvalTemplateText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { target_id: string; decision_options: string[]; duplicate_of_tool_ids: string[] });
    assert.deepEqual(approvalTemplateLines, [
      {
        id: "approval-agent-codex-manual-agent-radar-seed-agent-codex-20260708",
        schema_version: "approval_record.v1",
        target_type: "tool_card_draft",
        target_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        required_fields: ["decision", "reason", "reviewer", "reviewed_at"],
        decision_options: ["approved", "rejected", "needs_changes"],
        duplicate_of_tool_ids: ["agent-codex"],
        duplicate_of_draft_tool_ids: [],
        validation_errors: [],
        validation_warnings: [
          "agent-codex: permissions lacks field-level evidence ref",
          "agent-codex: security lacks field-level evidence ref",
          "agent-codex: maintenance lacks field-level evidence ref"
        ]
      }
    ]);

    const fieldProvenance = JSON.parse(await readFile(join(outputDir, "data", "field_provenance", "tool_card_fields.json"), "utf8")) as {
      schema_version: string;
      summary: { tool_cards: number; field_values: number };
      items: Array<{ tool_id: string; tool_card_field: string; source_value_preview: string }>;
    };
    assert.equal(fieldProvenance.schema_version, "tool_card_field_value_provenance.v1");
    assert.equal(fieldProvenance.summary.tool_cards, 1);
    assert.ok(fieldProvenance.summary.field_values >= 3);
    assert.equal(fieldProvenance.items.find((item) => item.tool_card_field === "summary")?.source_value_preview, "A coding agent that can inspect workspaces, edit files, and run tests.");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion applies override records to draft normalization artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      overrideRecords: [
        {
          id: "override-agent-codex-summary-20260708",
          schema_version: "override_record.v1",
          target_type: "tool_card",
          target_id: "agent-codex",
          field: "summary",
          new_value: "Override summary for review queue.",
          reason: "Manual correction before review.",
          evidence_urls: ["https://developers.openai.com/codex"],
          created_by: "maintainer",
          created_at: "2026-07-08T12:00:00Z"
        }
      ],
      approvalRecords: [
        {
          id: "approval-agent-codex-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-codex",
          source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
          decision: "approved",
          reason: "Reviewed draft and override evidence.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        }
      ],
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-codex",
                schema_version: "tool_card.v1",
                name: "Codex",
                type: "agent",
                summary: "Original summary.",
                source_urls: ["https://developers.openai.com/codex"],
                docs_url: "https://developers.openai.com/codex",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run test suites"],
                not_for: ["unapproved destructive commands"],
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
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.toolCardDrafts[0]?.summary, "Override summary for review queue.");
    assert.deepEqual(result.toolCardDrafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708", "override-agent-codex-summary-20260708"]);
    assert.deepEqual(
      result.fieldProvenance.items.find((item) => item.provenance_type === "override_record" && item.tool_card_field === "summary"),
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        tool_card_field: "summary",
        source_field_path: "override_records.override-agent-codex-summary-20260708.new_value",
        source_value_preview: "Override summary for review queue.",
        normalized_value_preview: "Override summary for review queue.",
        provenance_type: "override_record",
        override_record_id: "override-agent-codex-summary-20260708"
      }
    );
    assert.equal(result.overrideRecords.length, 1);
    assert.equal(result.approvalArtifact.summary.approved, 1);
    assert.deepEqual(result.reviewQueue.items[0]?.approval, {
      decision: "approved",
      reviewer: "maintainer",
      reviewed_at: "2026-07-08T13:00:00Z",
      reason: "Reviewed draft and override evidence."
    });

    const overrides = JSON.parse(await readFile(join(outputDir, "data", "overrides", "override_records.json"), "utf8")) as { records: Array<{ id: string }> };
    assert.equal(overrides.records[0]?.id, "override-agent-codex-summary-20260708");
    const draftLines = (await readFile(join(outputDir, "data", "tool_card_drafts", "manual-agent-radar-seed.jsonl"), "utf8")).trim().split("\n");
    const draft = JSON.parse(draftLines[0] ?? "{}") as { evidence_refs?: string[] };
    assert.deepEqual(draft.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708", "override-agent-codex-summary-20260708"]);
    const approvals = JSON.parse(await readFile(join(outputDir, "data", "approvals", "approval_records.json"), "utf8")) as { summary: { approved: number } };
    assert.equal(approvals.summary.approved, 1);
    const reviewQueue = JSON.parse(await readFile(join(outputDir, "data", "review_queue", "tool_card_drafts.json"), "utf8")) as {
      items: Array<{ approval?: { decision: string } }>;
    };
    assert.equal(reviewQueue.items[0]?.approval?.decision, "approved");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes release admission for approved non-duplicate drafts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      existingToolCards: [],
      approvalRecords: [
        {
          id: "approval-agent-new-tool-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-new-tool",
          source_record_id: "manual-agent-radar-seed-agent-new-tool-20260708",
          decision: "approved",
          reason: "Reviewed new draft for release admission.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        }
      ],
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-new-tool",
                schema_version: "tool_card.v1",
                name: "New Tool",
                type: "agent",
                summary: "A newly reviewed coding agent draft.",
                source_urls: ["https://example.com/new-tool", "https://example.com/new-tool/docs"],
                docs_url: "https://example.com/new-tool/docs",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run tests"],
                not_for: ["unreviewed destructive commands"],
                tags: ["coding", "agent"],
                install_methods: [{ method: "hosted", command: "", docs_url: "https://example.com/new-tool/docs", confidence: "high" }],
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
                evidence_refs: ["manual-review-new-tool"],
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.releaseAdmission.summary.eligible_for_publish, 1);
    assert.equal(result.releaseAdmission.items[0]?.status, "eligible_for_publish");
    assert.deepEqual(result.releaseAdmission.items[0]?.blocking_reasons, []);
    assert.equal(result.promotionCandidates.schema_version, "tool_card_promotion_candidates.v1");
    assert.equal(result.promotionCandidates.summary.candidates, 1);
    assert.equal(result.promotionCandidates.items[0]?.tool_id, "agent-new-tool");
    assert.equal(result.promotionCandidates.items[0]?.approval.reviewed_by, "maintainer");
    assert.equal(result.promotionCandidates.items[0]?.draft.id, "agent-new-tool");
    assert.equal(result.promotionPlan.schema_version, "tool_card_promotion_plan.v1");
    assert.deepEqual(result.promotionPlan.summary, { candidates: 1, manual_merge_required: true });
    assert.equal(result.promotionPlan.items[0]?.tool_id, "agent-new-tool");
    assert.equal(result.promotionPlan.items[0]?.target_file, "src/data/seed-tool-cards.ts");
    assert.equal(result.promotionPlan.items[0]?.recommended_action, "manual_merge_to_seed_tool_cards");
    assert.equal(result.promotionPlan.items[0]?.seed_candidate_artifact_path, "data/promotion_candidates/seed_tool_card_candidates.ts");
    assert.equal(result.promotionCheck.schema_version, "tool_card_promotion_check.v1");
    assert.equal(result.promotionCheck.passed, true);
    assert.deepEqual(result.promotionCheck.summary, {
      candidates: 1,
      ready_for_manual_merge: 1,
      blocked: 0,
      duplicate_tool_ids: 0,
      validation_errors: 0,
      validation_warnings: 3
    });

    const admission = JSON.parse(await readFile(join(outputDir, "data", "release_admission", "tool_card_drafts.json"), "utf8")) as {
      schema_version: string;
      items: Array<{ tool_id: string; status: string }>;
    };
    assert.equal(admission.schema_version, "tool_card_release_admission.v1");
    assert.equal(admission.items[0]?.tool_id, "agent-new-tool");
    assert.equal(admission.items[0]?.status, "eligible_for_publish");
    const promotionCandidates = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "tool_cards.json"), "utf8")) as {
      schema_version: string;
      summary: { candidates: number };
      items: Array<{ tool_id: string; draft: { id: string } }>;
    };
    assert.equal(promotionCandidates.schema_version, "tool_card_promotion_candidates.v1");
    assert.equal(promotionCandidates.summary.candidates, 1);
    assert.equal(promotionCandidates.items[0]?.draft.id, "agent-new-tool");
    const promotionPlan = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "promotion_plan.json"), "utf8")) as {
      schema_version: string;
      summary: { candidates: number; manual_merge_required: boolean };
      items: Array<{ tool_id: string; target_file: string; candidate_artifact_path: string; seed_candidate_artifact_path: string }>;
    };
    assert.equal(promotionPlan.schema_version, "tool_card_promotion_plan.v1");
    assert.deepEqual(promotionPlan.summary, { candidates: 1, manual_merge_required: true });
    assert.equal(promotionPlan.items[0]?.tool_id, "agent-new-tool");
    assert.equal(promotionPlan.items[0]?.target_file, "src/data/seed-tool-cards.ts");
    assert.equal(promotionPlan.items[0]?.candidate_artifact_path, "data/promotion_candidates/tool_cards.json");
    assert.equal(promotionPlan.items[0]?.seed_candidate_artifact_path, "data/promotion_candidates/seed_tool_card_candidates.ts");

    const seedSnippet = await readFile(join(outputDir, "data", "promotion_candidates", "seed_tool_card_candidates.ts"), "utf8");
    assert.match(seedSnippet, /import type \{ ToolCard \} from "\.\.\/\.\.\/src\/schema\.js";/);
    assert.match(seedSnippet, /export const promotionSeedToolCardCandidates: ToolCard\[\] = \[/);
    assert.match(seedSnippet, /"id": "agent-new-tool"/);
    assert.match(seedSnippet, /"evidence_refs": \[\s*"manual-agent-radar-seed-agent-new-tool-20260708"\s*\]/);

    const promotionCheck = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "promotion_check.json"), "utf8")) as {
      schema_version: string;
      passed: boolean;
      summary: { ready_for_manual_merge: number; validation_warnings: number };
    };
    assert.equal(promotionCheck.schema_version, "tool_card_promotion_check.v1");
    assert.equal(promotionCheck.passed, true);
    assert.equal(promotionCheck.summary.ready_for_manual_merge, 1);
    assert.equal(promotionCheck.summary.validation_warnings, 3);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("release admission blocks approved drafts that duplicate other incoming drafts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const base = seedToolCards.find((card) => card.id === "agent-codex");
  assert.ok(base);

  try {
    const alpha = {
      ...base,
      id: "agent-alpha",
      name: "Agent Alpha",
      evidence_refs: ["manual-review-alpha"]
    };
    const beta = {
      ...base,
      id: "agent-beta",
      name: "Agent Beta",
      evidence_refs: ["manual-review-beta"]
    };

    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      existingToolCards: [],
      approvalRecords: [
        {
          id: "approval-agent-alpha-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-alpha",
          source_record_id: "manual-agent-radar-seed-agent-alpha-20260708",
          decision: "approved",
          reason: "Reviewed alpha.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        },
        {
          id: "approval-agent-beta-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-beta",
          source_record_id: "manual-agent-radar-seed-agent-beta-20260708",
          decision: "approved",
          reason: "Reviewed beta.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:05:00Z"
        }
      ],
      fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ tools: [alpha, beta] }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    assert.deepEqual(result.reviewQueue.items.map((item) => item.duplicate_of_draft_tool_ids), [["agent-beta"], ["agent-alpha"]]);
    assert.equal(result.releaseAdmission.summary.eligible_for_publish, 0);
    assert.equal(result.releaseAdmission.summary.blocked, 2);
    assert.deepEqual(result.releaseAdmission.items.map((item) => item.blocking_reasons), [["possible_duplicate"], ["possible_duplicate"]]);
    assert.equal(result.promotionCandidates.summary.candidates, 0);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
