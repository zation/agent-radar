import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createArtifactRepositoryFromText } from "../api/artifact-repository.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries } from "../eval/runner.js";
import { DEFAULT_RECOMMENDATION_MODEL } from "../recommendation/provider-registry.js";
import { config } from "dotenv";

config({ override: false, quiet: true });

const repository = await createRepositoryFromGeneratedArtifacts();
const apiKey = process.env.AGENT_RADAR_LLM_API_KEY ?? "";
const model = process.env.AGENT_RADAR_LLM_MODEL ?? DEFAULT_RECOMMENDATION_MODEL;
const summary = apiKey
  ? await runGoldenQueries(goldenQueries, repository.listToolCards(), repository.listRatings(), { apiKey, model })
  : createBlockedEvalSummary(goldenQueries, "AGENT_RADAR_LLM_API_KEY is required for LLM-backed recommendation eval.");
console.log(JSON.stringify(summary, null, 2));
if (summary.passed !== summary.total) {
  process.exitCode = 1;
}

async function createRepositoryFromGeneratedArtifacts() {
  try {
    const [toolCardsJsonl, ratingsJsonl, searchIndexJson] = await Promise.all([
      readFile(join("public", "data", "tool_cards.jsonl"), "utf8"),
      readFile(join("public", "data", "ratings.jsonl"), "utf8"),
      readFile(join("public", "data", "search_index.json"), "utf8")
    ]);
    return createArtifactRepositoryFromText({ toolCardsJsonl, ratingsJsonl, searchIndexJson });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Generated artifacts are required before eval. Run npm run pipeline first. Cause: ${message}`);
  }
}
