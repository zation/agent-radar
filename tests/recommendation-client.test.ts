import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationRequest } from "../src/ui/recommendation-client.js";

test("recommendation request puts the provider key only in the secret header", async () => {
  const request = buildRecommendationRequest(
    "/api/recommend_tools",
    { task: "choose", risk_tolerance: "low", top_k: 4, model: "openai/gpt-5-mini" },
    "  browser-secret  "
  );

  assert.equal(request.method, "POST");
  assert.equal(request.headers.get("content-type"), "application/json");
  assert.equal(request.headers.get("X-Agent-Radar-LLM-API-Key"), "browser-secret");
  const body = await request.text();
  assert.equal(body.includes("browser-secret"), false);
  assert.deepEqual(JSON.parse(body), {
    task: "choose",
    risk_tolerance: "low",
    top_k: 4,
    model: "openai/gpt-5-mini"
  });
});

test("recommendation request omits the optional secret header for an empty key", () => {
  const request = buildRecommendationRequest("/api/recommend_tools", { task: "choose" }, "  ");
  assert.equal(request.headers.has("X-Agent-Radar-LLM-API-Key"), false);
});
