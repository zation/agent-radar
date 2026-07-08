import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../src/api/handler.js";
import { createStaticRepository } from "../src/api/repository.js";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";

const ratings = rateAllToolCards(seedToolCards);
const repository = createStaticRepository({
  cards: seedToolCards,
  ratings,
  index: buildSearchIndex(seedToolCards, ratings)
});
const handler = createApiHandler(repository, {
  recommendationClient: {
    recommend() {
      return Promise.resolve({
        recommended_action: "ask_human",
        query_understanding: {
          intent: "gmail_summary",
          task_domains: ["communication"],
          required_capabilities: ["email_summary"],
          likely_permissions: ["email"],
          tool_type_hints: ["skill"],
          risk_flags: ["email"],
          confidence: "medium"
        },
        candidates: [{ tool_id: "skill-gmail-triage", fit_score: 88, why: ["Reads Gmail."], risks: ["email:read - personal data."], next_steps: [] }],
        rejected_candidates: []
      });
    }
  }
});

interface McpManifestResponse {
  schema_version: string;
  tools: Array<{ name: string; read_only: boolean }>;
}

test("search_tools returns summaries with match reasons", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/search_tools", {
      method: "POST",
      body: JSON.stringify({ query: "browser screenshot", top_k: 2 })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schema_version, "search_tools_result.v1");
  assert.equal(body.results[0].tool_id, "mcp-browser-automation");
  assert.ok(body.results[0].matched_fields.length > 0);
});

test("get_tool_card returns card and rating", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/get_tool_card?tool_id=skill-openai-docs"));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tool_card.id, "skill-openai-docs");
  assert.equal(body.rating.tool_id, "skill-openai-docs");
});

test("recommend_tools returns recommendation result", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/recommend_tools", {
      method: "POST",
      body: JSON.stringify({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low", api_key: "sk-test-secret", model: "gpt-4.1" })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schema_version, "recommendation_result.v1");
  assert.equal(body.recommended_action, "ask_human");
});

test("recommend_tools requires BYOK credentials", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/recommend_tools", {
      method: "POST",
      body: JSON.stringify({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" })
    })
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: string; message: string };
  assert.equal(body.error, "bad_request");
  assert.match(body.message, /api_key/);
});

test("explain_rating returns dimension explanations", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/explain_rating?tool_id=skill-test-driven-development"));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tool_id, "skill-test-driven-development");
  assert.ok(body.explanations.length > 0);
});

test("mcp_manifest exposes read-only tool definitions", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/mcp_manifest"));

  assert.equal(response.status, 200);
  const body = (await response.json()) as McpManifestResponse;
  assert.equal(body.schema_version, "mcp_tool_manifest.v1");
  assert.deepEqual(
    body.tools.map((tool: { name: string }) => tool.name),
    ["search_tools", "get_tool_card", "recommend_tools", "explain_rating"]
  );
  assert.equal(body.tools.every((tool: { read_only: boolean }) => tool.read_only), true);
});

test("rejects unsupported writes and unknown routes", async () => {
  const writeResponse = await handler(new Request("https://agent-radar.test/api/get_tool_card", { method: "DELETE" }));
  const unknownResponse = await handler(new Request("https://agent-radar.test/api/unknown"));

  assert.equal(writeResponse.status, 405);
  assert.equal(unknownResponse.status, 404);
});
