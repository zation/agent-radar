import { createApiHandler } from "./api/handler.js";
import { createStaticRepository } from "./api/repository.js";
import { seedToolCards } from "./data/seed-tool-cards.js";
import { rateAllToolCards } from "./rating/engine.js";
import { buildSearchIndex } from "./search/index-builder.js";

const ratings = rateAllToolCards(seedToolCards);
const repository = createStaticRepository({
  cards: seedToolCards,
  ratings,
  index: buildSearchIndex(seedToolCards, ratings)
});
const handleRequest = createApiHandler(repository);

export default {
  fetch(request: Request): Promise<Response> {
    return handleRequest(request);
  }
};
