import assert from "node:assert/strict";
import test from "node:test";
import { createGitHubIssueReader } from "../src/feedback-processing/github-issues.js";

function apiIssue(number: number, state: "open" | "closed", labels: string[]) {
  return {
    number,
    html_url: `https://github.com/zation/agent-radar/issues/${number}`,
    user: { id: number + 100 },
    state,
    created_at: "2026-07-12T01:00:00Z",
    updated_at: "2026-07-12T01:00:00Z",
    title: "feedback",
    body: "body",
    labels: labels.map((name) => ({ name })),
  };
}

test("reads fixed-repository Issue pages and filters pull requests and processed rows", async () => {
  const requests: Array<{ url: string; authorization: string | null }> = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = String(input);
    requests.push({ url, authorization: new Headers(init?.headers).get("authorization") });
    if (url.includes("page=2")) return Response.json([apiIssue(4, "open", ["tool-feedback"])]);
    return new Response(JSON.stringify([
      apiIssue(3, "open", ["tool-feedback", "feedback-needs-human-review"]),
      { ...apiIssue(2, "open", ["tool-feedback"]), pull_request: {} },
      apiIssue(1, "open", ["tool-feedback"]),
    ]), { headers: { "content-type": "application/json", link: '<https://api.github.com/repositories/1/issues?labels=tool-feedback&state=open&per_page=100&page=2>; rel="next"' } });
  };

  const issues = await createGitHubIssueReader({ token: "secret-token", fetcher }).listNewIssues();
  assert.deepEqual(issues.map(({ number }) => number), [1, 4]);
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ url }) => url.startsWith("https://api.github.com/repos/zation/agent-radar/issues?")));
  assert.ok(requests.every(({ url }) => url.includes("labels=tool-feedback") && url.includes("state=open") && url.includes("per_page=100")));
  assert.ok(requests.every(({ authorization }) => authorization === "Bearer secret-token"));
});

test("reads only closed historical accepted Issues and redacts response failures", async () => {
  const reader = createGitHubIssueReader({
    token: "secret-token",
    fetcher: async () => Response.json([
      apiIssue(8, "closed", ["tool-feedback", "feedback-accepted"]),
      apiIssue(7, "closed", ["tool-feedback", "feedback-accepted", "feedback-deprecated"]),
      apiIssue(6, "closed", ["tool-feedback", "feedback-rejected"]),
    ]),
  });
  assert.deepEqual((await reader.listHistoricalAcceptedIssues()).map(({ number }) => number), [8]);

  const failing = createGitHubIssueReader({ token: "secret-token", fetcher: async () => new Response("secret response body", { status: 500 }) });
  await assert.rejects(() => failing.listNewIssues(), (error: Error) => {
    assert.match(error.message, /github_read_failed: 500/);
    assert.doesNotMatch(error.message, /secret/);
    return true;
  });
});
