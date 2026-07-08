import assert from "node:assert/strict";
import test from "node:test";
import { createArtifactRepositoryFromText } from "../src/api/artifact-repository.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";

test("creates API repository from generated artifact text", () => {
  const cards = [reviewedToolCardFixtures[0]];
  const ratings = rateAllToolCards(cards);
  const index = buildSearchIndex(cards, ratings);
  const repository = createArtifactRepositoryFromText({
    toolCardsJsonl: `${cards.map((card) => JSON.stringify(card)).join("\n")}\n`,
    ratingsJsonl: `${ratings.map((rating) => JSON.stringify(rating)).join("\n")}\n`,
    searchIndexJson: JSON.stringify(index)
  });

  assert.equal(repository.listToolCards().length, 1);
  assert.equal(repository.getToolCard(cards[0].id)?.id, cards[0].id);
  assert.equal(repository.getRating(cards[0].id)?.tool_id, cards[0].id);
  assert.equal(repository.getSearchIndex().documents[0]?.tool_id, cards[0].id);
});
