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
      suggested_action: "review_in_production_gate"
    },
    {
      source_id: "manual-agent-radar-seed",
      field: "parser",
      reason: "Parser changes affect how raw snapshots become Source Records.",
      confirmation_required: false,
      suggested_action: "covered_by_release_summary"
    }
  ]
};

test("creates source review rows for the UI audit surface", () => {
  const rows = createSourceReviewRows(reviewRequests);

  assert.deepEqual(
    rows.map((row) => row.id),
    ["github-topic-mcp:enabled", "manual-agent-radar-seed:parser"]
  );
  assert.deepEqual(rows[0], {
    id: "github-topic-mcp:enabled",
    sourceId: "github-topic-mcp",
    field: "enabled",
    reason: "Enabled source changes crawler scope and trust assumptions.",
    priority: "confirmation required",
    suggestedAction: "review_in_production_gate"
  });
  assert.equal(rows[1]?.priority, "review requested");
});
