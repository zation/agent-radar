import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildCompareColumns } from "../src/ui/compare-view.js";
import { createToolViewModels } from "../src/ui/data.js";

const tools = createToolViewModels(seedToolCards, rateAllToolCards(seedToolCards));

test("builds compare columns from selected tool ids without duplicates", () => {
  const columns = buildCompareColumns(tools, [
    "agent-claude-code",
    "agent-claude-code",
    "agent-cursor",
    "cli-gemini-cli",
    "agent-opencode",
    "skill-openai-docs"
  ]);

  assert.deepEqual(
    columns.map((column) => column.card.id),
    ["agent-claude-code", "agent-cursor", "cli-gemini-cli", "agent-opencode"]
  );
});

test("falls back to top rated tools when no compare ids are selected", () => {
  const columns = buildCompareColumns(tools, []);

  assert.equal(columns.length, 4);
  assert.ok(columns[0].rating.overall_score >= columns[1].rating.overall_score);
});
