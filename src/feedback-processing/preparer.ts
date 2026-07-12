import type { ToolCard } from "../schema.js";
import { buildFeedbackArtifacts, type FeedbackArtifacts, type FeedbackVoteRow } from "./artifacts.js";
import type { FeedbackClassification, FeedbackClassifierInput, GitHubIssueSnapshot } from "./contracts.js";
import { parseFeedbackIssue } from "./issue-parser.js";
import { classifyIssueState } from "./issue-state.js";

export interface FeedbackBuildInput {
  schema_version: "feedback_build_input.v1";
  generated_at: string;
  release_tag: string;
  artifacts: FeedbackArtifacts;
}

interface PrepareFeedbackBuildInputOptions {
  voteRows: FeedbackVoteRow[];
  cards: ToolCard[];
  newIssues: GitHubIssueSnapshot[];
  historicalIssues: GitHubIssueSnapshot[];
  classify: (inputs: FeedbackClassifierInput[]) => Promise<FeedbackClassification[]>;
  generatedAt: string;
  releaseTag: string;
}

export async function prepareFeedbackBuildInput(options: PrepareFeedbackBuildInputOptions): Promise<FeedbackBuildInput> {
  const knownToolIds = new Set(options.cards.map(({ id }) => id));
  for (const row of options.voteRows) if (!knownToolIds.has(row.tool_id)) throw new Error(`d1_snapshot_unknown_tool: ${row.tool_id}`);
  for (const issue of options.newIssues) if (classifyIssueState(issue) !== "new") throw new Error(`feedback_new_issue_invalid_state: ${issue.number}`);
  for (const issue of options.historicalIssues) if (classifyIssueState(issue) !== "historical-accepted") throw new Error(`feedback_historical_issue_invalid_state: ${issue.number}`);

  const parsedNew = options.newIssues.map((issue) => parseFeedbackIssue(issue, knownToolIds));
  const parsedHistorical = options.historicalIssues.map((issue) => parseFeedbackIssue(issue, knownToolIds));
  const cardById = new Map(options.cards.map((card) => [card.id, card]));
  const classifierInputs = parsedNew.map((issue) => {
    const card = cardById.get(issue.tool_id)!;
    return {
      issue,
      tool: {
        id: card.id,
        name: card.name,
        risk_level: card.security.risk_level,
        usage_boundaries: [...(card.ai_decision_notes?.when_to_avoid ?? card.not_for)],
      },
    };
  });
  const classifications = await options.classify(classifierInputs);
  if (classifications.length !== parsedNew.length) throw new Error("feedback_classification_count_mismatch");

  return {
    schema_version: "feedback_build_input.v1",
    generated_at: options.generatedAt,
    release_tag: options.releaseTag,
    artifacts: buildFeedbackArtifacts({
      voteRows: options.voteRows,
      historicalAccepted: parsedHistorical,
      newIssues: parsedNew,
      classifications,
      generatedAt: options.generatedAt,
      releaseTag: options.releaseTag,
    }),
  };
}

