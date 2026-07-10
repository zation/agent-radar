import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildMcpExamplesArtifact } from "../api/mcp-examples.js";
import { buildMcpSmokeChecklistArtifact } from "../api/mcp-smoke-checklist.js";
import { buildMcpToolManifest } from "../api/mcp-manifest.js";
import { goldenQueries } from "../eval/golden-queries.js";
import { createBlockedEvalSummary, runGoldenQueries, type EvalSummary } from "../eval/runner.js";
import { runIngestion } from "../ingestion/run.js";
import { buildSourceRegistryReviewArtifact, buildSourceRegistryReviewRequests } from "../ingestion/source-review.js";
import { buildSourceRegistryArtifact, buildSourceRegistryDiff, sourceRegistry } from "../ingestion/source-registry.js";
import { rateAllToolCards } from "../rating/engine.js";
import { DEFAULT_RECOMMENDATION_MODEL, buildProviderRegistryArtifact } from "../recommendation/provider-registry.js";
import { buildSearchIndex } from "../search/index-builder.js";
import type { ToolCard } from "../schema.js";
import { buildSkippedToolCardUrlValidation, buildToolCardFieldProvenance, checkToolCardUrls, validateToolCards } from "../validation/tool-card-validator.js";

export interface BuildArtifactsOptions {
  outputDir: string;
  toolCards?: ToolCard[];
  checkUrlReachability?: boolean;
  fetchImpl?: typeof fetch;
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

  const toolCards = options.toolCards ?? (await buildReliableToolCardsFromIngestion(options));
  const toolCardValidation = validateToolCards(toolCards);
  if (!toolCardValidation.passed) {
    throw new Error(`Tool Card validation failed: ${toolCardValidation.errors.join("; ")}`);
  }
  const toolCardFieldProvenance = buildToolCardFieldProvenance(toolCards, "2026-07-06T00:00:00Z");

  const ratings = rateAllToolCards(toolCards);
  const index = buildSearchIndex(toolCards, ratings);
  const apiKey = process.env.AGENT_RADAR_LLM_API_KEY ?? "";
  const model = process.env.AGENT_RADAR_LLM_MODEL ?? DEFAULT_RECOMMENDATION_MODEL;
  const evalSummary = apiKey
    ? await runGoldenQueries(goldenQueries, toolCards, ratings, { apiKey, model })
    : createBlockedEvalSummary(goldenQueries, "AGENT_RADAR_LLM_API_KEY is required for LLM-backed recommendation eval.");
  const dataVersion = "data-2026-07-06";
  const sourceRegistryArtifact = buildSourceRegistryArtifact(sourceRegistry, "2026-07-06T00:00:00Z");
  const sourceRegistryDiff = buildSourceRegistryDiff([], sourceRegistry, "2026-07-06T00:00:00Z");
  const sourceRegistryReview = buildSourceRegistryReviewArtifact(sourceRegistryDiff, "2026-07-06T00:00:00Z");
  const sourceRegistryReviewRequests = buildSourceRegistryReviewRequests(sourceRegistryReview, "2026-07-06T00:00:00Z");
  const shouldCheckUrls = options.checkUrlReachability ?? process.env.AGENT_RADAR_CHECK_URLS === "true";
  const toolCardUrlValidation = shouldCheckUrls
    ? await checkToolCardUrls(toolCards, { fetchImpl: options.fetchImpl, checkedAt: "2026-07-06T00:00:00Z" })
    : buildSkippedToolCardUrlValidation(toolCards, "2026-07-06T00:00:00Z", "url_reachability_check_not_enabled");
  const providerRegistry = buildProviderRegistryArtifact();
  const mcpToolManifest = buildMcpToolManifest();
  const mcpExamples = buildMcpExamplesArtifact();
  const mcpSmokeChecklist = buildMcpSmokeChecklistArtifact();

  await writeFile(join(publicDataDir, "tool_cards.jsonl"), toJsonl(toolCards), "utf8");
  await writeFile(join(publicDataDir, "ratings.jsonl"), toJsonl(ratings), "utf8");
  await writeFile(join(publicDataDir, "search_index.json"), JSON.stringify(index, null, 2), "utf8");
  await writeFile(join(publicDataDir, "source_registry.json"), JSON.stringify(sourceRegistryArtifact, null, 2), "utf8");
  await writeFile(join(publicDataDir, "source_registry_diff.json"), JSON.stringify(sourceRegistryDiff, null, 2), "utf8");
  await writeFile(join(publicDataDir, "source_registry_review.json"), JSON.stringify(sourceRegistryReview, null, 2), "utf8");
  await writeFile(join(publicDataDir, "source_registry_review_requests.json"), JSON.stringify(sourceRegistryReviewRequests, null, 2), "utf8");
  await writeFile(join(publicDataDir, "tool_card_validation.json"), JSON.stringify(toolCardValidation, null, 2), "utf8");
  await writeFile(join(publicDataDir, "tool_card_field_provenance.json"), JSON.stringify(toolCardFieldProvenance, null, 2), "utf8");
  await writeFile(join(publicDataDir, "tool_card_url_validation.json"), JSON.stringify(toolCardUrlValidation, null, 2), "utf8");
  await writeFile(join(publicDataDir, "provider_registry.json"), JSON.stringify(providerRegistry, null, 2), "utf8");
  await writeFile(join(publicDataDir, "mcp_tools.json"), JSON.stringify(mcpToolManifest, null, 2), "utf8");
  await writeFile(join(publicDataDir, "mcp_examples.json"), JSON.stringify(mcpExamples, null, 2), "utf8");
  await writeFile(join(publicDataDir, "mcp_smoke_checklist.json"), JSON.stringify(mcpSmokeChecklist, null, 2), "utf8");
  await writeFile(join(publicDataDir, "d1_seed.sql"), renderD1SeedSql(toolCards, ratings, index.documents), "utf8");
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
          search_index: "search_index.v1",
          source_registry: "source_registry.v1"
        },
        rules_versions: {
          rating: "rating_rules.v0.1-draft",
          recommendation: "recommendation_rules.v1"
        },
        index_version: "index-2026-07-06",
        source_registry: "data/source_registry.json",
        source_registry_diff: "data/source_registry_diff.json",
        source_registry_review: "data/source_registry_review.json",
        source_registry_review_requests: "data/source_registry_review_requests.json",
        tool_card_validation: "data/tool_card_validation.json",
        tool_card_field_provenance: "data/tool_card_field_provenance.json",
        tool_card_url_validation: "data/tool_card_url_validation.json",
        provider_registry: "data/provider_registry.json",
        mcp_tools: "data/mcp_tools.json",
        mcp_examples: "data/mcp_examples.json",
        mcp_smoke_checklist: "data/mcp_smoke_checklist.json",
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
    toolCount: toolCards.length,
    ratingCount: ratings.length,
    goldenQueriesPassed: evalSummary.passed,
    goldenQueriesTotal: evalSummary.total
  };
}

async function buildReliableToolCardsFromIngestion(options: BuildArtifactsOptions): Promise<ToolCard[]> {
  const ingestion = await runIngestion({
    outputDir: options.outputDir,
    now: "2026-07-06T00:00:00Z",
    fetchImpl: options.fetchImpl,
    existingToolCards: []
  });

  if (!ingestion.promotionCheck.passed) {
    throw new Error(`Promotion check failed: ${JSON.stringify(ingestion.promotionCheck.summary)}`);
  }

  return ingestion.promotionCandidates.items.map((item) => item.draft);
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
      return `- ${result.case_id}: ${status}, category=${result.failure_category}, action=${result.recommended_action}, top=${result.top_tool_ids.join(", ")}${failures}`;
    })
  ];
  return `${lines.join("\n")}\n`;
}

function renderD1SeedSql(
  cards: ToolCard[],
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
