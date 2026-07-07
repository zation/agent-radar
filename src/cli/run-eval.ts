import { seedToolCards } from "../data/seed-tool-cards.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries } from "../eval/runner.js";
import { rateAllToolCards } from "../rating/engine.js";

const ratings = rateAllToolCards(seedToolCards);
const apiKey = process.env.AGENT_RADAR_LLM_API_KEY ?? "";
const model = process.env.AGENT_RADAR_LLM_MODEL ?? "gpt-4.1";
const summary = apiKey
  ? await runGoldenQueries(goldenQueries, seedToolCards, ratings, { apiKey, model })
  : createBlockedEvalSummary(goldenQueries, "AGENT_RADAR_LLM_API_KEY is required for LLM-backed recommendation eval.");
console.log(JSON.stringify(summary, null, 2));
if (summary.passed !== summary.total) {
  process.exitCode = 1;
}
