import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seedToolCards } from "../data/seed-tool-cards.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { runGoldenQueries } from "../eval/runner.js";
import { rateAllToolCards } from "../rating/engine.js";
import { buildSearchIndex } from "../search/index-builder.js";

export interface BuildArtifactsOptions {
  outputDir: string;
}

export interface BuildArtifactsSummary {
  toolCount: number;
  ratingCount: number;
  goldenQueriesPassed: number;
  goldenQueriesTotal: number;
}

export async function buildArtifacts(options: BuildArtifactsOptions): Promise<BuildArtifactsSummary> {
  const publicDataDir = join(options.outputDir, "data");
  const reportsDir = join(options.outputDir, "reports");
  await mkdir(publicDataDir, { recursive: true });
  await mkdir(reportsDir, { recursive: true });

  const ratings = rateAllToolCards(seedToolCards);
  const index = buildSearchIndex(seedToolCards, ratings);
  const evalSummary = runGoldenQueries(goldenQueries, seedToolCards, ratings, index);
  const dataVersion = "data-2026-07-06";

  await writeFile(join(publicDataDir, "tool_cards.jsonl"), toJsonl(seedToolCards), "utf8");
  await writeFile(join(publicDataDir, "ratings.jsonl"), toJsonl(ratings), "utf8");
  await writeFile(join(publicDataDir, "search_index.json"), JSON.stringify(index, null, 2), "utf8");
  await writeFile(join(publicDataDir, "golden_queries.json"), JSON.stringify(goldenQueries, null, 2), "utf8");
  await writeFile(join(publicDataDir, "eval_summary.json"), JSON.stringify(evalSummary, null, 2), "utf8");
  await writeFile(join(reportsDir, `eval-${dataVersion}.md`), renderEvalReport(dataVersion, evalSummary), "utf8");
  await writeFile(
    join(publicDataDir, "manifest.json"),
    JSON.stringify(
      {
        data_version: dataVersion,
        schema_versions: {
          tool_card: "tool_card.v1",
          rating_result: "rating_result.v1",
          search_index: "search_index.v1"
        },
        rules_versions: {
          rating: "rating_rules.v0.1-draft",
          recommendation: "recommendation_rules.v1"
        },
        index_version: "index-2026-07-06",
        eval_report: `reports/eval-${dataVersion}.md`,
        published_at: "2026-07-06T00:00:00Z"
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    toolCount: seedToolCards.length,
    ratingCount: ratings.length,
    goldenQueriesPassed: evalSummary.passed,
    goldenQueriesTotal: evalSummary.total
  };
}

function toJsonl(records: unknown[]): string {
  return `${records.map((record) => JSON.stringify(record)).join("\n")}\n`;
}

function renderEvalReport(dataVersion: string, summary: ReturnType<typeof runGoldenQueries>): string {
  const lines = [
    `# Eval Report ${dataVersion}`,
    "",
    "## Summary",
    `- Golden queries: ${summary.passed}/${summary.total} pass`,
    `- Safety critical failures: ${summary.results.filter((result) => !result.passed).length}`,
    "",
    "## Golden Queries",
    ...summary.results.map((result) => {
      const status = result.passed ? "pass" : "fail";
      const failures = result.failures.length > 0 ? ` (${result.failures.join("; ")})` : "";
      return `- ${result.case_id}: ${status}, action=${result.recommended_action}, top=${result.top_tool_ids.join(", ")}${failures}`;
    })
  ];
  return `${lines.join("\n")}\n`;
}
