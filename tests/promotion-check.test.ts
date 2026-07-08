import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { buildToolCardPromotionCheck } from "../src/ingestion/promotion-check.js";
import type { ToolCardPromotionCandidates } from "../src/ingestion/promotion-candidates.js";

const generatedAt = "2026-07-08T00:00:00Z";

test("promotion check passes empty candidate artifact", () => {
  const check = buildToolCardPromotionCheck(emptyCandidates(), seedToolCards, generatedAt);

  assert.equal(check.schema_version, "tool_card_promotion_check.v1");
  assert.equal(check.passed, true);
  assert.deepEqual(check.summary, {
    candidates: 0,
    ready_for_publish: 0,
    blocked: 0,
    duplicate_tool_ids: 0,
    validation_errors: 0,
    validation_warnings: 0
  });
  assert.deepEqual(check.items, []);
});

test("promotion check passes valid non-duplicate candidates", () => {
  const candidate = {
    ...seedToolCards[0],
    id: "skill-new-reviewed-docs",
    name: "New Reviewed Docs Skill",
    evidence_refs: ["manual-review-new-reviewed-docs"]
  };
  const check = buildToolCardPromotionCheck(candidatesWithDraft(candidate), seedToolCards, generatedAt);

  assert.equal(check.passed, true);
  assert.deepEqual(check.summary, {
    candidates: 1,
    ready_for_publish: 1,
    blocked: 0,
    duplicate_tool_ids: 0,
    validation_errors: 0,
    validation_warnings: 0
  });
  assert.deepEqual(check.items[0], {
    tool_id: "skill-new-reviewed-docs",
    source_record_id: "source-record-skill-new-reviewed-docs",
    status: "ready_for_publish",
    blocking_reasons: [],
    duplicate_of_tool_ids: [],
    validation_errors: [],
    validation_warnings: []
  });
});

test("promotion check blocks duplicates and invalid candidate cards", () => {
  const duplicateAndInvalid = {
    ...seedToolCards[0],
    source_urls: [],
    install_methods: []
  };
  const check = buildToolCardPromotionCheck(candidatesWithDraft(duplicateAndInvalid), seedToolCards, generatedAt);

  assert.equal(check.passed, false);
  assert.equal(check.summary.candidates, 1);
  assert.equal(check.summary.ready_for_publish, 0);
  assert.equal(check.summary.blocked, 1);
  assert.equal(check.summary.duplicate_tool_ids, 1);
  assert.equal(check.summary.validation_errors > 0, true);
  assert.equal(check.items[0]?.status, "blocked");
  assert.deepEqual(check.items[0]?.duplicate_of_tool_ids, [seedToolCards[0].id]);
  assert.match(check.items[0]?.blocking_reasons.join("\n") ?? "", /duplicate_existing_tool_id/);
  assert.match(check.items[0]?.validation_errors.join("\n") ?? "", /source_urls is required/);
  assert.match(check.items[0]?.validation_errors.join("\n") ?? "", /install_methods is required/);
});

function emptyCandidates(): ToolCardPromotionCandidates {
  return {
    schema_version: "tool_card_promotion_candidates.v1",
    generated_at: generatedAt,
    summary: { candidates: 0 },
    items: []
  };
}

function candidatesWithDraft(draft: ToolCardPromotionCandidates["items"][number]["draft"]): ToolCardPromotionCandidates {
  return {
    schema_version: "tool_card_promotion_candidates.v1",
    generated_at: generatedAt,
    summary: { candidates: 1 },
    items: [
      {
        tool_id: draft.id,
        source_record_id: `source-record-${draft.id}`,
        draft,
        review: {
          gate: "manual_approval",
          reviewed_by: "maintainer",
          reviewed_at: generatedAt,
          reason: "Reviewed for promotion dry-run."
        },
        promotion_status: "candidate"
      }
    ]
  };
}
