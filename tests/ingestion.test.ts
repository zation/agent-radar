import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { formatIngestionCliSummary } from "../src/cli/ingest-summary.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import { buildToolDiscoveryCandidates } from "../src/ingestion/discovery-candidates.js";
import { parseSnapshot } from "../src/ingestion/parser.js";
import { runIngestion } from "../src/ingestion/run.js";
import { buildSourceRegistryReviewArtifact, buildSourceRegistryReviewRequests } from "../src/ingestion/source-review.js";
import { buildSourceRegistryDiff, getEnabledSources, sourceRegistry, validateSourceRegistry } from "../src/ingestion/source-registry.js";
import type { SourceDefinition } from "../src/schema.js";

const githubTopicSource = sourceRegistry.find((source) => source.id === "github-topic-mcp");
assert.ok(githubTopicSource);
const npmPackageSource = sourceRegistry.find((source) => source.id === "npm-modelcontextprotocol-sdk");
assert.ok(npmPackageSource);
const githubRepoSource = sourceRegistry.find((source) => source.id === "github-repo-microsoft-playwright-mcp");
assert.ok(githubRepoSource);
const stripeDocsSource = sourceRegistry.find((source) => source.id === "docs-stripe-checkout");
assert.ok(stripeDocsSource);

const manualTestSource: SourceDefinition = {
  id: "manual-agent-radar-seed",
  name: "Agent Radar reviewed tool card fixtures",
  url: "internal://manual-review/tool-card-fixtures",
  source_type: "manual",
  covered_tool_types: ["skill", "mcp", "agent"],
  collection_method: "manual",
  recommended_frequency: "manual",
  trust_level: "official",
  field_coverage: ["name", "type", "source_urls", "use_cases", "not_for", "permissions", "security", "confidence"],
  rate_limits: "local manual source",
  terms_notes: "Uses test-maintained seed data with explicit source URLs on each Tool Card.",
  access_review: {
    robots_txt: "not_applicable",
    terms: "reviewed",
    reviewed_by: "agent-radar",
    reviewed_at: "2026-07-07T00:00:00Z",
    notes: "Internal test source; source URLs on Tool Cards remain the public evidence boundary."
  },
  parser: "manual_seed_parser",
  failure_policy: "failure blocks only ingestion draft generation",
  enabled: true,
  owner: "agent-radar",
  last_reviewed_at: "2026-07-07T00:00:00Z"
};

test("source registry exposes enabled source-backed coverage for golden query domains", () => {
  const enabled = getEnabledSources(sourceRegistry);

  assert.deepEqual(enabled.slice(0, 11).map((source) => source.id), [
    "github-topic-mcp",
    "npm-modelcontextprotocol-sdk",
    "github-repo-microsoft-playwright-mcp",
    "github-repo-google-gemini-cli",
    "github-repo-vercel-ai",
    "github-repo-github-github-mcp-server",
    "github-repo-neondatabase-mcp-server-neon",
    "github-repo-getsentry-sentry-mcp",
    "docs-stripe-checkout",
    "docs-gmail-api",
    "docs-openai-codex"
  ]);
  assert.equal(enabled.length, 36);
  assert.equal(enabled[0]?.collection_method, "api");
  assert.equal(enabled[0]?.parser, "github_topic_parser");
  assert.equal(enabled[1]?.source_type, "package_registry");
  assert.equal(enabled[1]?.parser, "npm_package_parser");
  assert.equal(enabled.find((source) => source.id === "github-repo-microsoft-playwright-mcp")?.parser, "github_repo_parser");
  assert.equal(enabled.find((source) => source.id === "docs-stripe-checkout")?.parser, "official_docs_parser");
});

test("github topic sources declare explicit discovery configuration", () => {
  const configured = githubTopicSource as SourceDefinition & {
    github_discovery?: { query: string; sort: string; order: string; repository_limit: number };
  };

  assert.deepEqual(configured.github_discovery, {
    query: "topic:mcp",
    sort: "stars",
    order: "desc",
    repository_limit: 20,
  });
});

test("source registry rejects invalid github discovery limits", () => {
  const configured = githubTopicSource as SourceDefinition & {
    github_discovery?: { query: string; sort: string; order: string; repository_limit: number };
  };
  const errors = validateSourceRegistry([{
    ...githubTopicSource,
    github_discovery: {
      ...configured.github_discovery!,
      repository_limit: 0,
    },
  } as SourceDefinition]);

  assert.match(errors.join("\n"), /repository_limit must be between 1 and 100/);
});

test("ingestion CLI summary includes auto review and release gates", () => {
  const summary = formatIngestionCliSummary({
    snapshots: [{ source_id: "manual-agent-radar-seed" }],
    sourceRecords: [{}, {}],
    discoveryCandidates: { summary: { candidates: 1, pending_production_gate: 1 } },
    interventionRequests: { summary: { pending_intervention: 2, duplicate_review_required: 1, blocked_validation: 0 } },
    fieldProvenance: { summary: { tool_cards: 2, field_values: 24 } },
    autoReview: { summary: { promote: 1, keep_draft: 0, needs_review: 1, reject: 0, retire: 0 } },
    releaseAdmission: { summary: { eligible_for_publish: 1, blocked: 1 } },
    promotionCandidates: { summary: { candidates: 1 } },
    promotionPlan: { summary: { candidates: 1, reliable_publish_ready: true } },
    promotionCheck: { passed: false, summary: { ready_for_publish: 0, blocked: 1, validation_errors: 2, validation_warnings: 3 } }
  });

  assert.deepEqual(summary, {
    snapshots: 1,
    source_records: 2,
    source_ids: ["manual-agent-radar-seed"],
    discovery_candidates: {
      candidates: 1,
      pending_production_gate: 1
    },
    intervention_requests: {
      pending_intervention: 2,
      duplicate_review_required: 1,
      blocked_validation: 0
    },
    field_value_provenance: {
      tool_cards: 2,
      field_values: 24
    },
    auto_review: {
      promote: 1,
      keep_draft: 0,
      needs_review: 1,
      reject: 0,
      retire: 0
    },
    release_admission: {
      eligible_for_publish: 1,
      blocked: 1
    },
    promotion_candidates: 1,
    promotion_plan: {
      candidates: 1,
      reliable_publish_ready: true
    },
    promotion_check: {
      passed: false,
      ready_for_publish: 0,
      blocked: 1,
      validation_errors: 2,
      validation_warnings: 3
    }
  });
});

test("source registry validator rejects unsafe enabled sources", () => {
  const errors = validateSourceRegistry([
    {
      ...githubTopicSource,
      enabled: true,
      parser: undefined,
      terms_notes: "",
      last_reviewed_at: "not-a-date"
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: enabled source requires parser/);
  assert.match(errors.join("\n"), /github-topic-mcp: terms_notes is required/);
  assert.match(errors.join("\n"), /github-topic-mcp: last_reviewed_at must be ISO 8601 UTC/);
});

test("source registry validator rejects enabled sources without parser coverage", () => {
  const errors = validateSourceRegistry([
    {
      ...githubTopicSource,
      enabled: true,
      parser: "unknown_parser"
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: parser unknown_parser is not implemented/);
});

test("github topic parser creates repository source records from API payloads", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const contentPath = "data/raw/github-topic-mcp/2026-07-08/topic.json";

  try {
    await mkdir(join(outputDir, "data", "raw", "github-topic-mcp", "2026-07-08"), { recursive: true });
    await writeFile(
      join(outputDir, contentPath),
      JSON.stringify({
        items: [
          {
            full_name: "modelcontextprotocol/servers",
            name: "servers",
            html_url: "https://github.com/modelcontextprotocol/servers",
            description: "Model Context Protocol servers",
            stargazers_count: 51000,
            license: { spdx_id: "MIT" },
            pushed_at: "2026-07-07T12:00:00Z",
            topics: ["mcp", "model-context-protocol"]
          }
        ]
      }),
      "utf8"
    );

    const records = await parseSnapshot(
      {
        id: "github-topic-mcp-20260708-topic",
        schema_version: "raw_snapshot.v1",
        source_id: "github-topic-mcp",
        source_url: "https://github.com/topics/mcp",
        fetched_at: "2026-07-08T00:00:00Z",
        fetch_method: "api",
        status: "success",
        content_type: "application/json",
        content_hash: "sha256:test",
        content_path: contentPath
      },
      githubTopicSource,
      outputDir,
      "2026-07-08T00:00:00Z"
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.schema_version, "source_record.v1");
    assert.equal(records[0]?.source_id, "github-topic-mcp");
    assert.equal(records[0]?.record_type, "repository");
    assert.equal(records[0]?.name, "modelcontextprotocol/servers");
    assert.equal(records[0]?.description, "Model Context Protocol servers");
    assert.deepEqual(records[0]?.urls, ["https://github.com/modelcontextprotocol/servers"]);
    assert.deepEqual(records[0]?.parsed_fields, {
      repo_url: "https://github.com/modelcontextprotocol/servers",
      stars: 51000,
      license: "MIT",
      last_commit_at: "2026-07-07T12:00:00Z",
      topics: ["mcp", "model-context-protocol"]
    });
    assert.equal(records[0]?.source_confidence, "medium");
    assert.equal(records[0]?.parser_version, "github_topic_parser.v1");
    assert.deepEqual(records[0]?.warnings, []);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("github repo parser creates a source-profiled repository record from exact API payloads", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const contentPath = "data/raw/github-repo-microsoft-playwright-mcp/2026-07-08/repo.json";

  try {
    await mkdir(join(outputDir, "data", "raw", "github-repo-microsoft-playwright-mcp", "2026-07-08"), { recursive: true });
    await writeFile(
      join(outputDir, contentPath),
      JSON.stringify({
        full_name: "microsoft/playwright-mcp",
        name: "playwright-mcp",
        html_url: "https://github.com/microsoft/playwright-mcp",
        description: "Playwright MCP server.",
        stargazers_count: 12345,
        license: { spdx_id: "Apache-2.0" },
        pushed_at: "2026-07-07T12:00:00Z",
        topics: ["mcp", "playwright", "browser-automation"],
        homepage: "https://playwright.dev"
      }),
      "utf8"
    );

    const records = await parseSnapshot(
      {
        id: "github-repo-microsoft-playwright-mcp-20260708-repo",
        schema_version: "raw_snapshot.v1",
        source_id: "github-repo-microsoft-playwright-mcp",
        source_url: "https://api.github.com/repos/microsoft/playwright-mcp",
        fetched_at: "2026-07-08T00:00:00Z",
        fetch_method: "api",
        status: "success",
        content_type: "application/json",
        content_hash: "sha256:test",
        content_path: contentPath
      },
      githubRepoSource,
      outputDir,
      "2026-07-08T00:00:00Z"
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.record_type, "repository");
    assert.equal(records[0]?.name, "microsoft/playwright-mcp");
    assert.equal(records[0]?.parsed_fields.repo_url, "https://github.com/microsoft/playwright-mcp");
    assert.equal(records[0]?.parsed_fields.homepage_url, "https://playwright.dev");
    assert.equal((records[0]?.parsed_fields.source_profile as { tool_id?: string }).tool_id, "mcp-browser-automation");
    assert.equal(records[0]?.parser_version, "github_repo_parser.v1");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("official docs parser creates a profile-backed doc page record", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const contentPath = "data/raw/docs-stripe-checkout/2026-07-08/docs.txt";

  try {
    await mkdir(join(outputDir, "data", "raw", "docs-stripe-checkout", "2026-07-08"), { recursive: true });
    await writeFile(
      join(outputDir, contentPath),
      '<html><head><title>Stripe Checkout</title><meta name="description" content="Stripe Checkout docs for hosted payments."></head></html>',
      "utf8"
    );

    const records = await parseSnapshot(
      {
        id: "docs-stripe-checkout-20260708-docs",
        schema_version: "raw_snapshot.v1",
        source_id: "docs-stripe-checkout",
        source_url: "https://docs.stripe.com/checkout",
        fetched_at: "2026-07-08T00:00:00Z",
        fetch_method: "http",
        status: "success",
        content_type: "text/html",
        content_hash: "sha256:test",
        content_path: contentPath
      },
      stripeDocsSource,
      outputDir,
      "2026-07-08T00:00:00Z"
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.record_type, "doc_page");
    assert.equal(records[0]?.name, "Stripe Checkout Guidance");
    assert.equal(records[0]?.description, "Stripe Checkout docs for hosted payments.");
    assert.equal((records[0]?.parsed_fields.source_profile as { tool_id?: string }).tool_id, "skill-stripe-checkout-guidance");
    assert.equal(records[0]?.parser_version, "official_docs_parser.v1");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("npm package parser creates package source records from registry payloads", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const contentPath = "data/raw/npm-modelcontextprotocol-sdk/2026-07-08/package.json";

  try {
    await mkdir(join(outputDir, "data", "raw", "npm-modelcontextprotocol-sdk", "2026-07-08"), { recursive: true });
    await writeFile(
      join(outputDir, contentPath),
      JSON.stringify({
        name: "@modelcontextprotocol/sdk",
        description: "Model Context Protocol SDK",
        license: "MIT",
        repository: { type: "git", url: "git+https://github.com/modelcontextprotocol/typescript-sdk.git" },
        homepage: "https://modelcontextprotocol.io",
        keywords: ["mcp", "model-context-protocol", "typescript"],
        "dist-tags": { latest: "1.2.3" },
        time: { modified: "2026-07-07T12:00:00.000Z" }
      }),
      "utf8"
    );

    const records = await parseSnapshot(
      {
        id: "npm-modelcontextprotocol-sdk-20260708-package",
        schema_version: "raw_snapshot.v1",
        source_id: "npm-modelcontextprotocol-sdk",
        source_url: "https://registry.npmjs.org/@modelcontextprotocol/sdk",
        fetched_at: "2026-07-08T00:00:00Z",
        fetch_method: "api",
        status: "success",
        content_type: "application/json",
        content_hash: "sha256:test",
        content_path: contentPath
      },
      npmPackageSource,
      outputDir,
      "2026-07-08T00:00:00Z"
    );

    assert.equal(records.length, 1);
    assert.equal(records[0]?.record_type, "package");
    assert.equal(records[0]?.name, "@modelcontextprotocol/sdk");
    assert.deepEqual(records[0]?.urls, ["https://www.npmjs.com/package/@modelcontextprotocol/sdk", "https://github.com/modelcontextprotocol/typescript-sdk", "https://modelcontextprotocol.io"]);
    assert.deepEqual(records[0]?.parsed_fields, {
      package_name: "@modelcontextprotocol/sdk",
      package_url: "https://www.npmjs.com/package/@modelcontextprotocol/sdk",
      repo_url: "https://github.com/modelcontextprotocol/typescript-sdk",
      homepage_url: "https://modelcontextprotocol.io",
      license: "MIT",
      latest_version: "1.2.3",
      last_release_at: "2026-07-07T12:00:00.000Z",
      keywords: ["mcp", "model-context-protocol", "typescript"]
    });
    assert.equal(records[0]?.parser_version, "npm_package_parser.v1");
    assert.deepEqual(records[0]?.warnings, []);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("discovery candidates summarize repository source records for the production gate", () => {
  const candidates = buildToolDiscoveryCandidates(
    [
      {
        id: "github-topic-mcp-modelcontextprotocol-servers-20260708",
        schema_version: "source_record.v1",
        snapshot_id: "github-topic-mcp-20260708-topic",
        source_id: "github-topic-mcp",
        record_type: "repository",
        name: "modelcontextprotocol/servers",
        description: "Model Context Protocol servers",
        urls: ["https://github.com/modelcontextprotocol/servers"],
        raw_fields: {},
        parsed_fields: {
          repo_url: "https://github.com/modelcontextprotocol/servers",
          stars: 51000,
          license: "MIT",
          last_commit_at: "2026-07-07T12:00:00Z",
          topics: ["mcp", "model-context-protocol"]
        },
        source_confidence: "medium",
        parsed_at: "2026-07-08T00:00:00Z",
        parser_version: "github_topic_parser.v1",
        warnings: []
      }
    ],
    "2026-07-08T00:00:00Z"
  );

  assert.equal(candidates.schema_version, "tool_discovery_candidates.v2");
  assert.deepEqual(candidates.summary, { candidates: 1, pending_production_gate: 1, by_source: { "github-topic-mcp": 1 } });
  assert.deepEqual(candidates.items[0], {
    source_record_id: "github-topic-mcp-modelcontextprotocol-servers-20260708",
    source_id: "github-topic-mcp",
    name: "modelcontextprotocol/servers",
    description: "Model Context Protocol servers",
    repo_url: "https://github.com/modelcontextprotocol/servers",
    stars: 51000,
    license: "MIT",
    last_commit_at: "2026-07-07T12:00:00Z",
    topics: ["mcp", "model-context-protocol"],
    source_confidence: "medium",
    review_status: "pending_production_gate",
    recommended_action: "review_in_production_gate"
  });
});

test("source registry validator rejects enabled sources without review owner", () => {
  const errors = validateSourceRegistry([
    {
      ...githubTopicSource,
      owner: ""
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: enabled source requires owner/);
});

test("source registry validator rejects enabled sources without robots and terms review", () => {
  const errors = validateSourceRegistry([
    {
      ...githubTopicSource,
      access_review: undefined
    }
  ]);

  assert.match(errors.join("\n"), /github-topic-mcp: enabled source requires robots review/);
  assert.match(errors.join("\n"), /github-topic-mcp: enabled source requires terms review/);
});

test("source registry diff records added removed and changed source ids", () => {
  const diff = buildSourceRegistryDiff(
    [
      {
        ...githubTopicSource,
        enabled: false
      },
      {
        ...githubTopicSource,
        id: "removed-source",
        enabled: false
      }
    ],
    [
      {
        ...githubTopicSource,
        enabled: false,
        last_reviewed_at: "2026-07-09T00:00:00Z"
      },
      {
        ...githubTopicSource,
        id: "new-official-source",
        enabled: false
      }
    ],
    "2026-07-08T00:00:00Z"
  );

  assert.equal(diff.schema_version, "source_registry_diff.v1");
  assert.deepEqual(diff.summary, { added: 1, removed: 1, changed: 1 });
  assert.deepEqual(diff.added.map((source) => source.id), ["new-official-source"]);
  assert.deepEqual(diff.removed.map((source) => source.id), ["removed-source"]);
  assert.deepEqual(diff.changed[0]?.changed_fields, ["last_reviewed_at"]);
  assert.deepEqual(diff.changed[0]?.review_requirements, []);
});

test("source registry review artifact tracks pending production gate requirements", () => {
  const diff = buildSourceRegistryDiff(
    [githubTopicSource],
    [
      {
        ...githubTopicSource,
        enabled: true,
        parser: "github_topic_parser",
        trust_level: "official",
        last_reviewed_at: "2026-07-08T00:00:00Z"
      }
    ],
    "2026-07-08T00:00:00Z"
  );

  const pendingReview = buildSourceRegistryReviewArtifact(diff, "2026-07-08T01:00:00Z");

  assert.equal(pendingReview.schema_version, "source_registry_review.v1");
  assert.deepEqual(pendingReview.summary, { total_requirements: 1, confirmed: 0, rejected: 0, needs_changes: 0, pending: 1 });
  assert.equal(pendingReview.items[0]?.source_id, "github-topic-mcp");
  assert.equal(pendingReview.items[0]?.status, "pending");
});

test("source registry review requests provide production gate actions for pending requirements", () => {
  const diff = buildSourceRegistryDiff(
    [githubTopicSource],
    [
      {
        ...githubTopicSource,
        enabled: true,
        parser: "github_topic_parser",
        trust_level: "official",
        last_reviewed_at: "2026-07-08T00:00:00Z"
      }
    ],
    "2026-07-08T00:00:00Z"
  );
  const review = buildSourceRegistryReviewArtifact(diff, "2026-07-08T01:00:00Z");

  const requests = buildSourceRegistryReviewRequests(review, "2026-07-08T01:05:00Z");

  assert.equal(requests.schema_version, "source_registry_review_requests.v1");
  assert.deepEqual(requests.summary, { pending_review: 1, confirmation_required: 1 });
  assert.equal(requests.items[0]?.source_id, "github-topic-mcp");
  assert.equal(requests.items[0]?.field, "trust_level");
  assert.equal(requests.items[0]?.suggested_action, "review_in_production_gate");
});

test("crawler saves immutable raw snapshots without request secrets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const [snapshot] = await crawlEnabledSources({
      sources: [githubTopicSource],
      outputDir,
      now: "2026-07-07T00:00:00Z",
      fetchImpl: (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), null);
        return Promise.resolve(
          new Response(JSON.stringify({ items: [{ full_name: "modelcontextprotocol/servers", html_url: "https://github.com/modelcontextprotocol/servers" }] }), {
            status: 200,
            headers: { "content-type": "application/json", etag: "topic-v1" }
          })
        );
      }
    });

    assert.equal(snapshot?.schema_version, "raw_snapshot.v1");
    assert.equal(snapshot?.source_id, "github-topic-mcp");
    assert.equal(snapshot?.status, "success");
    assert.match(snapshot?.content_hash ?? "", /^sha256:/);
    assert.ok(snapshot?.content_path.endsWith(".json"));
    assert.deepEqual(snapshot?.request_meta, { etag: "topic-v1" });

    const content = await readFile(join(outputDir, snapshot?.content_path ?? ""), "utf8");
    const meta = JSON.parse(await readFile(join(outputDir, `${snapshot?.content_path}.meta.json`), "utf8")) as { request_meta: Record<string, string> };
    assert.match(content, /modelcontextprotocol/);
    assert.equal(JSON.stringify(meta).includes("authorization"), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("crawler fetches GitHub topic sources through public search API without secrets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const [snapshot] = await crawlEnabledSources({
      sources: [githubTopicSource],
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: (url, init) => {
        assert.equal(url, "https://api.github.com/search/repositories?q=topic%3Amcp&sort=stars&order=desc&per_page=20");
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), null);
        assert.equal(headers.get("accept"), "application/vnd.github+json");
        assert.equal(headers.get("user-agent"), "agent-radar-crawler");
        return Promise.resolve(
          new Response(JSON.stringify({ items: [{ full_name: "modelcontextprotocol/servers", html_url: "https://github.com/modelcontextprotocol/servers" }] }), {
            status: 200,
            headers: {
              "content-type": "application/json",
              "x-ratelimit-limit": "60",
              "x-ratelimit-remaining": "59",
              "x-ratelimit-reset": "1783468800"
            }
          })
        );
      }
    });

    assert.equal(snapshot?.schema_version, "raw_snapshot.v1");
    assert.equal(snapshot?.source_id, "github-topic-mcp");
    assert.equal(snapshot?.source_url, "https://api.github.com/search/repositories?q=topic%3Amcp&sort=stars&order=desc&per_page=20");
    assert.equal(snapshot?.fetch_method, "api");
    assert.equal(snapshot?.status, "success");
    assert.deepEqual(snapshot?.request_meta, {
      rate_limit_limit: "60",
      rate_limit_remaining: "59",
      rate_limit_reset: "1783468800"
    });

    const meta = JSON.parse(await readFile(join(outputDir, `${snapshot?.content_path}.meta.json`), "utf8")) as { request_meta: Record<string, string> };
    assert.equal(JSON.stringify(meta).includes("authorization"), false);
    assert.equal(meta.request_meta.rate_limit_remaining, "59");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes a crawl plan for enabled sources", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    assert.equal(result.crawlPlan.schema_version, "source_crawl_plan.v1");
    assert.equal(result.crawlPlan.summary.total, getEnabledSources(sourceRegistry).length);
    assert.equal(result.crawlPlan.summary.disabled, 0);
    assert.equal(result.crawlPlan.items[0]?.source_id, "github-topic-mcp");
    assert.equal(result.crawlPlan.items[0]?.status, "ready");
    assert.equal(result.crawlPlan.items[0]?.parser, "github_topic_parser");
    assert.equal(result.crawlPlan.items[1]?.source_id, "npm-modelcontextprotocol-sdk");
    assert.equal(result.crawlPlan.items[1]?.parser, "npm_package_parser");

    const crawlPlan = JSON.parse(await readFile(join(outputDir, "data", "crawl_plan", "source_crawl_plan.json"), "utf8")) as {
      schema_version: string;
      items: Array<{ source_id: string; status: string }>;
    };
    assert.equal(crawlPlan.schema_version, "source_crawl_plan.v1");
    assert.equal(crawlPlan.items.length, getEnabledSources(sourceRegistry).length);
    assert.equal(crawlPlan.items.every((item) => item.status === "ready"), true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion preserves previous reviewed Source Records when a source crawl fails", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-fallback-"));
  const previousCard = reviewedToolCardFixtures[0];
  const previousRecord = {
    id: "manual-previous-agent-codex",
    schema_version: "source_record.v1" as const,
    snapshot_id: "snapshot-previous",
    source_id: manualTestSource.id,
    record_type: "manual" as const,
    name: previousCard.name,
    description: previousCard.summary,
    urls: previousCard.source_urls,
    raw_fields: previousCard as unknown as Record<string, unknown>,
    parsed_fields: { tool_id: previousCard.id, type: previousCard.type },
    source_confidence: "high" as const,
    parsed_at: "2026-07-09T00:00:00Z",
    parser_version: "manual_seed_parser.v1",
    warnings: [],
  };

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-10T00:00:00Z",
      sources: [{ ...manualTestSource, failure_policy: "skip this source and preserve previous stable data" }],
      previousSourceRecords: [previousRecord],
      fetchImpl: () => Promise.reject(new Error("source unavailable")),
    });

    assert.equal(result.sourceRecords[0]?.id, previousRecord.id);
    assert.equal(result.toolCardDrafts[0]?.id, previousCard.id);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes crawl audit log from snapshots", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      fetchImpl: () =>
        Promise.resolve(new Response(JSON.stringify({ items: [] }), { status: 200, headers: { "content-type": "application/json", etag: "audit-v1" } }))
    });

    assert.equal(result.crawlAudit.schema_version, "crawl_audit.v1");
    assert.equal(result.crawlAudit.summary.success, getEnabledSources(sourceRegistry).length);
    assert.equal(result.crawlAudit.items[0]?.source_id, "github-topic-mcp");
    assert.equal(result.crawlAudit.items[0]?.status, "success");
    assert.equal(result.crawlAudit.items[0]?.fetch_method, "api");
    assert.match(result.crawlAudit.items[0]?.content_hash ?? "", /^sha256:/);
    assert.deepEqual(result.crawlAudit.items[0]?.request_meta, { etag: "audit-v1" });

    const audit = JSON.parse(await readFile(join(outputDir, "data", "crawl_audit", "crawl_audit.json"), "utf8")) as {
      schema_version: string;
      summary: { success: number };
      items: Array<{ source_id: string; status: string }>;
    };
    assert.equal(audit.schema_version, "crawl_audit.v1");
    assert.equal(audit.summary.success, getEnabledSources(sourceRegistry).length);
    assert.equal(audit.items.every((item) => item.status === "success"), true);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion parses manual seed snapshots into source records", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-07T00:00:00Z",
      sources: [manualTestSource],
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "skill-openai-docs",
                name: "OpenAI Docs Skill",
                type: "skill",
                source_urls: ["https://platform.openai.com/docs"]
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.snapshots.length, 1);
    assert.equal(result.sourceRecords.length, 1);
    assert.equal(result.sourceRecords[0]?.schema_version, "source_record.v1");
    assert.equal(result.sourceRecords[0]?.source_id, "manual-agent-radar-seed");
    assert.equal(result.sourceRecords[0]?.record_type, "manual");
    assert.equal(result.sourceRecords[0]?.name, "OpenAI Docs Skill");
    assert.equal(result.sourceRecords[0]?.parsed_fields.type, "skill");
    assert.equal(result.sourceRecords[0]?.source_confidence, "high");

    const recordsJsonl = await readFile(join(outputDir, "data", "source_records", "manual-agent-radar-seed.jsonl"), "utf8");
    assert.match(recordsJsonl, /skill-openai-docs/);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes tool card drafts from complete manual source records", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      sources: [manualTestSource],
      existingToolCards: reviewedToolCardFixtures,
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-codex",
                schema_version: "tool_card.v1",
                name: "Codex",
                type: "agent",
                summary: "A coding agent that can inspect workspaces, edit files, and run tests.",
                source_urls: ["https://developers.openai.com/codex"],
                docs_url: "https://developers.openai.com/codex",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run test suites"],
                not_for: ["unapproved destructive commands"],
                tags: ["coding", "agent"],
                install_methods: [{ method: "hosted", command: "", docs_url: "https://developers.openai.com/codex", confidence: "high" }],
                auth_required: "account",
                permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Works in the user's workspace." }],
                maintenance: {
                  status: "active",
                  issue_activity: "active",
                  maintainer_type: "official",
                  signals: ["official_product"]
                },
                security: {
                  risk_level: "high",
                  trust_level: "official",
                  known_risks: ["filesystem_write"],
                  requires_human_approval: true,
                  security_notes: "Review diffs before accepting changes."
                },
                maturity: "stable",
                evidence_refs: ["manual-review-codex"],
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.toolCardDrafts.length, 1);
    assert.equal(result.reviewQueue.items.length, 1);
    assert.equal(result.reviewQueue.items[0]?.status, "ready_for_review");
    assert.equal(result.reviewQueue.items[0]?.tool_id, "agent-codex");
    assert.deepEqual(result.reviewQueue.items[0]?.duplicate_of_tool_ids, ["agent-codex"]);
    assert.equal(result.interventionRequests.schema_version, "tool_card_intervention_requests.v1");
    assert.equal(result.interventionRequests.summary.pending_intervention, 1);
    assert.equal(result.interventionRequests.items[0]?.tool_id, "agent-codex");
    assert.equal(result.interventionRequests.items[0]?.source_record_id, "manual-agent-radar-seed-agent-codex-20260708");
    assert.deepEqual(result.interventionRequests.items[0]?.duplicate_of_tool_ids, ["agent-codex"]);
    assert.equal(result.interventionRequests.items[0]?.suggested_action, "resolve_before_release");
    assert.equal(result.fieldProvenance.schema_version, "tool_card_field_value_provenance.v1");
    assert.equal(result.fieldProvenance.summary.tool_cards, 1);
    assert.ok(result.fieldProvenance.summary.field_values >= 3);
    assert.equal(result.normalizationEvidence.schema_version, "tool_card_normalization_evidence.v1");
    assert.equal(
      result.normalizationEvidence.field_selections.find((item) => item.tool_card_field === "summary")?.tool_id,
      "agent-codex",
    );
    assert.equal(result.fieldProvenanceV2.schema_version, "tool_card_field_value_provenance.v2");
    assert.equal(result.fieldProvenanceV2.summary.critical_coverage, 1);
    assert.equal(result.conflictReport.schema_version, "tool_card_conflict_report.v1");
    assert.deepEqual(
      result.fieldProvenance.items.find((item) => item.tool_card_field === "summary"),
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        tool_card_field: "summary",
        source_field_path: "raw_fields.summary",
        source_value_preview: "A coding agent that can inspect workspaces, edit files, and run tests.",
        normalized_value_preview: "A coding agent that can inspect workspaces, edit files, and run tests.",
        provenance_type: "source_record"
      }
    );
    assert.equal(result.toolCardDrafts[0]?.id, "agent-codex");
    assert.deepEqual(result.toolCardDrafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708"]);

    const draftsJsonl = await readFile(join(outputDir, "data", "tool_card_drafts", "manual-agent-radar-seed.jsonl"), "utf8");
    assert.match(draftsJsonl, /"id":"agent-codex"/);
    assert.match(draftsJsonl, /manual-agent-radar-seed-agent-codex-20260708/);

    const reviewQueue = JSON.parse(await readFile(join(outputDir, "data", "review_queue", "tool_card_drafts.json"), "utf8"));
    assert.equal(reviewQueue.schema_version, "tool_card_review_queue.v1");
    assert.equal(reviewQueue.summary.ready_for_review, 1);
    assert.equal(reviewQueue.items[0].source_record_id, "manual-agent-radar-seed-agent-codex-20260708");

    const duplicateReport = JSON.parse(await readFile(join(outputDir, "data", "dedup", "tool_card_duplicates.json"), "utf8"));
    assert.equal(duplicateReport.schema_version, "tool_card_duplicate_report.v1");
    assert.equal(duplicateReport.summary.possible_duplicates, 1);
    assert.deepEqual(duplicateReport.items[0].duplicate_of_tool_ids, ["agent-codex"]);

    const interventionRequests = JSON.parse(await readFile(join(outputDir, "data", "intervention_requests", "tool_card_drafts.json"), "utf8")) as {
      schema_version: string;
      summary: { pending_intervention: number };
      items: Array<{ tool_id: string; target_id: string; suggested_action: string }>;
    };
    assert.equal(interventionRequests.schema_version, "tool_card_intervention_requests.v1");
    assert.equal(interventionRequests.summary.pending_intervention, 1);
    assert.equal(interventionRequests.items[0]?.target_id, "agent-codex");

    const interventionText = await readFile(join(outputDir, "data", "intervention_requests", "tool_card_drafts.jsonl"), "utf8");
    assert.equal(interventionText.endsWith("\n"), true);
    const interventionLines = interventionText
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { target_id: string; suggested_action: string; duplicate_of_tool_ids: string[] });
    assert.deepEqual(interventionLines, [
      {
        id: "intervention-agent-codex-manual-agent-radar-seed-agent-codex-20260708",
        schema_version: "tool_card_intervention_request.v1",
        tool_id: "agent-codex",
        name: "Codex",
        source_id: "manual-agent-radar-seed",
        target_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        review_status: "ready_for_review",
        suggested_action: "resolve_before_release",
        duplicate_of_tool_ids: ["agent-codex"],
        duplicate_of_draft_tool_ids: [],
        validation_errors: [],
        validation_warnings: [
          "agent-codex: permissions lacks field-level evidence ref",
          "agent-codex: security lacks field-level evidence ref",
          "agent-codex: maintenance lacks field-level evidence ref"
        ]
      }
    ]);

    const fieldProvenance = JSON.parse(await readFile(join(outputDir, "data", "field_provenance", "tool_card_fields.json"), "utf8")) as {
      schema_version: string;
      summary: { tool_cards: number; field_values: number };
      items: Array<{ tool_id: string; tool_card_field: string; source_value_preview: string }>;
    };
    assert.equal(fieldProvenance.schema_version, "tool_card_field_value_provenance.v1");
    assert.equal(fieldProvenance.summary.tool_cards, 1);
    assert.ok(fieldProvenance.summary.field_values >= 3);
    assert.equal(fieldProvenance.items.find((item) => item.tool_card_field === "summary")?.source_value_preview, "A coding agent that can inspect workspaces, edit files, and run tests.");

    const fieldProvenanceV2 = JSON.parse(
      await readFile(join(outputDir, "data", "field_provenance", "tool_card_fields.v2.json"), "utf8"),
    );
    assert.equal(fieldProvenanceV2.schema_version, "tool_card_field_value_provenance.v2");
    assert.equal(fieldProvenanceV2.summary.critical_coverage, 1);

    const conflictReport = JSON.parse(
      await readFile(join(outputDir, "data", "conflicts", "tool_card_conflicts.json"), "utf8"),
    );
    assert.equal(conflictReport.schema_version, "tool_card_conflict_report.v1");
    assert.equal(conflictReport.summary.unresolved_critical, 0);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion applies override records to draft normalization artifacts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      sources: [manualTestSource],
      overrideRecords: [
        {
          id: "override-agent-codex-summary-20260708",
          schema_version: "override_record.v1",
          target_type: "tool_card",
          target_id: "agent-codex",
          field: "summary",
          new_value: "Override summary for review queue.",
          reason: "Manual correction before review.",
          evidence_urls: ["https://developers.openai.com/codex"],
          created_by: "maintainer",
          created_at: "2026-07-08T12:00:00Z"
        }
      ],
      approvalRecords: [
        {
          id: "approval-agent-codex-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-codex",
          source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
          decision: "approved",
          reason: "Reviewed draft and override evidence.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        }
      ],
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-codex",
                schema_version: "tool_card.v1",
                name: "Codex",
                type: "agent",
                summary: "Original summary.",
                source_urls: ["https://developers.openai.com/codex"],
                docs_url: "https://developers.openai.com/codex",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run test suites"],
                not_for: ["unapproved destructive commands"],
                tags: ["coding", "agent"],
                install_methods: [{ method: "hosted", command: "", docs_url: "https://developers.openai.com/codex", confidence: "high" }],
                auth_required: "account",
                permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Works in the user's workspace." }],
                maintenance: {
                  status: "active",
                  issue_activity: "active",
                  maintainer_type: "official",
                  signals: ["official_product"]
                },
                security: {
                  risk_level: "high",
                  trust_level: "official",
                  known_risks: ["filesystem_write"],
                  requires_human_approval: true,
                  security_notes: "Review diffs before accepting changes."
                },
                maturity: "stable",
                evidence_refs: ["manual-review-codex"],
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.toolCardDrafts[0]?.summary, "Override summary for review queue.");
    assert.deepEqual(result.toolCardDrafts[0]?.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708", "override-agent-codex-summary-20260708"]);
    assert.deepEqual(
      result.fieldProvenance.items.find((item) => item.provenance_type === "override_record" && item.tool_card_field === "summary"),
      {
        tool_id: "agent-codex",
        source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
        tool_card_field: "summary",
        source_field_path: "override_records.override-agent-codex-summary-20260708.new_value",
        source_value_preview: "Override summary for review queue.",
        normalized_value_preview: "Override summary for review queue.",
        provenance_type: "override_record",
        override_record_id: "override-agent-codex-summary-20260708"
      }
    );
    assert.equal(result.overrideRecords.length, 1);
    assert.equal(result.approvalArtifact.summary.approved, 1);
    assert.deepEqual(result.reviewQueue.items[0]?.approval, {
      decision: "approved",
      reviewer: "maintainer",
      reviewed_at: "2026-07-08T13:00:00Z",
      reason: "Reviewed draft and override evidence."
    });

    const overrides = JSON.parse(await readFile(join(outputDir, "data", "overrides", "override_records.json"), "utf8")) as { records: Array<{ id: string }> };
    assert.equal(overrides.records[0]?.id, "override-agent-codex-summary-20260708");
    const draftLines = (await readFile(join(outputDir, "data", "tool_card_drafts", "manual-agent-radar-seed.jsonl"), "utf8")).trim().split("\n");
    const draft = JSON.parse(draftLines[0] ?? "{}") as { evidence_refs?: string[] };
    assert.deepEqual(draft.evidence_refs, ["manual-agent-radar-seed-agent-codex-20260708", "override-agent-codex-summary-20260708"]);
    const approvals = JSON.parse(await readFile(join(outputDir, "data", "approvals", "approval_records.json"), "utf8")) as { summary: { approved: number } };
    assert.equal(approvals.summary.approved, 1);
    const reviewQueue = JSON.parse(await readFile(join(outputDir, "data", "review_queue", "tool_card_drafts.json"), "utf8")) as {
      items: Array<{ approval?: { decision: string } }>;
    };
    assert.equal(reviewQueue.items[0]?.approval?.decision, "approved");
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion writes release admission for approved non-duplicate drafts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      sources: [manualTestSource],
      existingToolCards: [],
      approvalRecords: [
        {
          id: "approval-agent-new-tool-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-new-tool",
          source_record_id: "manual-agent-radar-seed-agent-new-tool-20260708",
          decision: "approved",
          reason: "Reviewed new draft for release admission.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        }
      ],
      fetchImpl: () =>
        Promise.resolve(new Response(
          JSON.stringify({
            tools: [
              {
                id: "agent-new-tool",
                schema_version: "tool_card.v1",
                name: "New Tool",
                type: "agent",
                summary: "A newly reviewed coding agent draft.",
                source_urls: ["https://example.com/new-tool", "https://example.com/new-tool/docs"],
                docs_url: "https://example.com/new-tool/docs",
                primary_purpose: "coding_agent",
                use_cases: ["modify code", "run tests"],
                not_for: ["unreviewed destructive commands"],
                tags: ["coding", "agent"],
                install_methods: [{ method: "hosted", command: "", docs_url: "https://example.com/new-tool/docs", confidence: "high" }],
                auth_required: "account",
                permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Works in the user's workspace." }],
                maintenance: {
                  status: "active",
                  issue_activity: "active",
                  maintainer_type: "official",
                  signals: ["official_product"]
                },
                security: {
                  risk_level: "high",
                  trust_level: "official",
                  known_risks: ["filesystem_write"],
                  requires_human_approval: true,
                  security_notes: "Review diffs before accepting changes."
                },
                maturity: "stable",
                evidence_refs: ["manual-review-new-tool"],
                last_checked_at: "2026-07-08T00:00:00Z",
                confidence: "high",
                created_at: "2026-07-08T00:00:00Z",
                updated_at: "2026-07-08T00:00:00Z"
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        ))
    });

    assert.equal(result.releaseAdmission.summary.eligible_for_publish, 1);
    assert.equal(result.releaseAdmission.items[0]?.status, "eligible_for_publish");
    assert.deepEqual(result.releaseAdmission.items[0]?.blocking_reasons, []);
    assert.equal(result.promotionCandidates.schema_version, "tool_card_promotion_candidates.v1");
    assert.equal(result.promotionCandidates.summary.candidates, 1);
    assert.equal(result.promotionCandidates.items[0]?.tool_id, "agent-new-tool");
    assert.equal(result.promotionCandidates.items[0]?.review.gate, "approval_override");
    assert.equal(result.promotionCandidates.items[0]?.review.reviewed_by, "maintainer");
    assert.equal(result.promotionCandidates.items[0]?.draft.id, "agent-new-tool");
    assert.equal(result.promotionPlan.schema_version, "tool_card_promotion_plan.v1");
    assert.deepEqual(result.promotionPlan.summary, { candidates: 1, reliable_publish_ready: true });
    assert.equal(result.promotionPlan.items[0]?.tool_id, "agent-new-tool");
    assert.equal(result.promotionPlan.items[0]?.target_artifact, "public/data/tool_cards.jsonl");
    assert.equal(result.promotionPlan.items[0]?.recommended_action, "publish_via_reliable_pipeline");
    assert.equal(result.promotionCheck.schema_version, "tool_card_promotion_check.v1");
    assert.equal(result.promotionCheck.passed, true);
    assert.deepEqual(result.promotionCheck.summary, {
      candidates: 1,
      ready_for_publish: 1,
      blocked: 0,
      duplicate_tool_ids: 0,
      validation_errors: 0,
      validation_warnings: 3
    });

    const admission = JSON.parse(await readFile(join(outputDir, "data", "release_admission", "tool_card_drafts.json"), "utf8")) as {
      schema_version: string;
      items: Array<{ tool_id: string; status: string }>;
    };
    assert.equal(admission.schema_version, "tool_card_release_admission.v1");
    assert.equal(admission.items[0]?.tool_id, "agent-new-tool");
    assert.equal(admission.items[0]?.status, "eligible_for_publish");
    const promotionCandidates = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "tool_cards.json"), "utf8")) as {
      schema_version: string;
      summary: { candidates: number };
      items: Array<{ tool_id: string; draft: { id: string } }>;
    };
    assert.equal(promotionCandidates.schema_version, "tool_card_promotion_candidates.v1");
    assert.equal(promotionCandidates.summary.candidates, 1);
    assert.equal(promotionCandidates.items[0]?.draft.id, "agent-new-tool");
    const promotionPlan = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "promotion_plan.json"), "utf8")) as {
      schema_version: string;
      summary: { candidates: number; reliable_publish_ready: boolean };
      items: Array<{ tool_id: string; target_artifact: string; candidate_artifact_path: string }>;
    };
    assert.equal(promotionPlan.schema_version, "tool_card_promotion_plan.v1");
    assert.deepEqual(promotionPlan.summary, { candidates: 1, reliable_publish_ready: true });
    assert.equal(promotionPlan.items[0]?.tool_id, "agent-new-tool");
    assert.equal(promotionPlan.items[0]?.target_artifact, "public/data/tool_cards.jsonl");
    assert.equal(promotionPlan.items[0]?.candidate_artifact_path, "data/promotion_candidates/tool_cards.json");

    const promotionCheck = JSON.parse(await readFile(join(outputDir, "data", "promotion_candidates", "promotion_check.json"), "utf8")) as {
      schema_version: string;
      passed: boolean;
      summary: { ready_for_publish: number; validation_warnings: number };
    };
    assert.equal(promotionCheck.schema_version, "tool_card_promotion_check.v1");
    assert.equal(promotionCheck.passed, true);
    assert.equal(promotionCheck.summary.ready_for_publish, 1);
    assert.equal(promotionCheck.summary.validation_warnings, 3);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("ingestion promotes low risk GitHub repository drafts through auto review", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      existingToolCards: [],
      sources: [githubTopicSource],
      fetchImpl: (url) => {
        const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
        if (requestUrl.startsWith("internal://")) {
          return Promise.resolve(new Response(JSON.stringify({ tools: [] }), { status: 200, headers: { "content-type": "application/json" } }));
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  full_name: "modelcontextprotocol/servers",
                  name: "servers",
                  html_url: "https://github.com/modelcontextprotocol/servers",
                  description: "Model Context Protocol servers and reference implementations.",
                  stargazers_count: 51000,
                  license: { spdx_id: "MIT" },
                  pushed_at: "2026-07-07T12:00:00Z",
                  topics: ["mcp", "model-context-protocol"]
                }
              ]
            }),
            { status: 200, headers: { "content-type": "application/json" } }
          )
        );
      }
    });

    assert.equal(result.sourceRecords.length, 1);
    assert.equal(result.toolCardDrafts.length, 1);
    assert.equal(result.toolCardDrafts[0]?.id, "mcp-modelcontextprotocol-servers");
    assert.equal(result.toolCardDrafts[0]?.repo_url, "https://github.com/modelcontextprotocol/servers");
    assert.equal(result.toolCardDrafts[0]?.type, "mcp");
    assert.equal(result.reviewQueue.items[0]?.status, "ready_for_review");
    assert.equal(result.autoReview.schema_version, "tool_card_auto_review.v1");
    assert.equal(result.autoReview.items[0]?.suggested_action, "promote");
    assert.deepEqual(result.autoReview.items[0]?.human_review_reasons, []);
    assert.equal(result.releaseAdmission.items[0]?.gate, "auto_review");
    assert.equal(result.releaseAdmission.summary.eligible_for_publish, 1);
    assert.equal(result.promotionCandidates.summary.candidates, 1);
    assert.equal(result.promotionCandidates.items[0]?.review.gate, "auto_review");
    assert.equal(result.promotionCandidates.items[0]?.review.reviewed_by, "agent-radar-auto-review");

    const autoReview = JSON.parse(await readFile(join(outputDir, "data", "auto_review", "tool_card_drafts.json"), "utf8")) as {
      schema_version: string;
      items: Array<{ tool_id: string; suggested_action: string }>;
    };
    assert.equal(autoReview.schema_version, "tool_card_auto_review.v1");
    assert.deepEqual(autoReview.items.map((item) => [item.tool_id, item.suggested_action]), [["mcp-modelcontextprotocol-servers", "promote"]]);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("release admission blocks approved drafts that duplicate other incoming drafts", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));
  const base = reviewedToolCardFixtures.find((card) => card.id === "agent-codex");
  assert.ok(base);

  try {
    const alpha = {
      ...base,
      id: "agent-alpha",
      name: "Agent Alpha",
      evidence_refs: ["manual-review-alpha"]
    };
    const beta = {
      ...base,
      id: "agent-beta",
      name: "Agent Beta",
      evidence_refs: ["manual-review-beta"]
    };

    const result = await runIngestion({
      outputDir,
      now: "2026-07-08T00:00:00Z",
      sources: [manualTestSource],
      existingToolCards: [],
      approvalRecords: [
        {
          id: "approval-agent-alpha-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-alpha",
          source_record_id: "manual-agent-radar-seed-agent-alpha-20260708",
          decision: "approved",
          reason: "Reviewed alpha.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:00:00Z"
        },
        {
          id: "approval-agent-beta-20260708",
          schema_version: "approval_record.v1",
          target_type: "tool_card_draft",
          target_id: "agent-beta",
          source_record_id: "manual-agent-radar-seed-agent-beta-20260708",
          decision: "approved",
          reason: "Reviewed beta.",
          reviewer: "maintainer",
          reviewed_at: "2026-07-08T13:05:00Z"
        }
      ],
      fetchImpl: () => Promise.resolve(new Response(JSON.stringify({ tools: [alpha, beta] }), { status: 200, headers: { "content-type": "application/json" } }))
    });

    assert.deepEqual(result.reviewQueue.items.map((item) => item.duplicate_of_draft_tool_ids), [["agent-beta"], ["agent-alpha"]]);
    assert.equal(result.releaseAdmission.summary.eligible_for_publish, 0);
    assert.equal(result.releaseAdmission.summary.blocked, 2);
    assert.deepEqual(result.releaseAdmission.items.map((item) => item.blocking_reasons), [["possible_duplicate"], ["possible_duplicate"]]);
    assert.equal(result.promotionCandidates.summary.candidates, 0);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
