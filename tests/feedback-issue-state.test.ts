import assert from "node:assert/strict";
import test from "node:test";
import { classifyIssueState } from "../src/feedback-processing/issue-state.js";
import type { GitHubIssueSnapshot } from "../src/feedback-processing/contracts.js";

function issue(state: "open" | "closed", labels: string[], body = ""): GitHubIssueSnapshot {
  return {
    number: 9,
    html_url: "https://github.com/zation/agent-radar/issues/9",
    user: { id: 1 },
    state,
    created_at: "2026-07-12T01:00:00.000Z",
    updated_at: "2026-07-12T01:00:00.000Z",
    title: "feedback",
    body,
    labels,
  };
}

test("selects new, historical accepted, and processed feedback states", () => {
  assert.equal(classifyIssueState(issue("open", ["tool-feedback"])), "new");
  assert.equal(classifyIssueState(issue("closed", ["tool-feedback", "feedback-accepted"])), "historical-accepted");
  assert.equal(classifyIssueState(issue("closed", ["tool-feedback", "feedback-rejected"])), "processed");
  assert.equal(classifyIssueState(issue("open", ["tool-feedback", "feedback-needs-human-review"])), "processed");
});

test("blocks conflicting processing labels and invalid deprecated tombstones", () => {
  assert.equal(classifyIssueState(issue("closed", ["tool-feedback", "feedback-accepted", "feedback-rejected"])), "blocked");
  assert.equal(classifyIssueState(issue("open", ["tool-feedback", "feedback-accepted", "feedback-needs-human-review"])), "blocked");
  assert.equal(classifyIssueState(issue("closed", ["tool-feedback", "feedback-accepted", "feedback-deprecated"])), "blocked");
  assert.equal(classifyIssueState(issue("closed", ["tool-feedback", "feedback-accepted", "feedback-deprecated"], "Replaced by #12")), "processed");
});

test("requires the permanent tool-feedback source label", () => {
  assert.equal(classifyIssueState(issue("open", [])), "blocked");
});
