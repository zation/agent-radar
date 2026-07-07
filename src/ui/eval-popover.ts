export interface EvalPopoverSummary {
  total: number;
  passed: number;
  results: Array<{
    case_id: string;
    passed: boolean;
    recommended_action: string;
  }>;
}

export interface EvalPopoverRow {
  id: string;
  label: string;
  status: "passed" | "failed";
  action: string;
}

export function createEvalPopoverRows(summary: EvalPopoverSummary): EvalPopoverRow[] {
  return summary.results.map((result) => ({
    id: result.case_id,
    label: result.case_id.replace(/^gq-/, ""),
    status: result.passed ? "passed" : "failed",
    action: result.recommended_action
  }));
}
