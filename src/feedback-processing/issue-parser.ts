import { PROCESSING_LABELS, type GitHubIssueSnapshot, type ParsedFeedbackIssue } from "./contracts.js";

const REQUIRED_FIELDS = ["Tool ID", "Vote", "Release", "Data version", "Tool URL", "What should we know?"] as const;

export function parseFeedbackIssue(issue: GitHubIssueSnapshot, knownToolIds: ReadonlySet<string>): ParsedFeedbackIssue {
  if (!Number.isSafeInteger(issue.user?.id) || (issue.user?.id ?? 0) <= 0) {
    throw new Error("missing_github_user_id");
  }

  const fields = parseFields(issue.body ?? "");
  const toolId = fields.get("Tool ID")!;
  const vote = fields.get("Vote")!;
  if (!knownToolIds.has(toolId)) throw new Error(`unknown_tool: ${toolId}`);
  if (vote !== "up" && vote !== "down") throw new Error(`invalid_vote: ${vote}`);

  return {
    issue_number: issue.number,
    issue_url: issue.html_url,
    github_user_id: issue.user!.id,
    tool_id: toolId,
    vote,
    reason: fields.get("What should we know?")!,
    created_at: issue.created_at,
    updated_at: issue.updated_at,
    processing_labels: issue.labels.filter((label) => PROCESSING_LABELS.includes(label as typeof PROCESSING_LABELS[number])).sort(),
  };
}

function parseFields(body: string): Map<string, string> {
  const fields = new Map<string, string>();
  const headingPattern = /^### ([^\r\n]+)\r?\n+([\s\S]*?)(?=\r?\n### |$)/gm;
  for (const match of body.matchAll(headingPattern)) {
    const heading = match[1].trim();
    if (!REQUIRED_FIELDS.includes(heading as typeof REQUIRED_FIELDS[number])) continue;
    if (fields.has(heading)) throw new Error(`duplicate_field: ${heading}`);
    const value = match[2].trim();
    if (!value || value === "_No response_") throw new Error(`missing_field: ${heading}`);
    fields.set(heading, value);
  }
  for (const heading of REQUIRED_FIELDS) {
    if (!fields.has(heading)) throw new Error(`missing_field: ${heading}`);
  }
  return fields;
}

