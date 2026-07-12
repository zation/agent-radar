import { createHash } from "node:crypto";
import {
  FEEDBACK_RULES_VERSION,
  type FeedbackClassification,
  type ParsedFeedbackIssue,
} from "./contracts.js";
import { dedupeAcceptedIssues } from "./dedupe.js";

export interface FeedbackVoteRow {
  tool_id: string;
  up_count: number;
  down_count: number;
  row_count: number;
}

export interface FeedbackProcessingAction {
  issue_number: number;
  expected_updated_at: string;
  expected_processing_labels: string[];
  comment_body: string;
  labels_to_add: string[];
  labels_to_remove: string[];
  final_state: "open" | "closed";
  replacement_issue_number?: number;
}

export interface FeedbackProcessingPlan {
  schema_version: "feedback_processing_plan.v1";
  generated_at: string;
  release_tag: string;
  actions: FeedbackProcessingAction[];
}

export interface FeedbackToolSummary {
  tool_id: string;
  up_count: number;
  down_count: number;
  d1_adjustment: number;
  issue_adjustment: number;
  raw_adjustment: number;
  applied_adjustment: number;
  accepted_issue_ids: number[];
}

export interface FeedbackArtifacts {
  voteSnapshot: {
    schema_version: "feedback_vote_snapshot.v1";
    generated_at: string;
    total_row_count: number;
    tools: FeedbackVoteRow[];
    checksum: `sha256:${string}`;
  };
  classification: {
    schema_version: "feedback_classification.v1";
    generated_at: string;
    classifications: FeedbackClassification[];
  };
  processingPlan: FeedbackProcessingPlan;
  summary: {
    schema_version: "feedback_summary.v1";
    generated_at: string;
    rules_version: typeof FEEDBACK_RULES_VERSION;
    vote_snapshot_checksum: `sha256:${string}`;
    tools: FeedbackToolSummary[];
  };
}

interface BuildFeedbackArtifactsInput {
  voteRows: FeedbackVoteRow[];
  historicalAccepted: ParsedFeedbackIssue[];
  newIssues: ParsedFeedbackIssue[];
  classifications: FeedbackClassification[];
  generatedAt: string;
  releaseTag: string;
}

export function buildFeedbackArtifacts(input: BuildFeedbackArtifactsInput): FeedbackArtifacts {
  const voteRows = [...input.voteRows].sort((left, right) => left.tool_id.localeCompare(right.tool_id));
  const votePayload = {
    schema_version: "feedback_vote_snapshot.v1" as const,
    generated_at: input.generatedAt,
    total_row_count: voteRows.reduce((sum, row) => sum + row.row_count, 0),
    tools: voteRows,
  };
  const voteSnapshot = { ...votePayload, checksum: canonicalChecksum(votePayload) };
  const classifications = [...input.classifications].sort((left, right) => left.issue_number - right.issue_number);
  const parsedByNumber = new Map(input.newIssues.map((issue) => [issue.issue_number, issue]));
  const newlyAccepted = classifications
    .filter(({ decision }) => decision === "accepted")
    .map(({ issue_number }) => requireIssue(parsedByNumber, issue_number));
  const dedupe = dedupeAcceptedIssues([...input.historicalAccepted, ...newlyAccepted]);
  const actions = [
    ...classifications.map((classification) => classificationAction(classification, requireIssue(parsedByNumber, classification.issue_number), input.releaseTag)),
    ...dedupe.deprecated.map(({ issue, replacement_issue_number }) => deprecatedAction(issue, replacement_issue_number, input.releaseTag)),
  ].sort((left, right) => left.issue_number - right.issue_number);

  const toolIds = new Set([...voteRows.map(({ tool_id }) => tool_id), ...dedupe.accepted.map(({ tool_id }) => tool_id)]);
  const tools = [...toolIds].sort().map((toolId) => {
    const votes = voteRows.find(({ tool_id }) => tool_id === toolId) ?? { up_count: 0, down_count: 0 };
    const accepted = dedupe.accepted.filter(({ tool_id }) => tool_id === toolId);
    const d1Tenths = (votes.up_count - votes.down_count) * 2;
    const issueTenths = accepted.reduce((sum, issue) => sum + (issue.vote === "up" ? 10 : -10), 0);
    const rawTenths = d1Tenths + issueTenths;
    return {
      tool_id: toolId,
      up_count: votes.up_count,
      down_count: votes.down_count,
      d1_adjustment: d1Tenths / 10,
      issue_adjustment: issueTenths / 10,
      raw_adjustment: rawTenths / 10,
      applied_adjustment: Math.max(-30, Math.min(30, rawTenths)) / 10,
      accepted_issue_ids: accepted.map(({ issue_number }) => issue_number).sort((a, b) => a - b),
    };
  });

  return {
    voteSnapshot,
    classification: { schema_version: "feedback_classification.v1", generated_at: input.generatedAt, classifications },
    processingPlan: { schema_version: "feedback_processing_plan.v1", generated_at: input.generatedAt, release_tag: input.releaseTag, actions },
    summary: {
      schema_version: "feedback_summary.v1",
      generated_at: input.generatedAt,
      rules_version: FEEDBACK_RULES_VERSION,
      vote_snapshot_checksum: voteSnapshot.checksum,
      tools,
    },
  };
}

export function canonicalChecksum(value: unknown): `sha256:${string}` {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function classificationAction(classification: FeedbackClassification, issue: ParsedFeedbackIssue, releaseTag: string): FeedbackProcessingAction {
  const label = classification.decision === "accepted" ? "feedback-accepted"
    : classification.decision === "rejected" ? "feedback-rejected" : "feedback-needs-human-review";
  const finalState = classification.decision === "needs-human-review" ? "open" : "closed";
  const message = `${classification.summary}\n\nReason code: \`${classification.reason_code}\`\nRelease: \`${releaseTag}\`\nClassifier: \`${classification.classifier_version}\``;
  return actionWithMarker({
    issue_number: issue.issue_number,
    expected_updated_at: issue.updated_at,
    expected_processing_labels: issue.processing_labels,
    comment_body: message,
    labels_to_add: [label],
    labels_to_remove: [],
    final_state: finalState,
  });
}

function deprecatedAction(issue: ParsedFeedbackIssue, replacementIssueNumber: number, releaseTag: string): FeedbackProcessingAction {
  return actionWithMarker({
    issue_number: issue.issue_number,
    expected_updated_at: issue.updated_at,
    expected_processing_labels: issue.processing_labels,
    comment_body: `This accepted feedback is superseded by #${replacementIssueNumber}.\n\nRelease: \`${releaseTag}\`\nRules: \`${FEEDBACK_RULES_VERSION}\``,
    labels_to_add: ["feedback-deprecated"],
    labels_to_remove: [],
    final_state: "closed",
    replacement_issue_number: replacementIssueNumber,
  });
}

function actionWithMarker(action: FeedbackProcessingAction): FeedbackProcessingAction {
  const hash = canonicalChecksum(action);
  return { ...action, comment_body: `${action.comment_body}\n\n<!-- agent-radar-feedback:v0.1:issue-${action.issue_number}:${hash} -->` };
}

function requireIssue(map: Map<number, ParsedFeedbackIssue>, issueNumber: number): ParsedFeedbackIssue {
  const issue = map.get(issueNumber);
  if (!issue) throw new Error(`feedback_issue_missing: ${issueNumber}`);
  return issue;
}
