import assert from "node:assert/strict";
import test from "node:test";
import type { RecommendationResult } from "../src/schema.js";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { createToolViewModels } from "../src/ui/data.js";
import { createRecommendationItems, formatRecommendationApiError } from "../src/ui/recommendation-view.js";

test("creates selectable recommendation items with tool details", () => {
  const tools = createToolViewModels(seedToolCards, rateAllToolCards(seedToolCards));
  const result: RecommendationResult = {
    id: "rec-test",
    schema_version: "recommendation_result.v1",
    query: { task: "browser screenshot" },
    query_understanding: {
      intent: "browser_automation",
      task_domains: ["browser_automation"],
      required_capabilities: ["browser_screenshot"],
      likely_permissions: ["browser", "network"],
      tool_type_hints: ["mcp"],
      risk_flags: [],
      confidence: "medium"
    },
    recommended_action: "use",
    candidates: [
      {
        tool_id: "mcp-browser-automation",
        name: "Browser Automation MCP",
        rank: 1,
        recommendation_level: "recommended",
        fit_score: 65,
        risk_level: "medium",
        tags: ["browser_automation"],
        why: ["Matches browser screenshot validation."],
        risks: ["browser:read_write"],
        not_for: [],
        next_steps: [],
        evidence_refs: []
      }
    ],
    rejected_candidates: []
  };

  const items = createRecommendationItems(result, tools);

  assert.equal(items.length, 1);
  assert.equal(items[0].candidate.tool_id, "mcp-browser-automation");
  assert.equal(items[0].tool.card.name, "Browser Automation MCP");
});

test("formats provider API errors with actionable context", () => {
  assert.equal(
    formatRecommendationApiError({
      error: "provider_rate_limited",
      message: "Provider rate limit was reached.",
      provider: "deepseek",
      provider_status: 429
    }),
    "Provider rate limit was reached. [provider_rate_limited · deepseek · HTTP 429]"
  );
});
