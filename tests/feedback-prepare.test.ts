import assert from "node:assert/strict";
import test from "node:test";
import { parseD1AggregateSnapshot } from "../src/feedback-processing/d1-snapshot.js";
import { prepareFeedbackBuildInput } from "../src/feedback-processing/preparer.js";
import type { GitHubIssueSnapshot } from "../src/feedback-processing/contracts.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

test("parses aggregate Wrangler output and rejects identity or per-user fields", () => {
  assert.deepEqual(parseD1AggregateSnapshot([{ results: [{ tool_id: "openai-docs-skill", up_count: 2, down_count: 1, row_count: 3 }] }]), [
    { tool_id: "openai-docs-skill", up_count: 2, down_count: 1, row_count: 3 },
  ]);
  assert.deepEqual(parseD1AggregateSnapshot([{ results: [] }]), []);
  assert.throws(() => parseD1AggregateSnapshot([{ results: [{ tool_id: "x", up_count: 1, down_count: 0, row_count: 1, github_user_id: 7 }] }]), /d1_snapshot_privacy_violation/);
  assert.throws(() => parseD1AggregateSnapshot([{ results: [{ tool_id: "x", up_count: -1, down_count: 0, row_count: 0 }] }]), /d1_snapshot_invalid_count/);
});

function issue(number: number, state: "open" | "closed", labels: string[]): GitHubIssueSnapshot {
  return {
    number,
    html_url: `https://github.com/zation/agent-radar/issues/${number}`,
    user: { id: number },
    state,
    created_at: "2026-07-12T01:00:00Z",
    updated_at: "2026-07-12T01:00:00Z",
    title: "feedback",
    body: `### Tool ID\n\n${reviewedToolCardFixtures[0].id}\n\n### Vote\n\nup\n\n### Release\n\nall-v0.4.1\n\n### Data version\n\nv1\n\n### Tool URL\n\nhttps://example.test\n\n### What should we know?\n\nUseful experience`,
    labels,
  };
}

test("prepares zero and classified feedback inputs without reclassifying history", async () => {
  const empty = await prepareFeedbackBuildInput({
    voteRows: [], cards: reviewedToolCardFixtures, newIssues: [], historicalIssues: [], classify: async () => [],
    generatedAt: "2026-07-12T02:00:00Z", releaseTag: "all-v0.4.2",
  });
  assert.deepEqual(empty.artifacts.summary.tools, []);

  let classifiedCount = 0;
  const prepared = await prepareFeedbackBuildInput({
    voteRows: [{ tool_id: reviewedToolCardFixtures[0].id, up_count: 1, down_count: 0, row_count: 1 }],
    cards: reviewedToolCardFixtures,
    newIssues: [issue(2, "open", ["tool-feedback"])],
    historicalIssues: [issue(1, "closed", ["tool-feedback", "feedback-accepted"])],
    classify: async (inputs) => {
      classifiedCount = inputs.length;
      return inputs.map(({ issue: parsed }) => ({
        issue_number: parsed.issue_number, issue_url: parsed.issue_url, sanitized_input_checksum: `sha256:${"b".repeat(64)}`,
        classifier_version: "feedback_classifier.v0.1", model_identifier: "fixture", decision: "accepted" as const,
        reason_code: "valid_experience" as const, summary: "Valid.", classified_at: "2026-07-12T02:00:00Z",
      }));
    },
    generatedAt: "2026-07-12T02:00:00Z", releaseTag: "all-v0.4.2",
  });
  assert.equal(classifiedCount, 1);
  assert.equal(prepared.schema_version, "feedback_build_input.v1");
  assert.equal(prepared.artifacts.classification.classifications.length, 1);
});
