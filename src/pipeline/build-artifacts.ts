import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { seedToolCards } from "../data/seed-tool-cards.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries, type EvalSummary } from "../eval/runner.js";
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
  const apiKey = process.env.AGENT_RADAR_LLM_API_KEY ?? "";
  const model = process.env.AGENT_RADAR_LLM_MODEL ?? "gpt-4.1";
  const evalSummary = apiKey
    ? await runGoldenQueries(goldenQueries, seedToolCards, ratings, { apiKey, model })
    : createBlockedEvalSummary(goldenQueries, "AGENT_RADAR_LLM_API_KEY is required for LLM-backed recommendation eval.");
  const dataVersion = "data-2026-07-06";

  await writeFile(join(publicDataDir, "tool_cards.jsonl"), toJsonl(seedToolCards), "utf8");
  await writeFile(join(publicDataDir, "ratings.jsonl"), toJsonl(ratings), "utf8");
  await writeFile(join(publicDataDir, "search_index.json"), JSON.stringify(index, null, 2), "utf8");
  await writeFile(join(publicDataDir, "d1_seed.sql"), renderD1SeedSql(seedToolCards, ratings, index.documents), "utf8");
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
        d1_seed: "data/d1_seed.sql",
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

function renderEvalReport(dataVersion: string, summary: EvalSummary): string {
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

function renderD1SeedSql(
  cards: typeof seedToolCards,
  ratings: ReturnType<typeof rateAllToolCards>,
  documents: ReturnType<typeof buildSearchIndex>["documents"]
): string {
  const statements = [
    "BEGIN TRANSACTION;",
    "DELETE FROM search_documents;",
    "DELETE FROM ratings;",
    "DELETE FROM tool_cards;",
    ...cards.map((card) =>
      `INSERT INTO tool_cards (id, type, name, summary, tags_json, risk_level, confidence, last_checked_at, document_json) VALUES (${[
        sqlString(card.id),
        sqlString(card.type),
        sqlString(card.name),
        sqlString(card.summary),
        sqlString(JSON.stringify(card.tags)),
        sqlString(card.security.risk_level),
        sqlString(card.confidence),
        sqlString(card.last_checked_at),
        sqlString(JSON.stringify(card))
      ].join(", ")});`
    ),
    ...ratings.map((rating) =>
      `INSERT INTO ratings (tool_id, overall_score, recommendation_level, risk_level, evidence_quality, document_json) VALUES (${[
        sqlString(rating.tool_id),
        rating.overall_score,
        sqlString(rating.recommendation_level),
        sqlString(rating.risk_level),
        sqlString(rating.evidence_quality),
        sqlString(JSON.stringify(rating))
      ].join(", ")});`
    ),
    ...documents.map((document) =>
      `INSERT INTO search_documents (tool_id, type, tags_json, risk_level, confidence, rating_overall, search_text) VALUES (${[
        sqlString(document.tool_id),
        sqlString(document.type),
        sqlString(JSON.stringify(document.tags)),
        sqlString(document.risk_level),
        sqlString(document.confidence),
        document.rating_overall,
        sqlString(document.text)
      ].join(", ")});`
    ),
    "COMMIT;"
  ];
  return `${statements.join("\n")}\n`;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}
