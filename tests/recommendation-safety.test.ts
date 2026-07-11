import assert from "node:assert/strict";
import test from "node:test";
import { assessRecommendationSafety } from "../src/recommendation/safety.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import type { Permission, RecommendationCandidate, RecommendationQuery, ToolCard } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

function assess(permission: Permission, query: RecommendationQuery = { task: "Evaluate a tool" }, trust: ToolCard["security"]["trust_level"] = "official") {
  const card: ToolCard = {
    ...reviewedToolCardFixtures[0],
    id: `test-${permission.scope}-${permission.access}`,
    permissions: [permission],
    security: {
      ...reviewedToolCardFixtures[0].security,
      trust_level: trust,
      risk_level: "low",
      requires_human_approval: false
    }
  };
  const candidate: RecommendationCandidate = {
    tool_id: card.id,
    name: card.name,
    rank: 1,
    recommendation_level: "recommended",
    fit_score: 90,
    risk_level: "low",
    tags: card.tags,
    why: ["test"],
    risks: [],
    not_for: [],
    next_steps: [],
    evidence_refs: []
  };
  return assessRecommendationSafety({ query, candidates: [candidate], cards: [card], ratings: rateAllToolCards([card]) });
}

const permissionCases = [
  ["browser", "execute", "medium", "use", "browser_control"],
  ["filesystem", "write", "high", "ask_human", "filesystem_write"],
  ["email", "read", "high", "ask_human", "email_access"],
  ["database", "write", "critical", "ask_human", "database_write"],
  ["payment", "write", "critical", "ask_human", "payment_access"],
  ["unknown", "unknown", "unknown", "ask_human", "permission_unknown"]
] as const;

for (const [scope, access, expectedRisk, expectedAction, reason] of permissionCases) {
  test(`recommendation safety enforces ${scope}:${access}`, () => {
    const result = assess({ scope, access, required: true, notes: "test permission" });
    assert.equal(result.risk_level, expectedRisk);
    assert.equal(result.maximum_allowed_action, expectedAction);
    assert.ok(result.reason_codes.includes(reason));
  });
}

test("recommendation safety avoids unknown trust code execution", () => {
  const result = assess({ scope: "code_execution", access: "execute", required: true, notes: "runs code" }, { task: "Run generated code" }, "unknown");
  assert.equal(result.maximum_allowed_action, "avoid");
  assert.ok(result.reason_codes.includes("unknown_trust_code_execution"));
});

test("recommendation safety requires approval for permissions outside the allowlist", () => {
  const result = assess(
    { scope: "network", access: "read", required: true, notes: "calls an API" },
    { task: "Call an API", allowed_permissions: ["filesystem"], risk_tolerance: "low" }
  );
  assert.equal(result.requires_human_approval, true);
  assert.ok(result.reason_codes.includes("permission_not_allowed"));
});
