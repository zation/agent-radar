import assert from "node:assert/strict";
import test from "node:test";
import type { SourceRegistryReviewRequests } from "../src/ingestion/source-review.js";
import { createSourceReviewRows } from "../src/ui/review-view.js";

const reviewRequests: SourceRegistryReviewRequests = {
  schema_version: "source_registry_review_requests.v1",
  generated_at: "2026-07-08T00:00:00Z",
  summary: {
    pending_review: 2,
    confirmation_required: 1
  },
  items: [
    {
      source_id: "github-topic-mcp",
      field: "enabled",
      reason: "Enabled source changes crawler scope and trust assumptions.",
      confirmation_required: true,
      decision_options: ["confirmed", "rejected", "needs_changes"],
      review_record_template: {
        id: "source-review-github-topic-mcp-enabled",
        schema_version: "source_registry_review_record.v1",
        source_id: "github-topic-mcp",
        field: "enabled",
        required_fields: ["decision", "reason", "reviewer", "reviewed_at"]
      }
    },
    {
      source_id: "manual-agent-radar-seed",
      field: "parser",
      reason: "Parser changes affect how raw snapshots become Source Records.",
      confirmation_required: false,
      decision_options: ["confirmed", "rejected", "needs_changes"],
      review_record_template: {
        id: "source-review-manual-agent-radar-seed-parser",
        schema_version: "source_registry_review_record.v1",
        source_id: "manual-agent-radar-seed",
        field: "parser",
        required_fields: ["decision", "reason", "reviewer", "reviewed_at"]
      }
    }
  ]
};

test("creates source review rows for the UI audit surface", () => {
  const rows = createSourceReviewRows(reviewRequests);

  assert.deepEqual(
    rows.map((row) => row.id),
    ["source-review-github-topic-mcp-enabled", "source-review-manual-agent-radar-seed-parser"]
  );
  assert.deepEqual(rows[0], {
    id: "source-review-github-topic-mcp-enabled",
    sourceId: "github-topic-mcp",
    field: "enabled",
    reason: "Enabled source changes crawler scope and trust assumptions.",
    priority: "confirmation required",
    decisionOptions: "confirmed, rejected, needs_changes",
    requiredFields: "decision, reason, reviewer, reviewed_at"
  });
  assert.equal(rows[1]?.priority, "review requested");
});
