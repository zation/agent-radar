import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardConflictReport } from "../src/ingestion/field-conflicts.js";
import { buildToolCardInterventionRequests } from "../src/ingestion/intervention-requests.js";
import { normalizeToolCardDraftsWithEvidence } from "../src/ingestion/normalizer.js";
import { buildToolCardReleaseAdmission } from "../src/ingestion/release-admission.js";
import type { ToolCardReviewQueue } from "../src/ingestion/review-queue.js";
import type { SourceDefinition, SourceRecord } from "../src/schema.js";

function source(id: string): SourceDefinition {
  return {
    id,
    name: id,
    url: `https://github.com/example/${id}`,
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "active_open_source",
    field_coverage: ["description", "repo_url"],
    terms_notes: "Public metadata fixture.",
    parser: "github_repo_parser",
    failure_policy: "skip",
    enabled: true,
    owner: "test",
    last_reviewed_at: "2026-07-10T00:00:00Z",
  };
}

function record(id: string, summary: string): SourceRecord {
  return {
    id,
    schema_version: "source_record.v1",
    snapshot_id: `snapshot-${id}`,
    source_id: `source-${id}`,
    record_type: "repository",
    name: "example/tool",
    description: summary,
    urls: ["https://github.com/example/tool"],
    raw_fields: {},
    parsed_fields: {
      repo_url: "https://github.com/example/tool",
      license: "MIT",
      source_profile: { tool_id: "mcp-example", type: "mcp" },
    },
    source_confidence: "medium",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_repo_parser.v1",
    warnings: [],
  };
}

test("conflict report preserves identity, candidates, and unresolved critical counts", () => {
  const records = [record("a", "First incompatible scope."), record("b", "Second incompatible scope.")];
  const normalized = normalizeToolCardDraftsWithEvidence(records, [], [source("source-a"), source("source-b")]);
  const report = buildToolCardConflictReport(
    normalized.drafts,
    normalized.evidence,
    "2026-07-10T01:00:00Z",
  );
  const summaryConflict = report.items.find((item) => item.tool_card_field === "summary");

  assert.equal(report.schema_version, "tool_card_conflict_report.v1");
  assert.equal(report.summary.unresolved_critical, 1);
  assert.equal(summaryConflict?.canonical_identity.repository, "https://github.com/example/tool");
  assert.deepEqual(summaryConflict?.canonical_identity.aliases, ["mcp-example"]);
  assert.equal(summaryConflict?.candidates.length, 2);
  assert.equal(summaryConflict?.suggested_action, "resolve_field_conflict");
});

test("unresolved critical conflicts create an intervention and block release admission", () => {
  const records = [record("a", "First incompatible scope."), record("b", "Second incompatible scope.")];
  const normalized = normalizeToolCardDraftsWithEvidence(records, [], [source("source-a"), source("source-b")]);
  const report = buildToolCardConflictReport(
    normalized.drafts,
    normalized.evidence,
    "2026-07-10T01:00:00Z",
  );
  const reviewQueue: ToolCardReviewQueue = {
    schema_version: "tool_card_review_queue.v1",
    generated_at: "2026-07-10T01:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: "mcp-example",
      name: "Example",
      source_id: "source-a",
      source_record_id: "a",
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      approval: {
        decision: "approved",
        reviewer: "reviewer",
        reviewed_at: "2026-07-10T01:00:00Z",
        reason: "Reviewed.",
      },
      status: "ready_for_review",
      validation_errors: [],
      validation_warnings: [],
    }],
  };

  const interventions = buildToolCardInterventionRequests(
    reviewQueue,
    "2026-07-10T01:00:00Z",
    report,
  );
  const admission = buildToolCardReleaseAdmission(
    reviewQueue,
    "2026-07-10T01:00:00Z",
    undefined,
    report,
  );

  assert.equal(interventions.summary.unresolved_critical_conflicts, 1);
  assert.equal(interventions.items[0]?.suggested_action, "resolve_field_conflict");
  assert.equal(interventions.items[0]?.tool_card_field, "summary");
  assert.equal(admission.items[0]?.status, "blocked");
  assert.ok(
    admission.items[0]?.blocking_reasons.includes("unresolved_critical_field_conflict"),
  );
});
