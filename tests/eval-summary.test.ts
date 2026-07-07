import assert from "node:assert/strict";
import test from "node:test";
import { validateEvalSummaryForRelease } from "../src/eval/check-summary.js";

test("release eval summary validation accepts all passing cases", () => {
  assert.doesNotThrow(() =>
    validateEvalSummaryForRelease({
      passed: 2,
      total: 2,
      results: [
        { case_id: "a", passed: true, failures: [], recommended_action: "use", top_tool_ids: ["tool-a"] },
        { case_id: "b", passed: true, failures: [], recommended_action: "no_reliable_match", top_tool_ids: [] }
      ]
    })
  );
});

test("release eval summary validation rejects failed cases", () => {
  assert.throws(
    () =>
      validateEvalSummaryForRelease({
        passed: 1,
        total: 2,
        results: [
          { case_id: "a", passed: true, failures: [], recommended_action: "use", top_tool_ids: ["tool-a"] },
          { case_id: "b", passed: false, failures: ["expected no_reliable_match"], recommended_action: "ask_human", top_tool_ids: ["tool-b"] }
        ]
      }),
    /release eval failed: 1\/2/
  );
});
