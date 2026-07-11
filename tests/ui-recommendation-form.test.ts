import assert from "node:assert/strict";
import test from "node:test";
import type { RecommendationResult } from "../src/schema.js";
import { buildCollapsedRecommendationSummary, getRecommendationSubmitLabel, getRecommendationUiState } from "../src/ui/recommendation-form.js";

function makeResult(action: RecommendationResult["recommended_action"]): RecommendationResult {
  return {
    id: `rec-${action}`,
    schema_version: "recommendation_result.v2",
    release: { release_id: "dev", commit_sha: "dev" },
    query: { task: "test task" },
    query_understanding: { intent: "test", task_domains: [], required_capabilities: [], likely_permissions: [], tool_type_hints: [], risk_flags: [], confidence: "medium" },
    recommended_action: action,
    safety_assessment: {
      risk_level: action === "ask_human" ? "high" : "low",
      reason_codes: [],
      requires_human_approval: action === "ask_human",
      approval_reason: action === "ask_human" ? "Confirm access." : undefined,
      confirmation_questions: [],
      safe_defaults: [],
      maximum_allowed_action: action
    },
    candidates: [],
    rejected_candidates: [],
    no_match_reason: action === "no_reliable_match" ? "No reliable tool." : undefined
  };
}

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

test("models adaptive recommendation composer states", () => {
  assert.deepEqual(getRecommendationUiState({ isSubmitting: true, result: null, error: "" }), { kind: "loading", shouldCollapse: false });
  assert.deepEqual(getRecommendationUiState({ isSubmitting: false, result: makeResult("use"), error: "" }), { kind: "success", shouldCollapse: true });
  assert.deepEqual(getRecommendationUiState({ isSubmitting: false, result: makeResult("ask_human"), error: "" }), { kind: "ask_human", shouldCollapse: false, inlineMessage: "Confirm access." });
  assert.deepEqual(getRecommendationUiState({ isSubmitting: false, result: makeResult("no_reliable_match"), error: "" }), { kind: "no_reliable_match", shouldCollapse: false, inlineMessage: "No reliable tool." });
  assert.deepEqual(getRecommendationUiState({ isSubmitting: false, result: null, error: "rate limited" }), { kind: "error", shouldCollapse: false, inlineMessage: "rate limited" });
  assert.deepEqual(getRecommendationUiState({ isSubmitting: false, result: null, error: "" }), { kind: "idle", shouldCollapse: false });
});
