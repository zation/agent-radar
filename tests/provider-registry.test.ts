import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RECOMMENDATION_MODEL, listRecommendationProviderModels, resolveRecommendationProviderModel } from "../src/recommendation/provider-registry.js";

test("lists supported recommendation provider models for BYOK configuration", () => {
  const labels = listRecommendationProviderModels().map((model) => model.label);

  assert.deepEqual(labels, [
    "OpenAI GPT-4.1",
    "OpenAI GPT-4.1 mini",
    "MiniMax M3",
    "DeepSeek V4 Pro",
    "DeepSeek V4 Flash"
  ]);
});

test("resolves provider labels to request configuration", () => {
  assert.deepEqual(resolveRecommendationProviderModel("MiniMax M3"), {
    apiModel: "MiniMax-M3",
    endpoint: "https://api.minimax.io/v1/chat/completions",
    instructionRole: "system",
    label: "MiniMax M3",
    provider: "minimax"
  });
  assert.deepEqual(resolveRecommendationProviderModel("OpenAI GPT-4.1 mini"), {
    apiModel: "gpt-4.1-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    instructionRole: "developer",
    label: "OpenAI GPT-4.1 mini",
    provider: "openai"
  });
});

test("keeps raw model ids compatible with provider prefixes", () => {
  assert.equal(resolveRecommendationProviderModel("deepseek-v4-flash").provider, "deepseek");
  assert.equal(resolveRecommendationProviderModel("MiniMax-M3").provider, "minimax");
  assert.equal(resolveRecommendationProviderModel("gpt-4.1").provider, "openai");
});

test("uses DeepSeek flash as the CLI default recommendation model", () => {
  assert.equal(DEFAULT_RECOMMENDATION_MODEL, "deepseek-v4-flash");
  assert.equal(resolveRecommendationProviderModel(DEFAULT_RECOMMENDATION_MODEL).provider, "deepseek");
});
