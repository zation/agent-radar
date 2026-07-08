import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_RECOMMENDATION_MODEL, buildProviderRegistryArtifact, listRecommendationProviderModels, resolveRecommendationProviderModel } from "../src/recommendation/provider-registry.js";

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

test("overrides provider endpoint with a shared LLM base URL", () => {
  assert.deepEqual(resolveRecommendationProviderModel("MiniMax M3", { baseUrl: "https://api.minimaxi.com" }), {
    apiModel: "MiniMax-M3",
    endpoint: "https://api.minimaxi.com/v1/chat/completions",
    instructionRole: "system",
    label: "MiniMax M3",
    provider: "minimax"
  });
  assert.deepEqual(resolveRecommendationProviderModel("DeepSeek V4 Flash", { baseUrl: "https://proxy.example/llm/" }), {
    apiModel: "deepseek-v4-flash",
    endpoint: "https://proxy.example/llm/chat/completions",
    instructionRole: "system",
    label: "DeepSeek V4 Flash",
    provider: "deepseek"
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

test("exports a versioned provider registry artifact for runtime configuration", () => {
  const artifact = buildProviderRegistryArtifact();

  assert.equal(artifact.schema_version, "provider_registry.v1");
  assert.equal(artifact.registry_version, "provider_registry.v0.2");
  assert.equal(artifact.default_model, DEFAULT_RECOMMENDATION_MODEL);
  assert.equal(artifact.key_handling, "byok_request_only");
  assert.equal(artifact.models.length, 5);
  assert.deepEqual(
    artifact.models.map((model) => ({ label: model.label, api_model: model.api_model, provider: model.provider })),
    [
      { label: "OpenAI GPT-4.1", api_model: "gpt-4.1", provider: "openai" },
      { label: "OpenAI GPT-4.1 mini", api_model: "gpt-4.1-mini", provider: "openai" },
      { label: "MiniMax M3", api_model: "MiniMax-M3", provider: "minimax" },
      { label: "DeepSeek V4 Pro", api_model: "deepseek-v4-pro", provider: "deepseek" },
      { label: "DeepSeek V4 Flash", api_model: "deepseek-v4-flash", provider: "deepseek" }
    ]
  );
  assert.equal(artifact.models.every((model) => model.runtime_selectable), true);
  assert.equal(artifact.models.every((model) => model.endpoint.startsWith("https://")), true);
});
