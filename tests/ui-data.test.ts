import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { createToolViewModels, parseJsonl } from "../src/ui/data.js";

test("parses JSONL records for browser-loaded artifacts", () => {
  const jsonl = `${JSON.stringify({ id: "a" })}\n${JSON.stringify({ id: "b" })}\n`;

  assert.deepEqual(parseJsonl<{ id: string }>(jsonl), [{ id: "a" }, { id: "b" }]);
});

test("creates tool view models with ratings and default sort", () => {
  const viewModels = createToolViewModels(seedToolCards, rateAllToolCards(seedToolCards));

  assert.equal(viewModels[0].rating.overall_score >= viewModels.at(-1)!.rating.overall_score, true);
  assert.ok(viewModels.every((model) => model.card.id === model.rating.tool_id));
});
