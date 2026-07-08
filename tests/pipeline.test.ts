import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildArtifacts } from "../src/pipeline/build-artifacts.js";

interface EvalSummaryFile {
  results: Array<{ failures: string[] }>;
}

test("builds MVP data artifacts and an eval report", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));
  const originalApiKey = process.env.AGENT_RADAR_LLM_API_KEY;
  const originalModel = process.env.AGENT_RADAR_LLM_MODEL;

  try {
    delete process.env.AGENT_RADAR_LLM_API_KEY;
    delete process.env.AGENT_RADAR_LLM_MODEL;

    const summary = await buildArtifacts({ outputDir });

    assert.equal(summary.toolCount >= 5, true);
    assert.equal(summary.goldenQueriesPassed, 0);
    assert.equal(summary.goldenQueriesTotal > 0, true);

    const manifest = JSON.parse(await readFile(join(outputDir, "data", "manifest.json"), "utf8"));
    assert.equal(manifest.rules_versions.rating, "rating_rules.v0.1-draft");
    assert.equal(manifest.schema_versions.tool_card, "tool_card.v1");
    assert.equal(manifest.schema_versions.source_registry, "source_registry.v1");
    assert.equal(manifest.source_registry, "data/source_registry.json");

    const sourceRegistry = JSON.parse(await readFile(join(outputDir, "data", "source_registry.json"), "utf8"));
    assert.equal(sourceRegistry.schema_version, "source_registry.v1");
    assert.equal(sourceRegistry.sources.length >= 2, true);
    assert.equal(sourceRegistry.validation.passed, true);
    assert.deepEqual(sourceRegistry.validation.errors, []);

    const searchIndex = JSON.parse(await readFile(join(outputDir, "data", "search_index.json"), "utf8"));
    assert.ok(searchIndex.documents.length >= 5);

    const evalSummary = JSON.parse(await readFile(join(outputDir, "data", "eval_summary.json"), "utf8")) as EvalSummaryFile;
    assert.match(evalSummary.results[0].failures[0], /AGENT_RADAR_LLM_API_KEY/);

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
