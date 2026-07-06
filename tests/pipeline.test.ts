import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { buildArtifacts } from "../src/pipeline/build-artifacts.js";

test("builds MVP data artifacts and an eval report", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-"));

  try {
    const summary = await buildArtifacts({ outputDir });

    assert.equal(summary.toolCount >= 5, true);
    assert.equal(summary.goldenQueriesPassed, summary.goldenQueriesTotal);

    const manifest = JSON.parse(await readFile(join(outputDir, "data", "manifest.json"), "utf8"));
    assert.equal(manifest.rules_versions.rating, "rating_rules.v0.1-draft");
    assert.equal(manifest.schema_versions.tool_card, "tool_card.v1");

    const searchIndex = JSON.parse(await readFile(join(outputDir, "data", "search_index.json"), "utf8"));
    assert.ok(searchIndex.documents.length >= 5);
  } finally {
    await rm(outputDir, { recursive: true, force: true });
  }
});
