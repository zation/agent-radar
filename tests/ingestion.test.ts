import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { crawlEnabledSources } from "../src/ingestion/crawler.js";
import { runIngestion } from "../src/ingestion/run.js";
import { getEnabledSources, sourceRegistry } from "../src/ingestion/source-registry.js";

test("source registry exposes only enabled MVP sources", () => {
  const enabled = getEnabledSources(sourceRegistry);

  assert.deepEqual(enabled.map((source) => source.id), ["manual-agent-radar-seed"]);
  assert.equal(enabled[0]?.collection_method, "manual");
  assert.equal(enabled[0]?.trust_level, "official");
});

test("crawler saves immutable raw snapshots without request secrets", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "agent-radar-ingest-"));

  try {
    const [snapshot] = await crawlEnabledSources({
      sources: getEnabledSources(sourceRegistry),
      outputDir,
      now: "2026-07-07T00:00:00Z",
      fetchImpl: async (_url, init) => {
        const headers = new Headers(init?.headers);
        assert.equal(headers.get("authorization"), null);
        return new Response(JSON.stringify({ tools: [{ id: "agent-codex", name: "Codex" }] }), {
          status: 200,
          headers: { "content-type": "application/json", etag: "seed-v1" }
        });
      }
    });

    assert.equal(snapshot?.schema_version, "raw_snapshot.v1");
    assert.equal(snapshot?.source_id, "manual-agent-radar-seed");
    assert.equal(snapshot?.status, "success");
    assert.match(snapshot?.content_hash ?? "", /^sha256:/);
    assert.ok(snapshot?.content_path.endsWith(".json"));
    assert.deepEqual(snapshot?.request_meta, { etag: "seed-v1" });

    const content = await readFile(join(outputDir, snapshot?.content_path ?? ""), "utf8");
    const meta = JSON.parse(await readFile(join(outputDir, `${snapshot?.content_path}.meta.json`), "utf8")) as { request_meta: Record<string, string> };
    assert.match(content, /agent-codex/);
    assert.equal(JSON.stringify(meta).includes("authorization"), false);
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
      fetchImpl: async () =>
        new Response(
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
        )
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
