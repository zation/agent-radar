import assert from "node:assert/strict";
import test from "node:test";
import { buildCollapsedRecommendationSummary, getRecommendationSubmitLabel } from "../src/ui/recommendation-form.js";

test("formats collapsed recommendation input summary", () => {
  const summary = buildCollapsedRecommendationSummary({
    query: "  在 Codex 中读取 Gmail 并总结待办  ",
    modelName: "OpenAI GPT-4.1",
    riskTolerance: "low"
  });

  assert.deepEqual(summary, {
    title: "在 Codex 中读取 Gmail 并总结待办",
    meta: "OpenAI GPT-4.1 · low risk"
  });
});

test("shows a stable submit label while recommendation is running", () => {
  assert.equal(getRecommendationSubmitLabel(false), "Submit");
  assert.equal(getRecommendationSubmitLabel(true), "Submitting");
});
