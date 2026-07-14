import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import { parseSourceSnapshots } from "../src/ingestion/parser.js";
import { runIngestion } from "../src/ingestion/run.js";
import type { SourceDefinition, SourceRecord } from "../src/schema.js";

const fixtureRoot = join(process.cwd(), "tests", "fixtures", "github-skills");

const skillSource: SourceDefinition = {
  id: "github-topic-agent-skills",
  name: "GitHub topic agent-skills",
  url: "https://github.com/topics/agent-skills",
  source_type: "github",
  covered_tool_types: ["skill"],
  collection_method: "api",
  recommended_frequency: "weekly",
  trust_level: "active_open_source",
  field_coverage: ["name", "description", "repo_url", "skill_manifest"],
  terms_notes: "Public GitHub metadata and raw Skill manifests only.",
  parser: "github_skill_topic_parser",
  github_discovery: {
    query: "topic:agent-skills",
    sort: "stars",
    order: "desc",
    repository_limit: 2,
    expansion: { kind: "skill_manifests", root: "skills/", manifest: "SKILL.md" },
  },
  failure_policy: "keep successful records from the current crawl only",
  enabled: true,
  owner: "agent-radar",
  last_reviewed_at: "2026-07-14T00:00:00Z",
};

test("crawler expands the top two agent-skills repositories into root manifests", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-crawl-"));
  const search = JSON.parse(await readFile(join(fixtureRoot, "topic-search.json"), "utf8")) as Record<string, unknown>;
  const pdf = await readFile(join(fixtureRoot, "pdf-SKILL.md"), "utf8");
  const ponytail = await readFile(join(fixtureRoot, "ponytail-SKILL.md"), "utf8");
  const anthropicsTree = withManifestSha(await readJson("anthropics-tree.json"), "skills/pdf/SKILL.md", pdf);
  const ponytailTree = withManifestSha(await readJson("ponytail-tree.json"), "skills/ponytail/SKILL.md", ponytail);
  const requestedUrls: string[] = [];

  try {
    const snapshots = await crawlEnabledSources({
      sources: [skillSource],
      outputDir,
      now: "2026-07-14T00:00:00Z",
      fetchImpl: (input) => {
        const url = requestUrl(input);
        requestedUrls.push(url);
        if (url.includes("/search/repositories")) return jsonResponse(search);
        if (url.includes("/anthropics/skills/git/trees/main")) return jsonResponse(anthropicsTree);
        if (url.includes("/DietrichGebert/ponytail/git/trees/main")) return jsonResponse(ponytailTree);
        if (url.includes("/anthropics/skills/main/skills/pdf/SKILL.md")) return textResponse(pdf);
        if (url.includes("/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md")) return textResponse(ponytail);
        return Promise.resolve(new Response("not found", { status: 404 }));
      },
    });

    assert.deepEqual(requestedUrls, [
      "https://api.github.com/search/repositories?q=topic%3Aagent-skills&sort=stars&order=desc&per_page=2",
      "https://api.github.com/repos/anthropics/skills/git/trees/main?recursive=1",
      "https://raw.githubusercontent.com/anthropics/skills/main/skills/pdf/SKILL.md",
      "https://api.github.com/repos/DietrichGebert/ponytail/git/trees/main?recursive=1",
      "https://raw.githubusercontent.com/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md",
    ]);
    assert.deepEqual(snapshots.map((item) => item.request_meta?.snapshot_role), ["search", "tree", "skill_manifest", "tree", "skill_manifest"]);
    assert.deepEqual(snapshots.filter((item) => item.request_meta?.snapshot_role === "skill_manifest").map((item) => item.request_meta?.skill_path), [
      "skills/pdf/SKILL.md",
      "skills/ponytail/SKILL.md",
    ]);
    assert.ok(snapshots.filter((item) => item.request_meta?.snapshot_role === "skill_manifest").every((item) => item.status === "success"));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("crawler keeps successful repository manifests when the sibling tree fails", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-partial-"));
  const search = JSON.parse(await readFile(join(fixtureRoot, "topic-search.json"), "utf8")) as Record<string, unknown>;
  const pdf = await readFile(join(fixtureRoot, "pdf-SKILL.md"), "utf8");
  const anthropicsTree = withManifestSha(await readJson("anthropics-tree.json"), "skills/pdf/SKILL.md", pdf);
  const requestedUrls: string[] = [];

  try {
    const snapshots = await crawlEnabledSources({
      sources: [skillSource],
      outputDir,
      now: "2026-07-14T00:00:00Z",
      fetchImpl: (input) => {
        const url = requestUrl(input);
        requestedUrls.push(url);
        if (url.includes("/search/repositories")) return jsonResponse(search);
        if (url.includes("/anthropics/skills/git/trees/main")) return jsonResponse(anthropicsTree);
        if (url.includes("/anthropics/skills/main/skills/pdf/SKILL.md")) return textResponse(pdf);
        if (url.includes("/DietrichGebert/ponytail/git/trees/main")) return Promise.resolve(new Response("unavailable", { status: 503 }));
        return Promise.resolve(new Response("not found", { status: 404 }));
      },
    });

    assert.equal(snapshots.some((item) => item.request_meta?.repository === "anthropics/skills" && item.request_meta?.snapshot_role === "skill_manifest" && item.status === "success"), true);
    assert.equal(snapshots.some((item) => item.request_meta?.repository === "DietrichGebert/ponytail" && item.request_meta?.snapshot_role === "tree" && item.status === "failed"), true);
    assert.equal(requestedUrls.some((url) => url.includes("raw.githubusercontent.com/DietrichGebert/ponytail")), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("grouped parser creates one independent Source Record per successful manifest", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-parse-"));
  const search = JSON.parse(await readFile(join(fixtureRoot, "topic-search.json"), "utf8")) as Record<string, unknown>;
  const pdf = await readFile(join(fixtureRoot, "pdf-SKILL.md"), "utf8");
  const ponytail = await readFile(join(fixtureRoot, "ponytail-SKILL.md"), "utf8");
  const malformed = await readFile(join(fixtureRoot, "malformed-SKILL.md"), "utf8");
  const anthropicsBaseTree = withManifestSha(await readJson("anthropics-tree.json"), "skills/pdf/SKILL.md", pdf);
  const anthropicsTree = {
    ...anthropicsBaseTree,
    tree: [
      ...anthropicsBaseTree.tree,
      { path: "skills/malformed/SKILL.md", mode: "100644", type: "blob", sha: gitBlobSha(malformed) },
    ],
  };
  const ponytailTree = withManifestSha(await readJson("ponytail-tree.json"), "skills/ponytail/SKILL.md", ponytail);

  try {
    const snapshots = await crawlEnabledSources({
      sources: [skillSource],
      outputDir,
      now: "2026-07-14T00:00:00Z",
      fetchImpl: fixtureFetch(search, anthropicsTree, ponytailTree, pdf, ponytail, malformed),
    });
    const records = await parseSourceSnapshots(snapshots, skillSource, outputDir, "2026-07-14T00:00:00Z");
    assert.deepEqual(records.map((record) => record.parsed_fields.skill_manifest_path), [
      "skills/pdf/SKILL.md",
      "skills/ponytail/SKILL.md",
    ]);
    assert.deepEqual(records.map((record) => record.parsed_fields.tool_id), [
      "skill-anthropics-skills-pdf",
      "skill-dietrichgebert-ponytail-ponytail",
    ]);
    assert.ok(records.every((record) => record.parser_version === "github_skill_topic_parser.v1"));
    assert.ok(records.every((record) => record.parsed_fields.canonical_identity !== record.parsed_fields.repo_url));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("grouped parser preserves the current 17 plus 6 one-manifest-per-card shape", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-shape-"));
  const manifest = "---\nname: Example Skill\ndescription: Use this skill when testing grouped ingestion with Python.\n---\n## Steps\n1. Inspect the input.\n";
  const repositories = [
    { full_name: "anthropics/skills", name: "skills", html_url: "https://github.com/anthropics/skills", default_branch: "main", stargazers_count: 100 },
    { full_name: "example/skill-pack", name: "skill-pack", html_url: "https://github.com/example/skill-pack", default_branch: "main", stargazers_count: 50 },
  ];
  const pathsByRepository = new Map([
    ["anthropics/skills", Array.from({ length: 17 }, (_, index) => `skills/skill-${index + 1}/SKILL.md`)],
    ["example/skill-pack", Array.from({ length: 6 }, (_, index) => `skills/skill-${index + 18}/SKILL.md`)],
  ]);

  try {
    const snapshots = await crawlEnabledSources({
      sources: [skillSource],
      outputDir,
      now: "2026-07-14T00:00:00Z",
      fetchImpl: (input) => {
        const url = requestUrl(input);
        if (url.includes("/search/repositories")) return jsonResponse({ items: repositories });
        for (const repository of repositories) {
          if (url.includes(`/repos/${repository.full_name}/git/trees/main`)) {
            return jsonResponse({
              truncated: false,
              tree: pathsByRepository.get(repository.full_name)!.map((path) => ({ path, mode: "100644", type: "blob", sha: gitBlobSha(manifest) })),
            });
          }
          if (url.includes(`/${repository.full_name}/main/skills/`)) return textResponse(manifest);
        }
        return Promise.resolve(new Response("not found", { status: 404 }));
      },
    });
    const records = await parseSourceSnapshots(snapshots, skillSource, outputDir, "2026-07-14T00:00:00Z");

    assert.equal(records.length, 23);
    assert.equal(new Set(records.map((record) => record.parsed_fields.canonical_identity)).size, 23);
    assert.equal(new Set(records.map((record) => record.parsed_fields.tool_id)).size, 23);
    assert.ok(records.every((record) => (
      record.parsed_fields.generated_tool_profile as { permissions: Array<{ scope: string }> }
    ).permissions.some((permission) => permission.scope === "code_execution")));
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

test("runIngestion parses the source as one group and does not restore a failed old Skill", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-run-"));
  const search = JSON.parse(await readFile(join(fixtureRoot, "topic-search.json"), "utf8")) as Record<string, unknown>;
  const pdf = await readFile(join(fixtureRoot, "pdf-SKILL.md"), "utf8");
  const ponytail = await readFile(join(fixtureRoot, "ponytail-SKILL.md"), "utf8");
  const anthropicsTree = withManifestSha(await readJson("anthropics-tree.json"), "skills/pdf/SKILL.md", pdf);
  const ponytailTree = withManifestSha(await readJson("ponytail-tree.json"), "skills/ponytail/SKILL.md", ponytail);
  const previous = {
    id: "old-failed-skill",
    schema_version: "source_record.v1",
    snapshot_id: "old-snapshot",
    source_id: skillSource.id,
    record_type: "repository",
    name: "Old failed Skill",
    urls: ["https://github.com/example/old/blob/main/skills/old/SKILL.md"],
    raw_fields: {},
    parsed_fields: { tool_id: "skill-old-failed" },
    source_confidence: "medium",
    parsed_at: "2026-07-07T00:00:00Z",
    parser_version: "github_skill_topic_parser.v1",
    warnings: [],
  } satisfies SourceRecord;

  try {
    const result = await runIngestion({
      sources: [skillSource],
      outputDir,
      now: "2026-07-14T00:00:00Z",
      previousSourceRecords: [previous],
      fetchImpl: (input) => {
        const url = requestUrl(input);
        if (url.includes("/search/repositories")) return jsonResponse(search);
        if (url.includes("/anthropics/skills/git/trees/main")) return jsonResponse(anthropicsTree);
        if (url.includes("/DietrichGebert/ponytail/git/trees/main")) return jsonResponse(ponytailTree);
        if (url.includes("/anthropics/skills/main/skills/pdf/SKILL.md")) return textResponse(pdf);
        if (url.includes("/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md")) return Promise.resolve(new Response("unavailable", { status: 503 }));
        return Promise.resolve(new Response("not found", { status: 404 }));
      },
    });

    assert.deepEqual(result.sourceRecords.map((record) => record.parsed_fields.tool_id), ["skill-anthropics-skills-pdf"]);
    assert.deepEqual(result.toolCardDrafts.map((card) => card.id), ["skill-anthropics-skills-pdf"]);
    assert.equal(result.toolCardDrafts[0]?.docs_url, "https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md");
    assert.equal(result.sourceRecords.some((record) => record.id === previous.id), false);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});

async function readJson(name: string): Promise<{ tree: Array<{ path: string; mode: string; type: string; sha: string }>; truncated: boolean }> {
  return JSON.parse(await readFile(join(fixtureRoot, name), "utf8")) as { tree: Array<{ path: string; mode: string; type: string; sha: string }>; truncated: boolean };
}

function withManifestSha(tree: { tree: Array<{ path: string; sha: string }> }, path: string, content: string) {
  return {
    ...tree,
    tree: tree.tree.map((item) => item.path === path ? { ...item, sha: gitBlobSha(content) } : item),
  };
}

function gitBlobSha(content: string): string {
  const bytes = Buffer.from(content, "utf8");
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex");
}

function requestUrl(input: string | URL | Request): string {
  return typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
}

function jsonResponse(value: unknown): Promise<Response> {
  return Promise.resolve(new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } }));
}

function textResponse(value: string): Promise<Response> {
  return Promise.resolve(new Response(value, { status: 200, headers: { "content-type": "text/markdown" } }));
}

function fixtureFetch(
  search: Record<string, unknown>,
  anthropicsTree: unknown,
  ponytailTree: unknown,
  pdf: string,
  ponytail: string,
  malformed: string,
): typeof fetch {
  return (input) => {
    const url = requestUrl(input);
    if (url.includes("/search/repositories")) return jsonResponse(search);
    if (url.includes("/anthropics/skills/git/trees/main")) return jsonResponse(anthropicsTree);
    if (url.includes("/DietrichGebert/ponytail/git/trees/main")) return jsonResponse(ponytailTree);
    if (url.includes("/anthropics/skills/main/skills/pdf/SKILL.md")) return textResponse(pdf);
    if (url.includes("/anthropics/skills/main/skills/malformed/SKILL.md")) return textResponse(malformed);
    if (url.includes("/DietrichGebert/ponytail/main/skills/ponytail/SKILL.md")) return textResponse(ponytail);
    return Promise.resolve(new Response("not found", { status: 404 }));
  };
}
