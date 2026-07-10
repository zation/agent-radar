import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardAutoReview } from "../src/ingestion/auto-review.js";
import { buildToolCardInterventionRequests } from "../src/ingestion/intervention-requests.js";
import type { SourceRecord } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const base = reviewedToolCardFixtures.find((card) => card.id === "agent-codex");
assert.ok(base);

test("reviewed exact-source profiles can resolve optional upstream metadata warnings", () => {
  const draft = { ...base, id: "agent-profiled", evidence_refs: ["record-profiled"] };
  const sourceRecord: SourceRecord = {
    id: "record-profiled",
    schema_version: "source_record.v1",
    snapshot_id: "snapshot-profiled",
    source_id: "github-repo-profiled",
    record_type: "repository",
    name: "owner/profiled",
    description: undefined,
    urls: ["https://github.com/owner/profiled"],
    raw_fields: {},
    parsed_fields: { source_profile: { tool_id: draft.id } },
    source_confidence: "high",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_repo_parser.v1",
    warnings: ["missing_description", "missing_license"]
  };
  const reviewQueue = {
    schema_version: "tool_card_review_queue.v1" as const,
    generated_at: "2026-07-10T00:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: draft.id,
      name: draft.name,
      source_id: sourceRecord.source_id,
      source_record_id: sourceRecord.id,
      status: "ready_for_review" as const,
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      validation_errors: [],
      validation_warnings: [],
      approval: undefined
    }]
  };

  const artifact = buildToolCardAutoReview([draft], [sourceRecord], reviewQueue, "2026-07-10T00:00:00Z");

  assert.equal(artifact.items[0]?.suggested_action, "promote");
  assert.deepEqual(artifact.items[0]?.human_review_reasons, []);
});

test("discovery collection repositories are rejected without creating intervention debt", () => {
  const draft = { ...base, id: "mcp-awesome-catalog", name: "owner/awesome-mcp", evidence_refs: ["record-awesome"] };
  const sourceRecord: SourceRecord = {
    id: "record-awesome",
    schema_version: "source_record.v1",
    snapshot_id: "snapshot-awesome",
    source_id: "github-topic-mcp",
    record_type: "repository",
    name: "owner/awesome-mcp",
    description: "A curated list of MCP projects.",
    urls: ["https://github.com/owner/awesome-mcp"],
    raw_fields: {},
    parsed_fields: {},
    source_confidence: "medium",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_topic_parser.v1",
    warnings: []
  };
  const reviewQueue = {
    schema_version: "tool_card_review_queue.v1" as const,
    generated_at: "2026-07-10T00:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: draft.id,
      name: draft.name,
      source_id: sourceRecord.source_id,
      source_record_id: sourceRecord.id,
      status: "ready_for_review" as const,
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      validation_errors: [],
      validation_warnings: [],
      approval: undefined
    }]
  };

  const autoReview = buildToolCardAutoReview([draft], [sourceRecord], reviewQueue, "2026-07-10T00:00:00Z");
  const interventions = buildToolCardInterventionRequests(reviewQueue, "2026-07-10T00:00:00Z", undefined, autoReview);

  assert.equal(autoReview.items[0]?.suggested_action, "reject");
  assert.equal(interventions.summary.pending_intervention, 0);
});
