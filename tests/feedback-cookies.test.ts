import assert from "node:assert/strict";
import test from "node:test";
import { clearSessionCookie, issueOAuthStateCookie, issueSessionCookie, readOAuthStateCookie, readSessionCookie } from "../src/feedback/cookies.js";

const secret = "0123456789abcdef0123456789abcdef";
test("signed session round trips and rejects tampering or expiry", async () => {
  const now = new Date("2026-07-12T00:00:00Z");
  const cookie = await issueSessionCookie({ github_user_id: "42", github_login: "octocat" }, secret, now);
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax; Path=\//);
  assert.equal((await readSessionCookie(cookie.split(";")[0], secret, now))?.github_login, "octocat");
  const pair = cookie.split(";")[0];
  assert.equal(await readSessionCookie(`${pair.slice(0, -1)}x`, secret, now), null);
  assert.equal(await readSessionCookie(cookie.split(";")[0], secret, new Date("2026-08-13T00:00:00Z")), null);
  assert.match(clearSessionCookie(), /Max-Age=0/);
});

test("oauth state binds nonce, return path and intended vote", async () => {
  const now = new Date("2026-07-12T00:00:00Z");
  const cookie = await issueOAuthStateCookie({ nonce: "abc", return_path: "/tools/tool-a", tool_id: "tool-a", vote: "up" }, secret, now);
  const state = await readOAuthStateCookie(cookie.split(";")[0], secret, "abc", now);
  assert.equal(state?.tool_id, "tool-a");
  assert.equal(await readOAuthStateCookie(cookie.split(";")[0], secret, "wrong", now), null);
});

test("cookie signing rejects short secrets", async () => {
  await assert.rejects(() => issueSessionCookie({ github_user_id: "1", github_login: "x" }, "short"), /32 bytes/);
});
