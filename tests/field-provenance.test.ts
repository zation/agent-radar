import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardFieldValueProvenanceV2 } from "../src/ingestion/field-provenance.js";
import { normalizeToolCardDraftsWithEvidence } from "../src/ingestion/normalizer.js";
import type { SourceRecord, ToolCard } from "../src/schema.js";

const card: ToolCard = {
  id: "agent-example",
  schema_version: "tool_card.v1",
  name: "Example Agent",
  type: "agent",
  summary: "Example agent summary.",
  source_urls: ["https://example.com/agent"],
  repo_url: "https://github.com/example/agent",
  license: "MIT",
  primary_purpose: "coding_agent",
  use_cases: ["Edit code."],
  not_for: ["Unreviewed production changes."],
  tags: ["agent", "coding"],
  install_methods: [
    {
      method: "source",
      command: "",
      docs_url: "https://github.com/example/agent",
      confidence: "high",
    },
  ],
  auth_required: "account",
  permissions: [
    {
      scope: "filesystem",
      access: "read_write",
      required: true,
      notes: "Edits files.",
    },
  ],
  maintenance: {
    status: "active",
    issue_activity: "active",
    maintainer_type: "official",
    signals: ["manual_review"],
  },
  security: {
    risk_level: "high",
    trust_level: "official",
    known_risks: ["filesystem_write"],
    requires_human_approval: true,
    security_notes: "Review changes.",
  },
  maturity: "stable",
  evidence_refs: ["record-example"],
  last_checked_at: "2026-07-10T00:00:00Z",
  confidence: "high",
  created_at: "2026-07-10T00:00:00Z",
  updated_at: "2026-07-10T00:00:00Z",
};

const record: SourceRecord = {
  id: "record-example",
  schema_version: "source_record.v1",
  snapshot_id: "snapshot-example",
  source_id: "manual-example",
  record_type: "manual",
  name: card.name,
  urls: card.source_urls,
  raw_fields: card as unknown as Record<string, unknown>,
  parsed_fields: { tool_id: card.id, type: card.type },
  source_confidence: "high",
  parsed_at: "2026-07-10T00:00:00Z",
  parser_version: "manual_seed_parser.v1",
  warnings: [],
};

test("field provenance v2 covers every critical field for a normalized card", () => {
  const normalized = normalizeToolCardDraftsWithEvidence([record]);
  const artifact = buildToolCardFieldValueProvenanceV2(
    normalized.drafts,
    normalized.evidence,
    "2026-07-10T01:00:00Z",
  );

  assert.equal(artifact.schema_version, "tool_card_field_value_provenance.v2");
  assert.equal(artifact.critical_fields.length, 10);
  assert.equal(artifact.summary.published_tool_count, 1);
  assert.equal(artifact.summary.required_selection_count, 10);
  assert.equal(artifact.summary.covered_selection_count, 10);
  assert.equal(artifact.summary.critical_coverage, 1);
  assert.deepEqual(
    artifact.items.map((item) => item.tool_card_field).sort(),
    [...artifact.critical_fields].sort(),
  );
  assert.ok(
    artifact.items.every((item) =>
      item.candidates.every((candidate) => /^[a-f0-9]{64}$/.test(candidate.source_value_hash)),
    ),
  );
  const permissionCandidate = artifact.items
    .find((item) => item.tool_card_field === "permissions")
    ?.candidates[0];
  assert.ok(permissionCandidate?.source_leaf_paths.includes("raw_fields.permissions[0].scope"));
  assert.ok(permissionCandidate?.source_leaf_paths.includes("raw_fields.permissions[0].required"));
});

test("field provenance v2 redacts credential-like values from previews", () => {
  const secretRecord: SourceRecord = {
    ...record,
    raw_fields: {
      ...record.raw_fields,
      summary: "Authorization: Bearer secret-token",
    },
  };
  const normalized = normalizeToolCardDraftsWithEvidence([secretRecord]);
  const artifact = buildToolCardFieldValueProvenanceV2(
    normalized.drafts,
    normalized.evidence,
    "2026-07-10T01:00:00Z",
  );
  const serialized = JSON.stringify(artifact);

  assert.doesNotMatch(serialized, /secret-token/);
  assert.match(serialized, /\[REDACTED\]/);
});
