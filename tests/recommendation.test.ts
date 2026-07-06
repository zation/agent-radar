import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { buildSearchIndex } from "../src/search/index-builder.js";
import { recommendTools } from "../src/recommendation/engine.js";
import { rateAllToolCards } from "../src/rating/engine.js";

const ratings = rateAllToolCards(seedToolCards);
const index = buildSearchIndex(seedToolCards, ratings);

test("recommends a testing-capable candidate for Python coverage work", () => {
  const result = recommendTools(
    {
      task: "为一个 Python 项目增加测试覆盖率",
      language_or_stack: ["python"],
      environment: ["local_dev"],
      risk_tolerance: "medium",
      preferred_tool_types: ["skill", "cli", "agent"],
      top_k: 3
    },
    seedToolCards,
    ratings,
    index
  );

  assert.notEqual(result.recommended_action, "no_reliable_match");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("testing")));
  assert.ok(result.candidates.some((candidate) => candidate.risks.some((risk) => risk.includes("filesystem"))));
});

test("requires human approval for Gmail summary workflows", () => {
  const result = recommendTools(
    {
      task: "在 Codex 中读取 Gmail 并总结待办",
      existing_tools: ["codex"],
      allowed_permissions: ["email_read"],
      risk_tolerance: "low",
      top_k: 3
    },
    seedToolCards,
    ratings,
    index
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("communication")));
  assert.ok(result.candidates[0].risks.some((risk) => risk.includes("email")));
});

test("returns official payment guidance with human approval for Stripe Checkout integration", () => {
  const result = recommendTools(
    {
      task: "给 Next.js 应用接入 Stripe Checkout",
      language_or_stack: ["typescript", "next.js"],
      environment: ["web_app"],
      risk_tolerance: "medium",
      top_k: 3
    },
    seedToolCards,
    ratings,
    index
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("payment")));
  assert.ok(result.candidates[0].risks.some((risk) => risk.includes("secrets")));
});

test("returns no reliable match for low-tolerance payment and production database actions", () => {
  const result = recommendTools(
    {
      task: "自动处理线上支付退款并读取生产数据库",
      risk_tolerance: "low",
      top_k: 5
    },
    seedToolCards,
    ratings,
    index
  );

  assert.equal(result.recommended_action, "no_reliable_match");
  assert.match(result.no_match_reason ?? "", /risk/i);
  assert.ok(result.rejected_candidates.length > 0);
});
