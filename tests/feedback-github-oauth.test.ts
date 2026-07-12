import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/require-await */
import test from "node:test";
import { buildGitHubAuthorizeUrl, buildToolReturnPath, exchangeGitHubCode, fetchGitHubIdentity } from "../src/feedback/github-oauth.js";

test("authorize URL uses GitHub without requesting scope", () => {
  const url = new URL(buildGitHubAuthorizeUrl("client", "state", "https://example.com/api/auth/github/callback"));
  assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
  assert.equal(url.searchParams.get("scope"), null);
  assert.equal(url.searchParams.get("state"), "state");
});

test("OAuth exchange and public identity use safe headers and redact failures", async () => {
  const requests: Request[] = [];
  const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init); requests.push(request);
    return request.url.includes("access_token") ? Response.json({ access_token: "token" }) : Response.json({ id: 42, login: "octocat" });
  };
  const token = await exchangeGitHubCode({ code: "code", clientId: "id", clientSecret: "secret", fetcher });
  assert.equal(token, "token");
  assert.deepEqual(await fetchGitHubIdentity(token, fetcher), { github_user_id: "42", github_login: "octocat" });
  assert.match(requests[0].headers.get("accept") ?? "", /json/);
  await assert.rejects(() => exchangeGitHubCode({ code: "secret-code", clientId: "id", clientSecret: "secret", fetcher: async () => new Response("secret-code", { status: 400 }) }), (error: Error) => !error.message.includes("secret-code"));
});

test("tool return paths remain internal", () => {
  assert.equal(buildToolReturnPath("skill-a"), "/?tool=skill-a");
  assert.equal(buildToolReturnPath("https://evil.test"), "/");
});
