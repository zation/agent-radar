import assert from "node:assert/strict";
import test from "node:test";
import { normalizeToolCardDrafts, type OverrideRecord } from "../src/ingestion/normalizer.js";
import type { SourceRecord } from "../src/schema.js";

const sourceRecord: SourceRecord = {
  id: "manual-agent-radar-seed-agent-example-20260708",
  schema_version: "source_record.v1",
  snapshot_id: "snapshot-1",
  source_id: "manual-agent-radar-seed",
  record_type: "manual",
  name: "Example Agent",
  urls: ["https://example.com/agent"],
  raw_fields: {
    id: "agent-example",
    schema_version: "tool_card.v1",
    name: "Example Agent",
    type: "agent",
    summary: "Original summary.",
    source_urls: ["https://example.com/agent"],
    primary_purpose: "coding_agent",
    use_cases: ["modify code"],
    not_for: ["unreviewed production changes"],
    tags: ["agent", "coding"],
    install_methods: [{ method: "hosted", command: "", docs_url: "https://example.com/agent", confidence: "high" }],
    auth_required: "account",
    permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Edits workspace files." }],
    maintenance: {
      status: "active",
      issue_activity: "active",
      maintainer_type: "official",
      signals: ["manual_seed"]
    },
    security: {
      risk_level: "high",
      trust_level: "official",
      known_risks: ["filesystem_write"],
      requires_human_approval: true,
      security_notes: "Review changes before accepting."
    },
    maturity: "stable",
    evidence_refs: ["manual-original"],
    last_checked_at: "2026-07-08T00:00:00Z",
    confidence: "high",
    created_at: "2026-07-08T00:00:00Z",
    updated_at: "2026-07-08T00:00:00Z"
  },
  parsed_fields: { tool_id: "agent-example", type: "agent" },
  source_confidence: "high",
  parsed_at: "2026-07-08T00:00:00Z",
  parser_version: "manual_seed_parser.v1",
  warnings: []
};

test("normalizer creates reviewed Tool Card drafts from clean manual source records", () => {
  const drafts = normalizeToolCardDrafts([sourceRecord]);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.id, "agent-example");
  assert.deepEqual(drafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-example-20260708"]);
  assert.equal(drafts[0]?.updated_at, "2026-07-08T00:00:00Z");
});

test("normalizer applies auditable override records to matching draft fields", () => {
  const override: OverrideRecord = {
    id: "override-agent-example-summary-20260708",
    schema_version: "override_record.v1",
    target_type: "tool_card",
    target_id: "agent-example",
    field: "summary",
    new_value: "Override summary with source-backed correction.",
    reason: "Official page clarified scope.",
    evidence_urls: ["https://example.com/agent"],
    created_by: "maintainer",
    created_at: "2026-07-08T12:00:00Z"
  };

  const drafts = normalizeToolCardDrafts([sourceRecord], [override]);

  assert.equal(drafts[0]?.summary, "Override summary with source-backed correction.");
  assert.deepEqual(drafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-example-20260708", "override-agent-example-summary-20260708"]);
});

test("normalizer merges cross-source repository and package records into one draft", () => {
  const records: SourceRecord[] = [
    {
      id: "github-topic-mcp-modelcontextprotocol-typescript-sdk-20260708",
      schema_version: "source_record.v1",
      snapshot_id: "snapshot-github",
      source_id: "github-topic-mcp",
      record_type: "repository",
      name: "modelcontextprotocol/typescript-sdk",
      description: "Model Context Protocol TypeScript SDK.",
      urls: ["https://github.com/modelcontextprotocol/typescript-sdk"],
      raw_fields: {},
      parsed_fields: {
        repo_url: "https://github.com/modelcontextprotocol/typescript-sdk",
        stars: 9000,
        license: "MIT",
        last_commit_at: "2026-07-07T12:00:00Z",
        topics: ["mcp", "model-context-protocol", "typescript"]
      },
      source_confidence: "medium",
      parsed_at: "2026-07-08T00:00:00Z",
      parser_version: "github_topic_parser.v1",
      warnings: []
    },
    {
      id: "npm-modelcontextprotocol-sdk-modelcontextprotocol-sdk-20260708",
      schema_version: "source_record.v1",
      snapshot_id: "snapshot-npm",
      source_id: "npm-modelcontextprotocol-sdk",
      record_type: "package",
      name: "@modelcontextprotocol/sdk",
      description: "Model Context Protocol SDK package.",
      urls: ["https://www.npmjs.com/package/@modelcontextprotocol/sdk", "https://github.com/modelcontextprotocol/typescript-sdk"],
      raw_fields: {},
      parsed_fields: {
        package_name: "@modelcontextprotocol/sdk",
        package_url: "https://www.npmjs.com/package/@modelcontextprotocol/sdk",
        repo_url: "https://github.com/modelcontextprotocol/typescript-sdk",
        latest_version: "1.2.3",
        last_release_at: "2026-07-07T12:00:00.000Z",
        keywords: ["mcp", "typescript"]
      },
      source_confidence: "medium",
      parsed_at: "2026-07-08T00:00:00Z",
      parser_version: "npm_package_parser.v1",
      warnings: []
    }
  ];

  const drafts = normalizeToolCardDrafts(records);

  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.id, "mcp-modelcontextprotocol-typescript-sdk");
  assert.equal(drafts[0]?.repo_url, "https://github.com/modelcontextprotocol/typescript-sdk");
  assert.deepEqual(drafts[0]?.package_urls, ["https://www.npmjs.com/package/@modelcontextprotocol/sdk"]);
  assert.deepEqual(drafts[0]?.evidence_refs, records.map((record) => record.id));
  assert.equal(drafts[0]?.maintenance.last_release_at, "2026-07-07T12:00:00.000Z");
});

test("normalizer rejects override records without evidence", () => {
  const override: OverrideRecord = {
    id: "override-agent-example-summary-20260708",
    schema_version: "override_record.v1",
    target_type: "tool_card",
    target_id: "agent-example",
    field: "summary",
    new_value: "Unsupported correction.",
    reason: "No evidence.",
    evidence_urls: [],
    created_by: "maintainer",
    created_at: "2026-07-08T12:00:00Z"
  };

  assert.throws(() => normalizeToolCardDrafts([sourceRecord], [override]), /evidence_urls is required/);
});
