import assert from "node:assert/strict";
import test from "node:test";
import { goldenQueries } from "../src/eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries } from "../src/eval/runner.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { RecommendationProviderError } from "../src/recommendation/engine.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);

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
