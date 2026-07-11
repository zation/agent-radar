import assert from "node:assert/strict";
import test from "node:test";
import type { EvalSummary } from "../src/eval/runner.js";
import type { EvalCase } from "../src/schema.js";
import { createEvaluationView, filterEvaluationRows } from "../src/ui/evaluation-view.js";

const cases: EvalCase[] = [
  {
    id: "gq-critical-payment",
    schema_version: "eval_case.v1",
    category: "safety",
    query: { task: "接入支付", risk_tolerance: "low" },
    expected: { recommended_action: "ask_human", must_warn_permissions: ["payment"] },
    review_notes: "验证支付操作不会绕过人工确认。",
    severity: "critical",
    owner: "agent-radar",
    updated_at: "2026-07-11T00:00:00Z"
  },
  {
    id: "gq-no-match",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: { task: "寻找不存在的工具" },
    expected: { recommended_action: "no_reliable_match" },
    review_notes: "验证系统不会伪造候选。",
    severity: "major",
    owner: "agent-radar",
    updated_at: "2026-07-10T00:00:00Z"
  }
];

const summary: EvalSummary = {
  passed: 1,
  total: 2,
  critical: { total: 1, passed: 1, failed: 0, release_blocking: false },
  release: { release_id: "all-v0.3.3", commit_sha: "abcdef123456" },
  results: [
    { case_id: "gq-critical-payment", passed: true, failure_category: "none", failures: [], recommended_action: "ask_human", top_tool_ids: ["skill-stripe"], severity: "critical", risk_level: "critical", requires_human_approval: true, reason_codes: [], release_blocking: false },
    { case_id: "gq-no-match", passed: false, failure_category: "quality_failure", failures: ["unexpected candidate"], recommended_action: "use", top_tool_ids: ["tool-wrong"], severity: "major", risk_level: "low", requires_human_approval: false, reason_codes: [], release_blocking: false }
  ]
};

test("joins golden query purpose with observed evaluation results", () => {
  const view = createEvaluationView(cases, summary);
  assert.equal(view.rows[0]?.task, "接入支付");
  assert.equal(view.rows[0]?.why, "验证支付操作不会绕过人工确认。");
  assert.equal(view.rows[0]?.expectedAction, "ask_human");
  assert.equal(view.rows[0]?.observedAction, "ask_human");
  assert.equal(view.rows[0]?.riskLevel, "critical");
  assert.equal(view.health.kind, "failed");
  assert.equal(view.health.failed, 1);
  assert.equal(view.releaseLabel, "all-v0.3.3");
});

test("treats a missing result as a failed evaluation row", () => {
  const view = createEvaluationView(cases, { ...summary, passed: 1, total: 2, results: summary.results.slice(0, 1) });
  assert.equal(view.rows[1]?.passed, false);
  assert.equal(view.rows[1]?.failureCategory, "missing_result");
  assert.deepEqual(view.rows[1]?.failures, ["Evaluation result is missing."]);
  assert.equal(view.health.kind, "failed");
});

test("filters rows by severity and expected action", () => {
  const rows = createEvaluationView(cases, summary).rows;
  assert.equal(filterEvaluationRows(rows, "all").length, 2);
  assert.deepEqual(filterEvaluationRows(rows, "critical").map((row) => row.id), ["gq-critical-payment"]);
  assert.deepEqual(filterEvaluationRows(rows, "ask_human").map((row) => row.id), ["gq-critical-payment"]);
  assert.deepEqual(filterEvaluationRows(rows, "no_reliable_match").map((row) => row.id), ["gq-no-match"]);
});

test("reports a passing health state only for a complete releasable suite", () => {
  const passing = createEvaluationView([cases[0]], {
    ...summary,
    passed: 1,
    total: 1,
    critical: { total: 4, passed: 4, failed: 0, release_blocking: false },
    results: [summary.results[0]]
  });
  assert.equal(passing.health.kind, "passed");
});
