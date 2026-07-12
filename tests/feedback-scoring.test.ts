import assert from "node:assert/strict";
import test from "node:test";
import { calculateFeedbackAdjustment } from "../src/feedback-processing/scoring.js";
import { rateToolCard } from "../src/rating/engine.js";
import type { ToolCard } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const checksum = `sha256:${"c".repeat(64)}` as const;

test("adds D1 and accepted Issue signals independently using exact tenths and caps", () => {
  const adjustment = calculateFeedbackAdjustment({
    tool_id: "skill-openai-docs", up_count: 3, down_count: 0, d1_adjustment: 0.6,
    issue_adjustment: -1, raw_adjustment: -0.4, applied_adjustment: -0.4, accepted_issue_ids: [12],
  }, checksum);
  assert.deepEqual(adjustment, {
    d1: 0.6, accepted_issues: -1, raw: -0.4, applied: -0.4, cap: 3,
    rules_version: "feedback_rules.v0.1", vote_snapshot_checksum: checksum, accepted_issue_ids: [12],
  });

  assert.equal(calculateFeedbackAdjustment({
    tool_id: "x", up_count: 11, down_count: 0, d1_adjustment: 2.2,
    issue_adjustment: 1, raw_adjustment: 3.2, applied_adjustment: 3, accepted_issue_ids: [1],
  }, checksum).applied, 3);
});

test("rating v2 preserves dimensions and safety gates while applying final score", () => {
  const card = reviewedToolCardFixtures.find(({ id }) => id === "skill-openai-docs")!;
  const base = rateToolCard(card);
  const adjusted = rateToolCard(card, calculateFeedbackAdjustment({
    tool_id: card.id, up_count: 3, down_count: 0, d1_adjustment: 0.6,
    issue_adjustment: -1, raw_adjustment: -0.4, applied_adjustment: -0.4, accepted_issue_ids: [12],
  }, checksum));
  assert.equal(adjusted.schema_version, "rating_result.v2");
  assert.equal(adjusted.base_score, base.base_score);
  assert.equal(adjusted.overall_score, base.base_score - 0.4);
  assert.deepEqual(adjusted.dimension_scores, base.dimension_scores);
  assert.equal(adjusted.risk_level, base.risk_level);

  const unsafe: ToolCard = {
    ...card, id: "unsafe", confidence: "low",
    permissions: [{ scope: "code_execution", access: "execute", required: true, notes: "Runs code" }],
    security: { ...card.security, risk_level: "unknown", trust_level: "unknown" },
  };
  const unsafeAdjusted = rateToolCard(unsafe, calculateFeedbackAdjustment({
    tool_id: "unsafe", up_count: 100, down_count: 0, d1_adjustment: 20,
    issue_adjustment: 10, raw_adjustment: 30, applied_adjustment: 3, accepted_issue_ids: [1, 2],
  }, checksum));
  assert.equal(unsafeAdjusted.recommendation_level, "avoid");
  assert.equal(unsafeAdjusted.risk_level, "high");
});
