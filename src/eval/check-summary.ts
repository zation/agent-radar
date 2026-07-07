import type { EvalSummary } from "./runner.js";

export function validateEvalSummaryForRelease(summary: EvalSummary): void {
  if (summary.passed === summary.total && summary.results.every((result) => result.passed)) return;

  const failedCases = summary.results
    .filter((result) => !result.passed)
    .map((result) => `${result.case_id}: ${result.failures.join("; ") || "failed"}`)
    .join(" | ");
  throw new Error(`release eval failed: ${summary.passed}/${summary.total} passed${failedCases ? ` (${failedCases})` : ""}`);
}
