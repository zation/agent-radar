import { seedToolCards } from "../data/seed-tool-cards.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { runGoldenQueries } from "../eval/runner.js";
import { rateAllToolCards } from "../rating/engine.js";
import { buildSearchIndex } from "../search/index-builder.js";

const ratings = rateAllToolCards(seedToolCards);
const index = buildSearchIndex(seedToolCards, ratings);
const summary = runGoldenQueries(goldenQueries, seedToolCards, ratings, index);
console.log(JSON.stringify(summary, null, 2));
if (summary.passed !== summary.total) {
  process.exitCode = 1;
}
