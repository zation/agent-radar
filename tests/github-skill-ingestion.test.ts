import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import type { SourceDefinition } from "../src/schema.js";

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
