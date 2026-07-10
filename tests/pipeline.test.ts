import assert from "node:assert/strict";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { buildArtifacts } from "../src/pipeline/build-artifacts.js";
import { sourceRegistry as defaultSourceRegistry } from "../src/ingestion/source-registry.js";
import type { ToolCard } from "../src/schema.js";

interface EvalSummaryFile {
  results: Array<{ failure_category: string; failures: string[] }>;
}

interface ManifestFile {
  eval_report: string;
  rules_versions: { rating: string };
  schema_versions: { tool_card: string; source_registry: string };
  source_registry: string;
  source_registry_diff: string;
  source_registry_review: string;
  source_registry_review_requests: string;
  tool_card_validation: string;
  tool_card_field_provenance: string;
  tool_card_url_validation: string;
  provider_registry: string;
  mcp_tools: string;
  mcp_examples: string;
  mcp_smoke_checklist: string;
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
    homepage: `https://example.com/${name}`
  };
}

test("builds MVP data artifacts and an eval report", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));
  const originalApiKey = process.env.AGENT_RADAR_LLM_API_KEY;
  const originalModel = process.env.AGENT_RADAR_LLM_MODEL;
  const fetchImpl: typeof fetch = (url) => {
    const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    if (requestUrl.startsWith("https://api.github.com/search/repositories")) {
      return Promise.resolve(new Response(
        JSON.stringify({
          items: [
            {
              full_name: "example/public-mcp",
              name: "public-mcp",
              html_url: "https://github.com/example/public-mcp",
              description: "Public MCP server for test fixtures.",
              stargazers_count: 2000,
              license: { spdx_id: "MIT" },
              pushed_at: "2026-07-07T00:00:00Z",
              topics: ["mcp", "model-context-protocol"]
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      ));
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

    const summary = await buildArtifacts({ outputDir, fetchImpl });

    await assert.rejects(access(join(outputDir, "data", "approval_requests")), { code: "ENOENT" });
    assert.equal(
      (await readFile(join(outputDir, "data", "intervention_requests", "tool_card_drafts.json"), "utf8")).includes(
        "tool_card_intervention_requests.v1"
      ),
      true
    );

    assert.equal(summary.toolCount >= 10, true);
    assert.equal(summary.goldenQueriesPassed, 0);
    assert.equal(summary.goldenQueriesTotal >= 10, true);

    const manifest = JSON.parse(await readFile(join(outputDir, "data", "manifest.json"), "utf8")) as ManifestFile;
    assert.equal(manifest.rules_versions.rating, "rating_rules.v0.1-draft");
    assert.equal(manifest.schema_versions.tool_card, "tool_card.v1");
    assert.equal(manifest.schema_versions.source_registry, "source_registry.v1");
    assert.equal(manifest.source_registry, "data/source_registry.json");
    assert.equal(manifest.source_registry_diff, "data/source_registry_diff.json");
    assert.equal(manifest.source_registry_review, "data/source_registry_review.json");
    assert.equal(manifest.source_registry_review_requests, "data/source_registry_review_requests.json");
    assert.equal(manifest.tool_card_validation, "data/tool_card_validation.json");
    assert.equal(manifest.tool_card_field_provenance, "data/tool_card_field_provenance.json");
    assert.equal(manifest.tool_card_url_validation, "data/tool_card_url_validation.json");
    assert.equal(manifest.provider_registry, "data/provider_registry.json");
    assert.equal(manifest.mcp_tools, "data/mcp_tools.json");
    assert.equal(manifest.mcp_examples, "data/mcp_examples.json");
    assert.equal(manifest.mcp_smoke_checklist, "data/mcp_smoke_checklist.json");

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
    assert.equal(toolCardFieldProvenance.summary.missing <= 4, true);

    const toolCardUrlValidation = JSON.parse(await readFile(join(outputDir, "data", "tool_card_url_validation.json"), "utf8"));
    assert.equal(toolCardUrlValidation.schema_version, "tool_card_url_validation.v1");
    assert.equal(toolCardUrlValidation.summary.checked, 0);
    assert.equal(toolCardUrlValidation.summary.skipped > 0, true);

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
    assert.equal(mcpTools.tools.length, 4);

    const mcpExamples = JSON.parse(await readFile(join(outputDir, "data", "mcp_examples.json"), "utf8")) as {
      schema_version: string;
      endpoint: string;
      examples: Array<{ name: string; request: { method: string; params?: { name?: string } } }>;
    };
    assert.equal(mcpExamples.schema_version, "mcp_examples.v1");
    assert.equal(mcpExamples.endpoint, "/api/mcp");
    assert.deepEqual(
      mcpExamples.examples.map((example) => example.name),
      ["initialize", "tools/list", "tools/call:get_tool_card", "tools/call:search_tools"]
    );
    assert.equal(mcpExamples.examples.find((example) => example.name === "tools/call:get_tool_card")?.request.params?.name, "get_tool_card");

    const mcpSmokeChecklist = JSON.parse(await readFile(join(outputDir, "data", "mcp_smoke_checklist.json"), "utf8")) as {
      schema_version: string;
      endpoint: string;
      summary: { total: number; required: number };
      checks: Array<{ id: string; required: boolean }>;
    };
    assert.equal(mcpSmokeChecklist.schema_version, "mcp_smoke_checklist.v1");
    assert.equal(mcpSmokeChecklist.endpoint, "/api/mcp");
    assert.deepEqual(
      mcpSmokeChecklist.checks.map((check) => check.id),
      ["mcp-initialize", "mcp-tools-list", "mcp-tools-call-get-tool-card", "mcp-read-only-boundary"]
    );
    assert.deepEqual(mcpSmokeChecklist.summary, { total: 4, required: 4 });

    const searchIndex = JSON.parse(await readFile(join(outputDir, "data", "search_index.json"), "utf8")) as {
      documents: Array<{ tool_id: string }>;
    };
    assert.equal(searchIndex.documents.length, summary.toolCount);
    const indexedToolIds = searchIndex.documents.map((document: { tool_id: string }) => document.tool_id);
    assert.ok(indexedToolIds.includes("mcp-browser-automation"));
    assert.ok(indexedToolIds.includes("skill-stripe-checkout-guidance"));
    assert.ok(indexedToolIds.includes("mcp-github-server"));

    const evalSummary = JSON.parse(await readFile(join(outputDir, "data", "eval_summary.json"), "utf8")) as EvalSummaryFile;
    assert.equal(evalSummary.results[0].failure_category, "blocked_no_key");
    assert.match(evalSummary.results[0].failures[0], /AGENT_RADAR_LLM_API_KEY/);
    const evalReport = await readFile(join(outputDir, manifest.eval_report), "utf8");
    assert.match(evalReport, /category=blocked_no_key/);

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
      /Tool Card validation failed: invalid-release-card: source_urls is required/
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
