import assert from "node:assert/strict";
import test from "node:test";
import { buildFeedbackArtifacts, canonicalChecksum } from "../src/feedback-processing/artifacts.js";
import { dedupeAcceptedIssues } from "../src/feedback-processing/dedupe.js";
import type { FeedbackClassification, ParsedFeedbackIssue } from "../src/feedback-processing/contracts.js";

function parsed(issue: number, createdAt: string, vote: "up" | "down" = "up"): ParsedFeedbackIssue {
  return {
    issue_number: issue,
    issue_url: `https://github.com/zation/agent-radar/issues/${issue}`,
    github_user_id: 7,
    tool_id: "openai-docs-skill",
    vote,
    reason: `private reason ${issue}`,
    created_at: createdAt,
    updated_at: createdAt,
    processing_labels: issue === 1 ? ["feedback-accepted"] : [],
  };
}

function classification(issue: number, decision: "accepted" | "rejected" | "needs-human-review" = "accepted"): FeedbackClassification {
  return {
    issue_number: issue,
    issue_url: `https://github.com/zation/agent-radar/issues/${issue}`,
    sanitized_input_checksum: `sha256:${"a".repeat(64)}`,
    classifier_version: "feedback_classifier.v0.1",
    model_identifier: "gpt-4.1-mini",
    decision,
    reason_code: decision === "accepted" ? "valid_experience" : "insufficient_information",
    summary: "Public-safe summary.",
    classified_at: "2026-07-12T02:00:00.000Z",
  };
}

test("keeps the newest accepted Issue per numeric user and Tool and deprecates losers", () => {
  const result = dedupeAcceptedIssues([
    parsed(3, "2026-07-12T01:00:00.000Z"),
    parsed(1, "2026-07-11T01:00:00.000Z"),
    parsed(2, "2026-07-12T01:00:00.000Z"),
  ]);
  assert.deepEqual(result.accepted.map(({ issue_number }) => issue_number), [3]);
  assert.deepEqual(result.deprecated.map(({ issue, replacement_issue_number }) => [issue.issue_number, replacement_issue_number]), [[1, 3], [2, 3]]);
});

test("builds canonical privacy-safe artifacts and deterministic processing markers", () => {
  const first = buildFeedbackArtifacts({
    voteRows: [{ tool_id: "openai-docs-skill", up_count: 3, down_count: 1, row_count: 4 }],
    historicalAccepted: [parsed(1, "2026-07-11T01:00:00.000Z")],
    newIssues: [parsed(3, "2026-07-12T01:00:00.000Z"), parsed(4, "2026-07-12T03:00:00.000Z", "down")],
    classifications: [classification(4, "needs-human-review"), classification(3)],
    generatedAt: "2026-07-12T04:00:00.000Z",
    releaseTag: "all-v0.4.2",
  });
  const reordered = buildFeedbackArtifacts({
    voteRows: [{ tool_id: "openai-docs-skill", up_count: 3, down_count: 1, row_count: 4 }],
    historicalAccepted: [parsed(1, "2026-07-11T01:00:00.000Z")],
    newIssues: [parsed(4, "2026-07-12T03:00:00.000Z", "down"), parsed(3, "2026-07-12T01:00:00.000Z")],
    classifications: [classification(3), classification(4, "needs-human-review")],
    generatedAt: "2026-07-12T04:00:00.000Z",
    releaseTag: "all-v0.4.2",
  });

  assert.equal(canonicalChecksum(first), canonicalChecksum(reordered));
  assert.equal(first.voteSnapshot.total_row_count, 4);
  assert.doesNotMatch(JSON.stringify(first.voteSnapshot), /github_user|login|private reason/);
  assert.doesNotMatch(JSON.stringify(first.classification), /private reason/);
  assert.deepEqual(first.summary.tools[0].accepted_issue_ids, [3]);
  assert.equal(first.summary.tools[0].d1_adjustment, 0.4);
  assert.equal(first.summary.tools[0].issue_adjustment, 1);
  assert.ok(first.processingPlan.actions.every(({ comment_body }) => /<!-- agent-radar-feedback:v0\.1:issue-\d+:sha256:[a-f0-9]{64} -->/.test(comment_body)));
  const deprecated = first.processingPlan.actions.find(({ issue_number }) => issue_number === 1)!;
  assert.deepEqual(deprecated.labels_to_add, ["feedback-deprecated"]);
  assert.equal(deprecated.replacement_issue_number, 3);
  assert.equal(deprecated.final_state, "closed");
});
