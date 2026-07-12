import { PROCESSING_LABELS } from "./contracts.js";
import type { FeedbackProcessingAction, FeedbackProcessingPlan } from "./artifacts.js";

const REPOSITORY_API = "https://api.github.com/repos/zation/agent-radar";
const markerPattern = /<!-- agent-radar-feedback:v0\.1:issue-\d+:sha256:[a-f0-9]{64} -->/;

interface WritebackOptions {
  token: string;
  fetcher?: typeof fetch;
}

interface CurrentIssue {
  state: "open" | "closed";
  updated_at: string;
  labels: Array<string | { name?: string }>;
}

export async function applyFeedbackProcessingPlan(plan: FeedbackProcessingPlan, { token, fetcher = fetch }: WritebackOptions): Promise<void> {
  if (plan.schema_version !== "feedback_processing_plan.v1") throw new Error("feedback_processing_plan_invalid");
  if (!token.trim()) throw new Error("github_token_required");
  const ordered = [...plan.actions].sort((left, right) => left.issue_number - right.issue_number);
  for (const action of ordered) await applyAction(action, token, fetcher);
}

async function applyAction(action: FeedbackProcessingAction, token: string, fetcher: typeof fetch): Promise<void> {
  const issueUrl = `${REPOSITORY_API}/issues/${action.issue_number}`;
  const current = await requestJson<CurrentIssue>(issueUrl, token, fetcher);
  const comments = await requestJson<Array<{ body?: string }>>(`${issueUrl}/comments?per_page=100`, token, fetcher);
  const marker = action.comment_body.match(markerPattern)?.[0];
  if (!marker) throw new Error(`feedback_action_marker_missing: ${action.issue_number}`);
  if (comments.some(({ body }) => body?.includes(marker))) {
    if (!matchesFinalState(current, action)) throw new Error(`feedback_issue_idempotency_conflict: ${action.issue_number}`);
    return;
  }

  const currentProcessingLabels = labelNames(current.labels).filter((label) => PROCESSING_LABELS.includes(label as typeof PROCESSING_LABELS[number])).sort();
  if (current.updated_at !== action.expected_updated_at || currentProcessingLabels.join("\0") !== [...action.expected_processing_labels].sort().join("\0")) {
    throw new Error(`feedback_issue_precondition_failed: ${action.issue_number}`);
  }

  await requestJson(`${issueUrl}/comments`, token, fetcher, "POST", { body: action.comment_body });
  if (action.labels_to_add.length > 0) await requestJson(`${issueUrl}/labels`, token, fetcher, "POST", { labels: action.labels_to_add });
  for (const label of action.labels_to_remove) {
    await requestJson(`${issueUrl}/labels/${encodeURIComponent(label)}`, token, fetcher, "DELETE");
  }
  await requestJson(issueUrl, token, fetcher, "PATCH", { state: action.final_state });
}

function matchesFinalState(issue: CurrentIssue, action: FeedbackProcessingAction): boolean {
  const labels = new Set(labelNames(issue.labels));
  return issue.state === action.final_state
    && action.labels_to_add.every((label) => labels.has(label))
    && action.labels_to_remove.every((label) => !labels.has(label));
}

function labelNames(labels: CurrentIssue["labels"]): string[] {
  return labels.map((label) => typeof label === "string" ? label : label.name).filter((label): label is string => typeof label === "string");
}

async function requestJson<T = unknown>(url: string, token: string, fetcher: typeof fetch, method = "GET", body?: unknown): Promise<T> {
  const response = await fetcher(url, {
    method,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`github_write_failed: ${response.status}`);
  if (response.status === 204) return undefined as T;
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`github_write_failed: malformed_json`);
  }
}

