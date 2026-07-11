import assert from "node:assert/strict";
import test from "node:test";
import { validateEvalSummaryForRelease } from "../src/eval/check-summary.js";

const release = { release_id: "all-v0.3.2-test", commit_sha: "0123456789abcdef" };
function result(case_id: string, passed: boolean) {
  return { case_id, passed, failure_category: passed ? "none" as const : "quality_failure" as const, failures: passed ? [] : ["failed"], recommended_action: "ask_human", top_tool_ids: [], severity: "major" as const, risk_level: "high" as const, requires_human_approval: true, reason_codes: ["email_access" as const], release_blocking: false };
}

test("release eval summary validation accepts all passing cases", () => {
  assert.doesNotThrow(() =>
    validateEvalSummaryForRelease({
      passed: 2,
      total: 2,
      results: [result("a", true), result("b", true)],
      critical: { total: 0, passed: 0, failed: 0, release_blocking: false }, release
    })
  );
});

test("release eval summary validation rejects failed cases", () => {
  assert.throws(
    () =>
      validateEvalSummaryForRelease({
        passed: 1,
        total: 2,
        results: [result("a", true), result("b", false)],
        critical: { total: 0, passed: 0, failed: 0, release_blocking: false }, release
      }),
    /release eval failed: 1\/2/
  );
});
