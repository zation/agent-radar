import assert from "node:assert/strict";
import test from "node:test";
import worker from "../src/worker.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";
import type { RatingResult, ToolCard } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

interface WorkerAssetsBinding {
  fetch(request: Request): Promise<Response>;
}

test("Worker serves API from same static assets deployment", async () => {
  const assets = createAssetsBinding(reviewedToolCardFixtures);
  const response = await worker.fetch(
    new Request("https://agent-radar.test/api/get_tool_card?tool_id=skill-openai-docs"),
    { ASSETS: assets }
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as { tool_card?: { id?: string }; rating?: { tool_id?: string } };
  assert.equal(body.tool_card?.id, "skill-openai-docs");
  assert.equal(body.rating?.tool_id, "skill-openai-docs");
});

test("Worker version endpoint reports release and data versions", async () => {
  const assets = createAssetsBinding(reviewedToolCardFixtures);
  const response = await worker.fetch(new Request("https://agent-radar.test/api/version"), {
    ASSETS: assets,
    AGENT_RADAR_RELEASE_ID: "all-v0.2.1",
    AGENT_RADAR_API_VERSION: "api-v0.2.1",
    AGENT_RADAR_WEB_VERSION: "web-v0.2.1"
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    release_id: string;
    data_version: string;
    api_version: string;
    web_version: string;
  };
  assert.equal(body.release_id, "all-v0.2.1");
  assert.equal(body.data_version, "data-test");
  assert.equal(body.api_version, "api-v0.2.1");
  assert.equal(body.web_version, "web-v0.2.1");
});

test("Worker delegates non-API requests to static assets", async () => {
  const assets = createAssetsBinding(reviewedToolCardFixtures);
  const response = await worker.fetch(new Request("https://agent-radar.test/"), { ASSETS: assets });

  assert.equal(response.status, 200);
  assert.equal(await response.text(), "<!doctype html><title>Agent Radar</title>");
});

function createAssetsBinding(cards: ToolCard[]): WorkerAssetsBinding {
  const ratings = rateAllToolCards(cards);
  const index = buildSearchIndex(cards, ratings);
  const files = new Map<string, string>([
    ["/", "<!doctype html><title>Agent Radar</title>"],
    ["/index.html", "<!doctype html><title>Agent Radar</title>"],
    ["/data/manifest.json", JSON.stringify({ data_version: "data-test" })],
    ["/data/tool_cards.jsonl", toJsonl(cards)],
    ["/data/ratings.jsonl", toJsonl(ratings)],
    ["/data/search_index.json", JSON.stringify(index)]
  ]);

  return {
    fetch(request: Request) {
      const path = new URL(request.url).pathname;
      const body = files.get(path);
      if (body === undefined) return Promise.resolve(new Response("Not found", { status: 404 }));
      return Promise.resolve(new Response(body, { headers: { "content-type": contentTypeFor(path) } }));
    }
  };
}

function toJsonl(records: Array<ToolCard | RatingResult>): string {
  return records.map((record) => JSON.stringify(record)).join("\n");
}

function contentTypeFor(path: string): string {
  if (path.endsWith(".json") || path.endsWith(".jsonl")) return "application/json; charset=utf-8";
  return "text/html; charset=utf-8";
}
