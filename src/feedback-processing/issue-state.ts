import { PROCESSING_LABELS, type GitHubIssueSnapshot } from "./contracts.js";

export type FeedbackIssueState = "new" | "historical-accepted" | "processed" | "blocked";

export function classifyIssueState(issue: GitHubIssueSnapshot): FeedbackIssueState {
  const labels = new Set(issue.labels);
  if (!labels.has("tool-feedback")) return "blocked";

  const active = PROCESSING_LABELS.filter((label) => labels.has(label));
  const accepted = labels.has("feedback-accepted");
  const rejected = labels.has("feedback-rejected");
  const human = labels.has("feedback-needs-human-review");
  const deprecated = labels.has("feedback-deprecated");

  if ((accepted && rejected) || (accepted && human) || (rejected && human) || (deprecated && (rejected || human))) return "blocked";
  if (accepted && deprecated) return /(?:Replaced by|replacement(?: issue)?[: ]+)\s*#\d+/i.test(issue.body ?? "") ? "processed" : "blocked";
  if (issue.state === "open" && active.length === 0) return "new";
  if (issue.state === "closed" && accepted) return "historical-accepted";
  if (active.length > 0) return "processed";
  return "blocked";
}
