import assert from "node:assert/strict";
/* eslint-disable @typescript-eslint/require-await, @typescript-eslint/no-base-to-string, @typescript-eslint/no-unnecessary-type-assertion */
import test from "node:test";
import { createStaticRepository } from "../src/api/repository.js";
import { createFeedbackHttpHandler } from "../src/feedback/http.js";
import type { FeedbackStore } from "../src/feedback/contracts.js";
import { buildSearchIndex } from "../src/search/index-builder.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const secret = "0123456789abcdef0123456789abcdef";
function setup() {
  const ratings = rateAllToolCards(reviewedToolCardFixtures);
  const repository = createStaticRepository({ cards: reviewedToolCardFixtures, ratings, index: buildSearchIndex(reviewedToolCardFixtures, ratings) });
  let vote: "up" | "down" | null = null;
  const store: FeedbackStore = { async getSummary(toolId) { return { tool_id: toolId, up: vote === "up" ? 1 : 0, down: vote === "down" ? 1 : 0, viewer_vote: vote }; }, async mutateVote(input) { vote = input.vote; return this.getSummary(input.toolId, input.user.github_user_id); } };
  return createFeedbackHttpHandler({ repository, store, clientId: "client", clientSecret: "secret", sessionSecret: secret, fetcher: async (input) => String(input).includes("access_token") ? Response.json({ access_token: "token" }) : Response.json({ id: 42, login: "octocat" }) });
}

test("auth start has no scope and callback establishes a session and applies vote", async () => {
  const handle = setup();
  const start = await handle(new Request("https://radar.test/api/auth/github?tool_id=skill-openai-docs&vote=up"));
  assert.equal(start?.status, 302); assert.equal(new URL(start!.headers.get("location")!).searchParams.has("scope"), false);
  const state = new URL(start!.headers.get("location")!).searchParams.get("state");
  const callback = await handle(new Request(`https://radar.test/api/auth/github/callback?code=x&state=${state}`, { headers: { cookie: start!.headers.get("set-cookie")! } }));
  assert.equal(callback?.status, 302); assert.match(callback!.headers.get("set-cookie") ?? "", /agent_radar_session/);
  const session = await handle(new Request("https://radar.test/api/auth/session", { headers: { cookie: callback!.headers.get("set-cookie")! } }));
  assert.equal((await session!.json() as { authenticated: boolean }).authenticated, true);
});

test("feedback is anonymous-readable and authenticated same-origin writable", async () => {
  const handle = setup();
  assert.equal((await (await handle(new Request("https://radar.test/api/tools/skill-openai-docs/feedback")))!.json() as { up: number }).up, 0);
  const start = await handle(new Request("https://radar.test/api/auth/github"));
  const state = new URL(start!.headers.get("location")!).searchParams.get("state");
  const callback = await handle(new Request(`https://radar.test/api/auth/github/callback?code=x&state=${state}`, { headers: { cookie: start!.headers.get("set-cookie")! } }));
  const cookie = callback!.headers.get("set-cookie")!;
  const denied = await handle(new Request("https://radar.test/api/tools/skill-openai-docs/feedback", { method: "PUT", headers: { cookie, origin: "https://evil.test", "content-type": "application/json" }, body: '{"vote":"up"}' }));
  assert.equal(denied?.status, 403);
  const updated = await handle(new Request("https://radar.test/api/tools/skill-openai-docs/feedback", { method: "PUT", headers: { cookie, origin: "https://radar.test", "content-type": "application/json" }, body: '{"vote":"up"}' }));
  assert.equal((await updated!.json() as { up: number }).up, 1);
});
