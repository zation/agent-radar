import assert from "node:assert/strict";
import test from "node:test";
import { rateToolCard } from "../src/rating/engine.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import type { ToolCard } from "../src/schema.js";

test("rates official low-risk skills as recommendable with explanations", () => {
  const card = reviewedToolCardFixtures.find((tool) => tool.id === "skill-openai-docs")!;
  const rating = rateToolCard(card);

  assert.equal(rating.rules_version, "rating_rules.v0.1-draft");
  assert.equal(rating.schema_version, "rating_result.v2");
  assert.equal(rating.base_score, rating.overall_score);
  assert.equal(rating.recommendation_level, "recommended");
  assert.equal(rating.risk_level, "low");
  assert.ok(rating.overall_score >= 75);
  assert.ok(rating.explanations.some((explanation) => explanation.dimension === "task_fit"));
});

test("downgrades unknown code execution tools to avoid", () => {
  const unsafeCard: ToolCard = {
    ...reviewedToolCardFixtures[0],
    id: "unknown-code-execution-tool",
    name: "Unknown Code Execution Tool",
    type: "agent",
    confidence: "low",
    permissions: [{ scope: "code_execution", access: "execute", required: true, notes: "Runs generated code." }],
    security: {
      risk_level: "unknown",
      trust_level: "unknown",
      known_risks: ["unknown_code_execution"],
      requires_human_approval: true,
      security_notes: "Source and execution boundary are unknown."
    },
    maintenance: { ...reviewedToolCardFixtures[0].maintenance, status: "unknown", maintainer_type: "unknown" }
  };

  const rating = rateToolCard(unsafeCard);

  assert.equal(rating.risk_level, "high");
  assert.equal(rating.recommendation_level, "avoid");
  assert.ok(rating.penalties.includes("unknown_trust_with_execution"));
});
