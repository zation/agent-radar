import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { assertDataTrustArtifacts, buildArtifacts } from "../src/pipeline/build-artifacts.js";
import { sourceRegistry as defaultSourceRegistry } from "../src/ingestion/source-registry.js";
import type { ToolCard } from "../src/schema.js";
import { buildFeedbackArtifacts } from "../src/feedback-processing/artifacts.js";
import { validateEvalTokenUsageArtifact } from "../src/eval/token-usage.js";

interface EvalSummaryFile {
  results: Array<{ failure_category: string; failures: string[] }>;
}

interface ManifestFile {
  eval_report: string;
  eval_token_usage: string;
  rules_versions: { rating: string; feedback: string };
  schema_versions: { tool_card: string; source_registry: string; rating_result: string; eval_token_usage: string };
  source_registry: string;
  source_registry_diff: string;
  source_registry_review: string;
  source_registry_review_requests: string;
  tool_card_validation: string;
  tool_card_field_provenance: string;
  tool_card_field_value_provenance_v2: string;
  tool_card_conflict_report: string;
  tool_card_url_validation: string;
  tool_card_url_validation_v2: string;
  data_quality_report: string;
  provider_registry: string;
  mcp_tools: string;
  mcp_examples: string;
  mcp_smoke_checklist: string;
  feedback_summary: string;
}

function mockGitHubRepo(fullName: string): Record<string, unknown> {
  const name = fullName.split("/").at(-1) ?? fullName;
  return {
    full_name: fullName,
    name,
    html_url: `https://github.com/${fullName}`,
    description: `${fullName} public repository metadata for pipeline tests.`,
    stargazers_count: 1000,
    license: { spdx_id: "MIT" },
    pushed_at: "2026-07-07T00:00:00Z",
    topics: ["mcp", "agent-radar-test"],
    homepage: `https://example.com/${fullName}`
  };
}

const anthropicSkillManifest = "---\nname: PDF Skill\ndescription: Use this skill when processing PDF workspace files.\n---\n## Steps\n1. Inspect the workspace file.\n## Boundaries\nDo not overwrite source files before approval.\n";
const ponytailSkillManifest = "---\nname: Ponytail Skill\ndescription: Use this skill when organizing workspace files.\n---\n## Workflow\n1. Read the workspace file.\n## Limits\nNever modify files without approval.\n";

function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

test("builds MVP data artifacts and an eval report", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));
  const originalApiKey = process.env.AGENT_RADAR_LLM_API_KEY;
  const originalModel = process.env.AGENT_RADAR_LLM_MODEL;
  const fetchImpl: typeof fetch = (url) => {
    const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (requestUrl.startsWith("https://api.github.com/search/repositories")) {
      if (requestUrl.includes("q=topic%3Aagent-skills")) {
        return Promise.resolve(new Response(JSON.stringify({ items: [
          { ...mockGitHubRepo("anthropics/skills"), default_branch: "main" },
          { ...mockGitHubRepo("DietrichGebert/ponytail"), default_branch: "main" },
        ] }), { status: 200, headers: { "content-type": "application/json" } }));
      }
      return Promise.resolve(new Response(
        JSON.stringify({
          items: Array.from({ length: 15 }, (_, index) => ({
            full_name: `example/public-mcp-${index + 1}`,
            name: `public-mcp-${index + 1}`,
            html_url: `https://github.com/example/public-mcp-${index + 1}`,
            description: `Public MCP server ${index + 1} for test fixtures.`,
            stargazers_count: 2000 - index,
            license: { spdx_id: "MIT" },
            pushed_at: "2026-07-07T00:00:00Z",
            topics: ["mcp", "model-context-protocol"]
          }))
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ));
    }
    if (requestUrl === "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1") {
      return Promise.resolve(new Response(JSON.stringify({ truncated: false, tree: [
        { path: "skills/pdf/SKILL.md", mode: "100644", type: "blob", sha: gitBlobSha(anthropicSkillManifest) },
      ] }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (requestUrl === "https://api.github.com/repos/DietrichGebert/ponytail/git/trees/main?recursive=1") {
      return Promise.resolve(new Response(JSON.stringify({ truncated: false, tree: [
        { path: "skills/ponytail/SKILL.md", mode: "100644", type: "blob", sha: gitBlobSha(ponytailSkillManifest) },
      ] }), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (requestUrl === "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md") {
      return Promise.resolve(new Response(anthropicSkillManifest, { status: 200, headers: { "content-type": "text/markdown" } }));
    }
    if (requestUrl === "https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md") {
      return Promise.resolve(new Response(ponytailSkillManifest, { status: 200, headers: { "content-type": "text/markdown" } }));
    }
    if (requestUrl === "https://registry.npmjs.org/@modelcontextprotocol/sdk") {
      return Promise.resolve(new Response(
        JSON.stringify({
          name: "@modelcontextprotocol/sdk",
          description: "Model Context Protocol SDK package for test fixtures.",
          license: "MIT",
          repository: { type: "git", url: "git+https://github.com/modelcontextprotocol/typescript-sdk.git" },
          homepage: "https://modelcontextprotocol.io",
          keywords: ["mcp", "model-context-protocol", "typescript"],
          "dist-tags": { latest: "1.2.3" },
          time: { modified: "2026-07-07T12:00:00.000Z" }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ));
    }
    if (requestUrl.startsWith("https://api.github.com/repos/")) {
      const fullName = requestUrl.replace("https://api.github.com/repos/", "");
      return Promise.resolve(new Response(JSON.stringify(mockGitHubRepo(fullName)), { status: 200, headers: { "content-type": "application/json" } }));
    }
    if (requestUrl.startsWith("https://docs.stripe.com/") || requestUrl.startsWith("https://developers.google.com/") || requestUrl.startsWith("https://developers.openai.com/")) {
      return Promise.resolve(new Response(
        `<html><head><title>${requestUrl}</title><meta name="description" content="Official documentation for ${requestUrl}."></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } }
      ));
    }
    return Promise.resolve(new Response("not found", { status: 404 }));
  };

  try {
    delete process.env.AGENT_RADAR_LLM_API_KEY;
    delete process.env.AGENT_RADAR_LLM_MODEL;

    await mkdir(join(outputDir, "data", "approval_requests"), { recursive: true });
    await writeFile(join(outputDir, "data", "approval_requests", "legacy.json"), "{}", "utf8");

    const release = { release_id: "v0.5-pipeline-test", commit_sha: "0123456789abcdef" };
    const summary = await buildArtifacts({ outputDir, fetchImpl, checkUrlReachability: false, release });

    await assert.rejects(access(join(outputDir, "data", "approval_requests")), { code: "ENOENT" });
    assert.equal(
      (await readFile(join(outputDir, "data", "intervention_requests", "tool_card_drafts.json"), "utf8")).includes(
        "tool_card_intervention_requests.v1"
      ),
      true
    );

    assert.equal(summary.toolCount >= 50, true);
    assert.equal(summary.toolCount <= 150, true);
    assert.equal(summary.goldenQueriesPassed, 0);
    assert.equal(summary.goldenQueriesTotal >= 10, true);

    const releaseArtifact = JSON.parse(await readFile(join(outputDir, "data", "eval_summary.json"), "utf8")) as { release: typeof release };
    assert.deepEqual(releaseArtifact.release, release);

    const manifest = JSON.parse(await readFile(join(outputDir, "data", "manifest.json"), "utf8")) as ManifestFile;
    assert.equal(manifest.rules_versions.rating, "rating_rules.v0.2");
    assert.equal(manifest.schema_versions.tool_card, "tool_card.v1");
    assert.equal(manifest.schema_versions.rating_result, "rating_result.v2");
    assert.equal(manifest.rules_versions.feedback, "feedback_rules.v0.1");
    assert.equal(manifest.feedback_summary, "data/feedback_summary.json");
    assert.equal(manifest.schema_versions.source_registry, "source_registry.v1");
    assert.equal(manifest.source_registry, "data/source_registry.json");
    assert.equal(manifest.source_registry_diff, "data/source_registry_diff.json");
    assert.equal(manifest.source_registry_review, "data/source_registry_review.json");
    assert.equal(manifest.source_registry_review_requests, "data/source_registry_review_requests.json");
    assert.equal(manifest.tool_card_validation, "data/tool_card_validation.json");
    assert.equal(manifest.tool_card_field_provenance, "data/tool_card_field_provenance.json");
    assert.equal(manifest.tool_card_field_value_provenance_v2, "data/field_provenance/tool_card_fields.v2.json");
    assert.equal(manifest.tool_card_conflict_report, "data/conflicts/tool_card_conflicts.json");
    assert.equal(manifest.tool_card_url_validation, "data/tool_card_url_validation.json");
    assert.equal(manifest.tool_card_url_validation_v2, "data/tool_card_url_validation.v2.json");
    assert.equal(manifest.data_quality_report, "data/data_quality_report.json");
    assert.equal(manifest.provider_registry, "data/provider_registry.json");
    assert.equal(manifest.mcp_tools, "data/mcp_tools.json");
    assert.equal(manifest.mcp_examples, "data/mcp_examples.json");
    assert.equal(manifest.mcp_smoke_checklist, "data/mcp_smoke_checklist.json");
    assert.equal(manifest.eval_token_usage, "reports/eval_token_usage.json");
    assert.equal(manifest.schema_versions.eval_token_usage, "eval_token_usage.v1");

    const sourceRegistry = JSON.parse(await readFile(join(outputDir, "data", "source_registry.json"), "utf8"));
    assert.equal(sourceRegistry.schema_version, "source_registry.v1");
    assert.equal(sourceRegistry.sources.length, defaultSourceRegistry.length);
    assert.equal(sourceRegistry.validation.passed, true);
    assert.deepEqual(sourceRegistry.validation.errors, []);

    const sourceRegistryDiff = JSON.parse(await readFile(join(outputDir, "data", "source_registry_diff.json"), "utf8"));
    assert.equal(sourceRegistryDiff.schema_version, "source_registry_diff.v1");
    assert.deepEqual(sourceRegistryDiff.summary, { added: defaultSourceRegistry.length, removed: 0, changed: 0 });

    const sourceRegistryReview = JSON.parse(await readFile(join(outputDir, "data", "source_registry_review.json"), "utf8"));
    assert.equal(sourceRegistryReview.schema_version, "source_registry_review.v1");
    assert.deepEqual(sourceRegistryReview.summary, { total_requirements: 0, confirmed: 0, rejected: 0, needs_changes: 0, pending: 0 });
    const sourceRegistryReviewRequests = JSON.parse(await readFile(join(outputDir, "data", "source_registry_review_requests.json"), "utf8"));
    assert.equal(sourceRegistryReviewRequests.schema_version, "source_registry_review_requests.v1");
    assert.deepEqual(sourceRegistryReviewRequests.summary, { pending_review: 0, confirmation_required: 0 });

    const toolCardValidation = JSON.parse(await readFile(join(outputDir, "data", "tool_card_validation.json"), "utf8"));
    assert.equal(toolCardValidation.schema_version, "tool_card_validation.v1");
    assert.equal(toolCardValidation.passed, true);
    assert.equal(toolCardValidation.checked_count, summary.toolCount);

    const toolCardFieldProvenance = JSON.parse(await readFile(join(outputDir, "data", "tool_card_field_provenance.json"), "utf8")) as {
      schema_version: string;
      critical_fields: string[];
      summary: { cards_checked: number; fields_checked: number; covered: number; covered_by_manual_review: number; missing: number };
    };
    assert.equal(toolCardFieldProvenance.schema_version, "tool_card_field_provenance.v1");
    assert.deepEqual(toolCardFieldProvenance.critical_fields, ["permissions", "security", "maintenance"]);
    assert.equal(toolCardFieldProvenance.summary.cards_checked, summary.toolCount);
    assert.equal(toolCardFieldProvenance.summary.fields_checked, summary.toolCount * 3);
    assert.equal(toolCardFieldProvenance.summary.covered >= 29, true);
    assert.equal(toolCardFieldProvenance.summary.covered_by_manual_review, 0);
    assert.equal(toolCardFieldProvenance.summary.missing < summary.toolCount * 3, true);

    const fieldValueProvenanceV2 = JSON.parse(
      await readFile(join(outputDir, "data", "field_provenance", "tool_card_fields.v2.json"), "utf8"),
    );
    assert.equal(fieldValueProvenanceV2.schema_version, "tool_card_field_value_provenance.v2");
    assert.equal(fieldValueProvenanceV2.summary.critical_coverage, 1);

    const conflictReport = JSON.parse(
      await readFile(join(outputDir, "data", "conflicts", "tool_card_conflicts.json"), "utf8"),
    );
    assert.equal(conflictReport.schema_version, "tool_card_conflict_report.v1");
    assert.equal(conflictReport.summary.unresolved_critical, 0);

    const toolCardUrlValidation = JSON.parse(await readFile(join(outputDir, "data", "tool_card_url_validation.json"), "utf8"));
    assert.equal(toolCardUrlValidation.schema_version, "tool_card_url_validation.v1");
    assert.equal(toolCardUrlValidation.summary.checked, 0);
    assert.equal(toolCardUrlValidation.summary.skipped > 0, true);

    const toolCardUrlValidationV2 = JSON.parse(
      await readFile(join(outputDir, "data", "tool_card_url_validation.v2.json"), "utf8"),
    );
    assert.equal(toolCardUrlValidationV2.schema_version, "tool_card_url_validation.v2");
    assert.equal(toolCardUrlValidationV2.options.enabled, false);
    assert.equal(toolCardUrlValidationV2.summary.skipped > 0, true);

    const dataQualityReport = JSON.parse(
      await readFile(join(outputDir, "data", "data_quality_report.json"), "utf8"),
    );
    assert.equal(dataQualityReport.schema_version, "data_quality_report.v1");
    assert.equal(dataQualityReport.status, "pass");
    assert.equal(dataQualityReport.provenance.critical_coverage, 1);

    const providerRegistry = JSON.parse(await readFile(join(outputDir, "data", "provider_registry.json"), "utf8")) as {
      schema_version: string;
      registry_version: string;
      default_model: string;
      models: Array<{ label: string; provider: string }>;
    };
    assert.equal(providerRegistry.schema_version, "provider_registry.v1");
    assert.equal(providerRegistry.registry_version, "provider_registry.v0.2");
    assert.equal(providerRegistry.default_model, "deepseek-v4-flash");
    assert.deepEqual(
      providerRegistry.models.map((model) => [model.label, model.provider]),
      [
        ["OpenAI GPT-4.1", "openai"],
        ["OpenAI GPT-4.1 mini", "openai"],
        ["MiniMax M3", "minimax"],
        ["DeepSeek V4 Pro", "deepseek"],
        ["DeepSeek V4 Flash", "deepseek"]
      ]
    );

    const mcpTools = JSON.parse(await readFile(join(outputDir, "data", "mcp_tools.json"), "utf8"));
    assert.equal(mcpTools.schema_version, "mcp_tool_manifest.v1");
    assert.equal(mcpTools.transport, "streamable-http");
    assert.equal(mcpTools.tools.length, 4);

    const mcpExamples = JSON.parse(await readFile(join(outputDir, "data", "mcp_examples.json"), "utf8")) as {
      schema_version: string;
      endpoint: string;
      examples: Array<{ name: string; request: { method: string; params?: { name?: string } } }>;
    };
    assert.equal(mcpExamples.schema_version, "mcp_examples.v2");
    assert.equal(mcpExamples.endpoint, "/api/mcp");
    assert.deepEqual(
      mcpExamples.examples.map((example) => example.name),
      ["initialize", "tools/list", "tools/call:search_tools", "tools/call:get_tool_card", "tools/call:explain_rating", "tools/call:recommend_tools"]
    );
    assert.equal(mcpExamples.examples.find((example) => example.name === "tools/call:get_tool_card")?.request.params?.name, "get_tool_card");

    const mcpSmokeChecklist = JSON.parse(await readFile(join(outputDir, "data", "mcp_smoke_checklist.json"), "utf8")) as {
      schema_version: string;
      endpoint: string;
      summary: { total: number; required: number };
      checks: Array<{ id: string; required: boolean }>;
    };
    assert.equal(mcpSmokeChecklist.schema_version, "mcp_smoke_checklist.v2");
    assert.equal(mcpSmokeChecklist.endpoint, "/api/mcp");
    assert.deepEqual(
      mcpSmokeChecklist.checks.map((check) => check.id),
      ["initialize", "tools-list", "search-tools", "get-tool-card", "explain-rating", "recommend-missing-key", "write-method-rejected"]
    );
    assert.deepEqual(mcpSmokeChecklist.summary, { total: 7, required: 7 });

    const searchIndex = JSON.parse(await readFile(join(outputDir, "data", "search_index.json"), "utf8")) as {
      documents: Array<{ tool_id: string }>;
    };
    assert.equal(searchIndex.documents.length, summary.toolCount);
    const indexedToolIds = searchIndex.documents.map((document: { tool_id: string }) => document.tool_id);
    assert.ok(indexedToolIds.includes("mcp-browser-automation"));
    assert.ok(indexedToolIds.includes("skill-stripe-checkout-guidance"));
    assert.ok(indexedToolIds.includes("mcp-github-server"));
    assert.ok(indexedToolIds.includes("skill-anthropics-skills-pdf"));
    assert.ok(indexedToolIds.includes("skill-dietrichgebert-ponytail-ponytail"));

    const ratings = (await readFile(join(outputDir, "data", "ratings.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { tool_id: string; rules_version: string; dimension_scores: Record<string, number> });
    const skillRating = ratings.find((rating) => rating.tool_id === "skill-anthropics-skills-pdf");
    assert.equal(skillRating?.rules_version, "rating_rules.v0.2");
    assert.ok(skillRating?.dimension_scores.trigger_clarity);
    assert.equal(skillRating?.dimension_scores.documentation_quality, undefined);

    const ingestionReview = JSON.parse(await readFile(join(outputDir, "data", "review", "ingestion.json"), "utf8")) as {
      result: { snapshots: Array<{ source_id: string }>; sourceRecords: Array<{ source_id: string }> };
    };
    assert.equal(ingestionReview.result.snapshots.filter((item) => item.source_id === "github-topic-agent-skills").length, 5);
    assert.equal(ingestionReview.result.sourceRecords.filter((item) => item.source_id === "github-topic-agent-skills").length, 2);
    for (const artifactPath of ["tool_cards.jsonl", "ratings.jsonl", "search_index.json", "manifest.json"]) {
      const artifact = await readFile(join(outputDir, "data", artifactPath), "utf8");
      assert.equal(artifact.includes("Do not overwrite source files before approval."), false);
    }

    const evalSummary = JSON.parse(await readFile(join(outputDir, "data", "eval_summary.json"), "utf8")) as EvalSummaryFile;
    assert.equal(evalSummary.results[0].failure_category, "blocked_no_key");
    assert.match(evalSummary.results[0].failures[0], /AGENT_RADAR_LLM_API_KEY/);
    const evalReport = await readFile(join(outputDir, manifest.eval_report), "utf8");
    assert.match(evalReport, /category=blocked_no_key/);
    const tokenUsage = validateEvalTokenUsageArtifact(
      JSON.parse(await readFile(join(outputDir, "reports", "eval_token_usage.json"), "utf8")),
      release,
    );
    assert.equal(tokenUsage.summary.case_count, 24);
    assert.equal(tokenUsage.summary.request_attempts, 0);
    assert.ok(tokenUsage.cases.every(({ execution_status }) => execution_status === "blocked_no_key"));

    const d1SeedSql = await readFile(join(outputDir, "data", "d1_seed.sql"), "utf8");
    assert.match(d1SeedSql, /INSERT INTO tool_cards/);
    assert.match(d1SeedSql, /INSERT INTO ratings/);
    assert.match(d1SeedSql, /INSERT INTO search_documents/);
  } finally {
    if (originalApiKey === undefined) delete process.env.AGENT_RADAR_LLM_API_KEY;
    else process.env.AGENT_RADAR_LLM_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.AGENT_RADAR_LLM_MODEL;
    else process.env.AGENT_RADAR_LLM_MODEL = originalModel;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("pipeline records real provider response usage for every golden query", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-token-pipeline-"));
  const originalApiKey = process.env.AGENT_RADAR_LLM_API_KEY;
  const originalModel = process.env.AGENT_RADAR_LLM_MODEL;
  const originalFetch = globalThis.fetch;
  const release = { release_id: "all-v0.7.0-test", commit_sha: "feedface" };
  try {
    process.env.AGENT_RADAR_LLM_API_KEY = "test-secret";
    process.env.AGENT_RADAR_LLM_MODEL = "OpenAI GPT-4.1";
    globalThis.fetch = () => Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] }) } }],
      usage: { prompt_tokens: 100, prompt_tokens_details: { cached_tokens: 20 }, completion_tokens: 10, total_tokens: 110 },
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await buildArtifacts({ outputDir, toolCards: reviewedToolCardFixtures, checkUrlReachability: false, release });

    const artifact = validateEvalTokenUsageArtifact(
      JSON.parse(await readFile(join(outputDir, "reports", "eval_token_usage.json"), "utf8")),
      release,
    );
    assert.equal(artifact.summary.request_attempts, 24);
    assert.equal(artifact.summary.reported_attempts, 24);
    assert.equal(artifact.summary.input_tokens, 2400);
    assert.equal(artifact.summary.cached_input_tokens, 480);
    assert.equal(artifact.summary.output_tokens, 240);
    assert.equal(artifact.summary.total_tokens, 2640);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.AGENT_RADAR_LLM_API_KEY;
    else process.env.AGENT_RADAR_LLM_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.AGENT_RADAR_LLM_MODEL;
    else process.env.AGENT_RADAR_LLM_MODEL = originalModel;
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("publishes one feedback-adjusted score to ratings and search index", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-feedback-pipeline-"));
  const generatedAt = "2026-07-12T04:00:00.000Z";
  const toolId = reviewedToolCardFixtures[0].id;
  const artifacts = buildFeedbackArtifacts({
    voteRows: [{ tool_id: toolId, up_count: 1, down_count: 0, row_count: 1 }],
    historicalAccepted: [], newIssues: [], classifications: [], generatedAt, releaseTag: "fixture",
  });
  try {
    await buildArtifacts({
      outputDir, toolCards: reviewedToolCardFixtures, generatedAt,
      checkUrlReachability: false,
      feedbackBuildInput: { schema_version: "feedback_build_input.v1", generated_at: generatedAt, release_tag: "fixture", artifacts },
    });
    const ratings = (await readFile(join(outputDir, "data", "ratings.jsonl"), "utf8")).trim().split("\n").map((line) => JSON.parse(line) as { tool_id: string; overall_score: number; base_score: number; feedback_adjustment: { vote_snapshot_checksum: string } });
    const rating = ratings.find(({ tool_id }) => tool_id === toolId);
    const index = JSON.parse(await readFile(join(outputDir, "data", "search_index.json"), "utf8")) as { documents: Array<{ tool_id: string; rating_overall: number }> };
    const document = index.documents.find(({ tool_id }) => tool_id === toolId);
    assert.ok(rating);
    assert.ok(document);
    assert.equal(rating.overall_score, rating.base_score + 0.2);
    assert.equal(document.rating_overall, rating.overall_score);
    assert.ok(ratings.every(({ feedback_adjustment }) => feedback_adjustment.vote_snapshot_checksum === artifacts.summary.vote_snapshot_checksum));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("data trust gate rejects incomplete provenance and unresolved critical conflicts", () => {
  assert.throws(
    () => assertDataTrustArtifacts(
      { summary: { critical_coverage: 0.9 } },
      { summary: { unresolved_critical: 0 } },
    ),
    /critical_provenance_incomplete/,
  );
  assert.throws(
    () => assertDataTrustArtifacts(
      { summary: { critical_coverage: 1 } },
      { summary: { unresolved_critical: 1 } },
    ),
    /unresolved_critical_field_conflict/,
  );
  assert.throws(
    () => assertDataTrustArtifacts(
      { summary: { critical_coverage: 1 } },
      { summary: { unresolved_critical: 0 } },
      { summary: { blocking: 1 } },
    ),
    /blocking_url_validation/,
  );
});

test("pipeline rejects invalid tool cards before publishing artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));
  const invalidCard: ToolCard = {
    ...reviewedToolCardFixtures[0],
    id: "invalid-release-card",
    source_urls: [],
    evidence_refs: []
  };

  try {
    await assert.rejects(
      () => buildArtifacts({ outputDir, toolCards: [invalidCard] }),
      /data_quality_blocked: .*tool_card_validation_failed/
    );
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("pipeline can run Tool Card URL reachability checks when enabled", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));
  const fetchImpl: typeof fetch = () => Promise.resolve(new Response("ok", { status: 200 }));

  try {
    await buildArtifacts({
      outputDir,
      toolCards: [reviewedToolCardFixtures[0]],
      checkUrlReachability: true,
      fetchImpl
    });

    const toolCardUrlValidation = JSON.parse(await readFile(join(outputDir, "data", "tool_card_url_validation.json"), "utf8")) as {
      summary: { checked: number; reachable: number; failed: number; skipped: number };
    };

    assert.equal(toolCardUrlValidation.summary.checked > 0, true);
    assert.equal(toolCardUrlValidation.summary.reachable, toolCardUrlValidation.summary.checked);
    assert.equal(toolCardUrlValidation.summary.failed, 0);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
