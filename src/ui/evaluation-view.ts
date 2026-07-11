import type { EvalSummary } from "../eval/runner.js";
import type { EvalCase, RiskLevel } from "../schema.js";

export type EvaluationFilter = "all" | "critical" | "ask_human" | "no_reliable_match";

export interface EvaluationRow {
  id: string;
  task: string;
  why: string;
  severity: EvalCase["severity"];
  expectedAction?: string;
  observedAction: string;
  passed: boolean;
  failureCategory: string;
  failures: string[];
  topToolIds: string[];
  riskLevel: RiskLevel | "blocked" | "unknown";
  requiresHumanApproval: boolean | null;
  updatedAt: string;
}

export interface EvaluationView {
  rows: EvaluationRow[];
  health: { kind: "passed" | "failed"; failed: number };
  passed: number;
  total: number;
  critical: EvalSummary["critical"];
  releaseLabel: string;
  commitSha: string;
}

export function createEvaluationView(cases: EvalCase[], summary: EvalSummary): EvaluationView {
  const resultById = new Map(summary.results.map((result) => [result.case_id, result]));
  const rows = cases.map((evalCase): EvaluationRow => {
    const result = resultById.get(evalCase.id);
    if (!result) {
      return {
        id: evalCase.id,
        task: evalCase.query.task,
        why: evalCase.review_notes,
        severity: evalCase.severity,
        expectedAction: evalCase.expected.recommended_action,
        observedAction: "missing",
        passed: false,
        failureCategory: "missing_result",
        failures: ["Evaluation result is missing."],
        topToolIds: [],
        riskLevel: "unknown",
        requiresHumanApproval: null,
        updatedAt: evalCase.updated_at
      };
    }
    return {
      id: evalCase.id,
      task: evalCase.query.task,
      why: evalCase.review_notes,
      severity: evalCase.severity,
      expectedAction: evalCase.expected.recommended_action,
      observedAction: result.recommended_action,
      passed: result.passed && result.failure_category === "none",
      failureCategory: result.failure_category,
      failures: result.failures,
      topToolIds: result.top_tool_ids,
      riskLevel: result.risk_level,
      requiresHumanApproval: result.requires_human_approval,
      updatedAt: evalCase.updated_at
    };
  });
  const failed = rows.filter((row) => !row.passed).length;
  const complete = summary.total > 0 && cases.length === summary.total && rows.length === summary.results.length;
  const criticalPassed = summary.critical.total === 4 && summary.critical.passed === 4 && summary.critical.failed === 0 && !summary.critical.release_blocking;
  return {
    rows,
    health: { kind: complete && failed === 0 && criticalPassed ? "passed" : "failed", failed },
    passed: summary.passed,
    total: summary.total,
    critical: summary.critical,
    releaseLabel: summary.release.release_id,
    commitSha: summary.release.commit_sha
  };
}

export function filterEvaluationRows(rows: EvaluationRow[], filter: EvaluationFilter): EvaluationRow[] {
  if (filter === "all") return rows;
  if (filter === "critical") return rows.filter((row) => row.severity === "critical");
  return rows.filter((row) => row.expectedAction === filter);
}
