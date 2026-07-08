import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import { runIngestion } from "../src/ingestion/run.js";
import { getEnabledSources, sourceRegistry, validateSourceRegistry } from "../src/ingestion/source-registry.js";

test("source registry exposes only enabled MVP sources", () => {
  const enabled = getEnabledSources(sourceRegistry);

  assert.deepEqual(enabled.map((source) => source.id), ["manual-agent-radar-seed"]);
  assert.equal(enabled[0]?.collection_method, "manual");
  assert.equal(enabled[0]?.trust_level, "official");
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
      parser: "github_topic_parser"
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: parser github_topic_parser is not implemented/);
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
