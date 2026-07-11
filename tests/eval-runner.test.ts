import assert from "node:assert/strict";
import test from "node:test";
import { goldenQueries } from "../src/eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries } from "../src/eval/runner.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { RecommendationProviderError } from "../src/recommendation/engine.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);

test("golden query suite contains 24 unique cases and four critical safety gates", () => {
  assert.equal(goldenQueries.length, 24);
  assert.equal(new Set(goldenQueries.map((item) => item.id)).size, 24);
  assert.equal(goldenQueries.filter((item) => item.severity === "critical").length, 4);
});

test("blocked eval summary records blocked_no_key category", () => {
  const summary = createBlockedEvalSummary(goldenQueries.slice(0, 1), "AGENT_RADAR_LLM_API_KEY is required.");

  assert.equal(summary.results[0]?.failure_category, "blocked_no_key");
  assert.equal(summary.results[0]?.recommended_action, "blocked");
});

test("golden query mismatches are marked as quality failures", async () => {
  const summary = await runGoldenQueries(goldenQueries.slice(0, 1), reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client: {
      recommend() {
        return Promise.resolve({
          recommended_action: "use",
          query_understanding: {
            intent: "bad_match",
            task_domains: [],
            required_capabilities: [],
            likely_permissions: [],
            tool_type_hints: ["skill"],
            risk_flags: [],
            confidence: "medium"
          },
          candidates: [
            {
              tool_id: "skill-openai-docs",
              fit_score: 80,
              why: ["Looks useful."],
              risks: [],
              next_steps: []
            }
          ],
          rejected_candidates: []
        });
      }
    }
  });

  assert.equal(summary.results[0]?.passed, false);
  assert.equal(summary.results[0]?.failure_category, "quality_failure");
});

test("provider errors are captured as provider_error eval results", async () => {
  const summary = await runGoldenQueries(goldenQueries.slice(0, 1), reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client: {
      recommend() {
        throw new RecommendationProviderError({
          code: "provider_rate_limited",
          message: "Provider rate limit was reached.",
          provider: "openai",
          status: 429
        });
      }
    }
  });

  assert.equal(summary.results[0]?.passed, false);
  assert.equal(summary.results[0]?.failure_category, "provider_error");
  assert.match(summary.results[0]?.failures[0] ?? "", /provider_rate_limited/);
});

test("unexpected recommendation parse errors are captured as schema_error eval results", async () => {
  const summary = await runGoldenQueries(goldenQueries.slice(0, 1), reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client: {
      recommend() {
        throw new Error("provider_schema_error: invalid JSON");
      }
    }
  });

  assert.equal(summary.results[0]?.passed, false);
  assert.equal(summary.results[0]?.failure_category, "schema_error");
});

test("eval retries one transient provider schema error", async () => {
  let attempts = 0;
  const evalCase = goldenQueries.find((item) => item.id === "gq-unknown-permission-evidence");
  assert.ok(evalCase);
  const summary = await runGoldenQueries([evalCase], reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret", model: "gpt-4.1",
    client: { recommend() { attempts += 1; if (attempts === 1) throw new Error("provider_schema_error: invalid JSON"); return Promise.resolve({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] }); } }
  });
  assert.equal(attempts, 2);
  assert.equal(summary.passed, 1);
});

test("eval accepts an action more conservative than ask_human", async () => {
  const evalCase = {
    ...goldenQueries[0],
    id: "gq-conservative-action",
    query: { task: "操作生产数据库", risk_tolerance: "low" as const },
    expected: { recommended_action: "ask_human" as const }
  };
  const summary = await runGoldenQueries([evalCase], [], [], {
    apiKey: "sk-test-secret", model: "gpt-4.1",
    client: { recommend() { return Promise.resolve({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] }); } }
  });
  assert.equal(summary.results[0]?.recommended_action, "no_reliable_match");
  assert.equal(summary.passed, 1);
});
