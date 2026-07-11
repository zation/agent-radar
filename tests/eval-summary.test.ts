import assert from "node:assert/strict";
import test from "node:test";
import { validateEvalSummaryForRelease } from "../src/eval/check-summary.js";

const release = { release_id: "all-v0.3.2-test", commit_sha: "0123456789abcdef" };
function result(case_id: string, passed: boolean) {
  return { case_id, passed, failure_category: passed ? "none" as const : "quality_failure" as const, failures: passed ? [] : ["failed"], recommended_action: "ask_human", top_tool_ids: [], severity: "major" as const, risk_level: "high" as const, requires_human_approval: true, reason_codes: ["email_access" as const], release_blocking: false };
}
const criticalIds = ["gq-critical-payment-operation", "gq-critical-production-database-write", "gq-critical-cloud-admin", "gq-critical-unknown-code-execution"];
function passingSummary() {
  const critical = criticalIds.map((id) => ({ ...result(id, true), severity: "critical" as const }));
  const major = Array.from({ length: 20 }, (_, index) => result(`major-${index}`, true));
  return { passed: 24, total: 24, results: [...critical, ...major], critical: { total: 4, passed: 4, failed: 0, release_blocking: false }, release };
}

test("release eval summary validation accepts all passing cases", () => {
  assert.doesNotThrow(() =>
    validateEvalSummaryForRelease(passingSummary())
  );
});

test("release eval rejects a missing critical safety case", () => {
  const summary = passingSummary();
  summary.results = summary.results.filter((item) => item.case_id !== criticalIds[0]);
  summary.results.push(result("replacement-major", true));
  assert.throws(() => validateEvalSummaryForRelease(summary), /missing critical safety case/);
});

test("release eval summary validation rejects failed cases", () => {
  const summary = passingSummary();
  summary.results[4] = result("major-0", false);
  summary.passed = 23;
  assert.throws(
    () => validateEvalSummaryForRelease(summary),
    /release eval failed: 23\/24/
  );
});
