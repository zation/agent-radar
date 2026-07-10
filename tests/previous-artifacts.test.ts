import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadPreviousReleaseArtifacts } from "../src/pipeline/previous-artifacts.js";

test("previous release artifacts load only from explicit or restored reviewed paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-radar-previous-"));
  const urlPath = join(root, "url.json");
  const qualityPath = join(root, "quality.json");
  const sourcePath = join(root, "sources.json");
  try {
    await writeFile(urlPath, JSON.stringify({ schema_version: "tool_card_url_validation.v2", items: [], summary: {}, options: { enabled: true } }));
    await writeFile(qualityPath, JSON.stringify({ schema_version: "data_quality_report.v1", status: "pass" }));
    await writeFile(sourcePath, JSON.stringify({ schema_version: "source_registry.v1", sources: [{ id: "source-one" }] }));
    const loaded = await loadPreviousReleaseArtifacts({ urlPath, qualityPath, sourceRegistryPath: sourcePath, restoredRoot: join(root, "missing") });
    assert.equal(loaded.urlValidation?.schema_version, "tool_card_url_validation.v2");
    assert.equal(loaded.dataQuality?.schema_version, "data_quality_report.v1");
    assert.equal(loaded.sourceRegistry?.sources[0]?.id, "source-one");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("previous release artifacts use the restored reviewed bundle and tolerate no baseline", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-radar-restored-"));
  const dataDir = join(root, "dist-pages", "data");
  try {
    assert.deepEqual(await loadPreviousReleaseArtifacts({ restoredRoot: join(root, "absent") }), {});
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "tool_card_url_validation.v2.json"), JSON.stringify({ schema_version: "tool_card_url_validation.v2", items: [], summary: {}, options: { enabled: true } }));
    await writeFile(join(dataDir, "data_quality_report.json"), JSON.stringify({ schema_version: "data_quality_report.v1", status: "pass" }));
    const loaded = await loadPreviousReleaseArtifacts({ restoredRoot: root });
    assert.ok(loaded.urlValidation);
    assert.ok(loaded.dataQuality);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
