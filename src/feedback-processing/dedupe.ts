import type { ParsedFeedbackIssue } from "./contracts.js";

export interface DeprecatedAcceptedIssue {
  issue: ParsedFeedbackIssue;
  replacement_issue_number: number;
}

export function dedupeAcceptedIssues(issues: ParsedFeedbackIssue[]): { accepted: ParsedFeedbackIssue[]; deprecated: DeprecatedAcceptedIssue[] } {
  const grouped = new Map<string, ParsedFeedbackIssue[]>();
  for (const issue of issues) {
    const key = `${issue.github_user_id}:${issue.tool_id}`;
    grouped.set(key, [...(grouped.get(key) ?? []), issue]);
  }
  const accepted: ParsedFeedbackIssue[] = [];
  const deprecated: DeprecatedAcceptedIssue[] = [];
  for (const group of grouped.values()) {
    const ordered = [...group].sort(compareNewestFirst);
    const winner = ordered[0];
    accepted.push(winner);
    for (const issue of ordered.slice(1)) deprecated.push({ issue, replacement_issue_number: winner.issue_number });
  }
  accepted.sort((left, right) => left.issue_number - right.issue_number);
  deprecated.sort((left, right) => left.issue.issue_number - right.issue.issue_number);
  return { accepted, deprecated };
}

function compareNewestFirst(left: ParsedFeedbackIssue, right: ParsedFeedbackIssue): number {
  const dateOrder = right.created_at.localeCompare(left.created_at);
  return dateOrder || right.issue_number - left.issue_number;
}

