import assert from "node:assert/strict";
import test from "node:test";
import { applyFeedbackProcessingPlan } from "../src/feedback-processing/github-writeback.js";
import type { FeedbackProcessingAction } from "../src/feedback-processing/artifacts.js";

const marker = `<!-- agent-radar-feedback:v0.1:issue-5:sha256:${"a".repeat(64)} -->`;

function action(overrides: Partial<FeedbackProcessingAction> = {}): FeedbackProcessingAction {
  return {
    issue_number: 5,
    expected_updated_at: "2026-07-12T01:00:00Z",
    expected_processing_labels: [],
    comment_body: `Accepted.\n\n${marker}`,
    labels_to_add: ["feedback-accepted"],
    labels_to_remove: [],
    final_state: "closed",
    ...overrides,
  };
}

test("checks preconditions then comments, labels, and closes only the fixed repository Issue", async () => {
  const requests: Array<{ url: string; method: string; body: string }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    requests.push({ url, method, body: String(init?.body ?? "") });
    if (method === "GET" && url.endsWith("/issues/5")) return Response.json({ number: 5, state: "open", updated_at: "2026-07-12T01:00:00Z", labels: [{ name: "tool-feedback" }] });
    if (method === "GET" && url.endsWith("/issues/5/comments?per_page=100")) return Response.json([]);
    return Response.json({}, { status: 200 });
  };
  await applyFeedbackProcessingPlan({ schema_version: "feedback_processing_plan.v1", generated_at: "2026-07-12T02:00:00Z", release_tag: "all-v0.4.2", actions: [action()] }, { token: "token", fetcher });
  assert.ok(requests.every(({ url }) => url.startsWith("https://api.github.com/repos/zation/agent-radar/")));
  assert.deepEqual(requests.map(({ method }) => method), ["GET", "GET", "POST", "POST", "PATCH"]);
  assert.match(requests[2].body, /agent-radar-feedback/);
  assert.doesNotMatch(requests.map(({ url }) => url).join(" "), /issues$/);
  assert.ok(requests.every(({ body }) => !body.includes('"body":"changed issue body"')));
});

test("blocks changed Issues and treats an already-applied matching marker as idempotent", async () => {
  let writes = 0;
  await assert.rejects(() => applyFeedbackProcessingPlan({
    schema_version: "feedback_processing_plan.v1", generated_at: "2026-07-12T02:00:00Z", release_tag: "tag", actions: [action()],
  }, {
    token: "token",
    fetcher: async (input, init) => {
      if ((init?.method ?? "GET") !== "GET") writes += 1;
      if (String(input).endsWith("/issues/5")) return Response.json({ state: "open", updated_at: "changed", labels: [{ name: "tool-feedback" }] });
      return Response.json([]);
    },
  }), /feedback_issue_precondition_failed: 5/);
  assert.equal(writes, 0);

  await assert.doesNotReject(() => applyFeedbackProcessingPlan({
    schema_version: "feedback_processing_plan.v1", generated_at: "2026-07-12T02:00:00Z", release_tag: "tag", actions: [action()],
  }, {
    token: "token",
    fetcher: async (input, init) => {
      if ((init?.method ?? "GET") !== "GET") writes += 1;
      if (String(input).endsWith("/issues/5")) return Response.json({ state: "closed", updated_at: "later", labels: [{ name: "tool-feedback" }, { name: "feedback-accepted" }] });
      return Response.json([{ body: marker }]);
    },
  }));
  assert.equal(writes, 0);
});

test("stops the plan on the first write failure", async () => {
  let issueSixRead = false;
  await assert.rejects(() => applyFeedbackProcessingPlan({
    schema_version: "feedback_processing_plan.v1", generated_at: "2026-07-12T02:00:00Z", release_tag: "tag",
    actions: [action(), action({ issue_number: 6, comment_body: action().comment_body.replace("issue-5", "issue-6") })],
  }, {
    token: "token",
    fetcher: async (input, init) => {
      const url = String(input);
      if (url.includes("/issues/6")) issueSixRead = true;
      if ((init?.method ?? "GET") === "POST" && url.endsWith("/comments")) return new Response("secret failure", { status: 500 });
      if (url.endsWith("/comments?per_page=100")) return Response.json([]);
      return Response.json({ state: "open", updated_at: "2026-07-12T01:00:00Z", labels: [{ name: "tool-feedback" }] });
    },
  }), /github_write_failed: 500/);
  assert.equal(issueSixRead, false);
});
