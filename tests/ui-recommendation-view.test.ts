import assert from "node:assert/strict";
import test from "node:test";
import type { RecommendationResult } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { createToolViewModels } from "../src/ui/data.js";
import { createRecommendationItems, createRecommendationSafetyView, formatRecommendationApiError, parseRecommendationApiResponse } from "../src/ui/recommendation-view.js";

test("creates selectable recommendation items with tool details", () => {
  const tools = createToolViewModels(reviewedToolCardFixtures, rateAllToolCards(reviewedToolCardFixtures));
  const result: RecommendationResult = {
    id: "rec-test",
    schema_version: "recommendation_result.v2",
    release: { release_id: "dev", commit_sha: "dev" },
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
    safety_assessment: {
      risk_level: "medium",
      reason_codes: ["browser_control"],
      requires_human_approval: false,
      confirmation_questions: [],
      safe_defaults: ["仅授予完成本次任务所需的最小权限"],
      maximum_allowed_action: "use"
    },
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

test("creates a read-only recommendation safety view", () => {
  const result: RecommendationResult = {
    id: "rec-safety", schema_version: "recommendation_result.v2",
    release: { release_id: "all-v0.3.2-test", commit_sha: "0123456789abcdef" },
    query: { task: "read Gmail" }, query_understanding: { intent: "email", task_domains: [], required_capabilities: [], likely_permissions: ["email"], tool_type_hints: [], risk_flags: [], confidence: "medium" },
    recommended_action: "ask_human", candidates: [], rejected_candidates: [],
    safety_assessment: { risk_level: "high", reason_codes: ["email_access"], requires_human_approval: true, approval_reason: "需要读取邮件。", confirmation_questions: ["是否只读取指定标签？"], safe_defaults: ["只读权限"], maximum_allowed_action: "ask_human" }
  };
  assert.deepEqual(createRecommendationSafetyView(result), {
    releaseLabel: "all-v0.3.2-test · 0123456", riskLevel: "high", requiresHumanApproval: true,
    approvalReason: "需要读取邮件。", confirmationItems: ["是否只读取指定标签？"], safeDefaults: ["只读权限"]
  });
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

test("formats empty API responses instead of leaking Response.json parse errors", async () => {
  await assert.rejects(
    parseRecommendationApiResponse(new Response("", { status: 502, statusText: "Bad Gateway" })),
    /Recommendation API returned an empty response\. \[HTTP 502\]/
  );
});
