import type { GitHubIssueSnapshot } from "./contracts.js";
import { classifyIssueState } from "./issue-state.js";

const ISSUES_URL = "https://api.github.com/repos/zation/agent-radar/issues";

interface GitHubIssueReaderOptions {
  token: string;
  fetcher?: typeof fetch;
}

interface GitHubApiIssue {
  number?: unknown;
  html_url?: unknown;
  user?: { id?: unknown } | null;
  state?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  title?: unknown;
  body?: unknown;
  labels?: Array<string | { name?: unknown }>;
  pull_request?: unknown;
}

export function createGitHubIssueReader({ token, fetcher = fetch }: GitHubIssueReaderOptions) {
  if (!token.trim()) throw new Error("github_token_required");

  const list = async (state: "open" | "closed", label: string): Promise<GitHubIssueSnapshot[]> => {
    const issues: GitHubIssueSnapshot[] = [];
    for (let page = 1; page <= 100; page += 1) {
      const query = new URLSearchParams({ labels: label, state, per_page: "100" });
      if (page > 1) query.set("page", String(page));
      const response = await fetcher(`${ISSUES_URL}?${query}`, {
        headers: {
          accept: "application/vnd.github+json",
          authorization: `Bearer ${token}`,
          "x-github-api-version": "2022-11-28",
        },
      });
      if (!response.ok) throw new Error(`github_read_failed: ${response.status}`);
      let rows: unknown;
      try {
        rows = await response.json();
      } catch {
        throw new Error("github_read_failed: malformed_json");
      }
      if (!Array.isArray(rows)) throw new Error("github_read_failed: invalid_payload");
      for (const row of rows as GitHubApiIssue[]) {
        if (row.pull_request !== undefined) continue;
        issues.push(mapIssue(row));
      }
      if (!hasNextPage(response.headers.get("link"))) break;
      if (page === 100) throw new Error("github_read_failed: pagination_limit");
    }
    return issues.sort((left, right) => left.number - right.number);
  };

  return {
    async listNewIssues(): Promise<GitHubIssueSnapshot[]> {
      return selectStates(await list("open", "tool-feedback"), "new");
    },
    async listHistoricalAcceptedIssues(): Promise<GitHubIssueSnapshot[]> {
      return selectStates(await list("closed", "feedback-accepted"), "historical-accepted");
    },
  };
}

function selectStates(issues: GitHubIssueSnapshot[], selected: "new" | "historical-accepted"): GitHubIssueSnapshot[] {
  return issues.filter((issue) => {
    const state = classifyIssueState(issue);
    if (state === "blocked") throw new Error(`feedback_issue_state_blocked: ${issue.number}`);
    return state === selected;
  });
}

function mapIssue(issue: GitHubApiIssue): GitHubIssueSnapshot {
  if (!Number.isSafeInteger(issue.number) || typeof issue.html_url !== "string" || !Number.isSafeInteger(issue.user?.id)
    || (issue.state !== "open" && issue.state !== "closed") || typeof issue.created_at !== "string"
    || typeof issue.updated_at !== "string" || typeof issue.title !== "string" || (issue.body !== null && typeof issue.body !== "string")) {
    throw new Error("github_read_failed: invalid_issue");
  }
  const labels = (issue.labels ?? []).map((label) => typeof label === "string" ? label : label.name).filter((name): name is string => typeof name === "string");
  return {
    number: issue.number as number,
    html_url: issue.html_url,
    user: { id: issue.user!.id as number },
    state: issue.state,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    title: issue.title,
    body: issue.body,
    labels,
  };
}

function hasNextPage(link: string | null): boolean {
  return link?.split(",").some((part) => /rel="next"/.test(part)) ?? false;
}
