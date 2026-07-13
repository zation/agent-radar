import assert from "node:assert/strict";
import test from "node:test";
import { createStaticRepository } from "../src/api/repository.js";
import { createToolService, ToolServiceError } from "../src/api/tool-service.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);
const repository = createStaticRepository({
  cards: reviewedToolCardFixtures,
  ratings,
  index: buildSearchIndex(reviewedToolCardFixtures, ratings)
});

function successfulRecommendationClient(calls: Array<{ apiKey: string; model: string }>) {
  return {
    recommend(input: { apiKey: string; model: string }) {
      calls.push({ apiKey: input.apiKey, model: input.model });
      return Promise.resolve({
        recommended_action: "compare" as const,
        candidates: [{ tool_id: "skill-openai-docs", fit_score: 91, why: ["Official docs."], risks: [], next_steps: [] }],
        rejected_candidates: []
      });
    }
  };
}

test("tool service executes search, lookup, and rating explanation", async () => {
  const service = createToolService(repository);

  const search = await service.execute("search_tools", { query: "browser screenshot", top_k: 2 });
  const lookup = await service.execute("get_tool_card", { tool_id: "skill-openai-docs" });
  const explanation = await service.execute("explain_rating", { tool_id: "skill-openai-docs" });

  assert.equal(search.schema_version, "search_tools_result.v1");
  assert.equal((lookup.tool_card as { id: string }).id, "skill-openai-docs");
  assert.equal(explanation.schema_version, "rating_explanation_result.v1");
});

test("request credential overrides the configured fallback without leaking", async () => {
  const calls: Array<{ apiKey: string; model: string }> = [];
  const service = createToolService(repository, {
    recommendationClient: successfulRecommendationClient(calls),
    fallbackLlmApiKey: "fallback-key",
    fallbackModel: "deepseek-v4-flash",
    versionInfo: { release_id: "all-v0.6.3", commit_sha: "abc123" }
  });

  const result = await service.execute(
    "recommend_tools",
    { task: "choose official documentation", model: "openai/gpt-5-mini" },
    { llmApiKey: "request-key" }
  );

  assert.deepEqual(calls, [{ apiKey: "request-key", model: "openai/gpt-5-mini" }]);
  assert.equal(JSON.stringify(result).includes("request-key"), false);
  assert.equal(JSON.stringify(result).includes("fallback-key"), false);
  assert.deepEqual(result.release, { release_id: "all-v0.6.3", commit_sha: "abc123" });
});

test("configured credential is used only when the request has none", async () => {
  const calls: Array<{ apiKey: string; model: string }> = [];
  const service = createToolService(repository, {
    recommendationClient: successfulRecommendationClient(calls),
    fallbackLlmApiKey: "fallback-key",
    fallbackModel: "deepseek-v4-flash"
  });

  await service.execute("recommend_tools", { task: "choose" });

  assert.deepEqual(calls, [{ apiKey: "fallback-key", model: "deepseek-v4-flash" }]);
});

test("configured base URL is passed only to the provider client", async () => {
  const calls: Array<{ apiKey: string; model: string; baseUrl?: string }> = [];
  const service = createToolService(repository, {
    recommendationClient: {
      recommend(input) {
        calls.push({ apiKey: input.apiKey, model: input.model, baseUrl: input.baseUrl });
        return Promise.resolve({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] });
      }
    },
    fallbackLlmApiKey: "fallback-key",
    fallbackModel: "MiniMax-M3",
    fallbackBaseUrl: "https://api.minimaxi.com"
  });

  await service.execute("recommend_tools", { task: "choose" });

  assert.deepEqual(calls, [{ apiKey: "fallback-key", model: "MiniMax-M3", baseUrl: "https://api.minimaxi.com" }]);
});

test("missing recommendation credential returns a stable safe error", async () => {
  const service = createToolService(repository);

  await assert.rejects(
    service.execute("recommend_tools", { task: "choose" }),
    (error: unknown) => {
      assert.ok(error instanceof ToolServiceError);
      assert.equal(error.httpStatus, 400);
      assert.deepEqual(error.body, {
        code: "missing_provider_key",
        message: "recommend_tools requires an LLM provider API key.",
        recovery: "Send the key in the X-Agent-Radar-LLM-API-Key request header."
      });
      return true;
    }
  );
});

test("missing tool and rating use stable service errors", async () => {
  const service = createToolService(repository);

  await assert.rejects(service.execute("get_tool_card", { tool_id: "missing" }), (error: unknown) => {
    assert.ok(error instanceof ToolServiceError);
    assert.equal(error.body.code, "tool_not_found");
    assert.equal(error.httpStatus, 404);
    return true;
  });
  await assert.rejects(service.execute("explain_rating", { tool_id: "missing" }), (error: unknown) => {
    assert.ok(error instanceof ToolServiceError);
    assert.equal(error.body.code, "rating_not_found");
    assert.equal(error.httpStatus, 404);
    return true;
  });
});
