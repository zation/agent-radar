import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { DEV_DATA_FILES, ensureDevData } from "../src/dev/ensure-data.js";

const productionOrigin = "https://agent-radar.zation1.workers.dev";

function validArtifact(path: string): string {
  if (path.endsWith(".jsonl")) return `${JSON.stringify({ id: path })}\n`;
  if (path.endsWith("eval_summary.json")) return JSON.stringify({ passed: 24, total: 24, results: [] });
  return JSON.stringify({ schema_version: "source_registry_review_requests.v1", items: [] });
}

test("prepares the artifacts required by Tools and Evaluation pages", () => {
  const files: readonly string[] = DEV_DATA_FILES;
  assert.equal(files.length, 6);
  assert.ok(files.includes("manifest.json"));
  assert.ok(files.includes("golden_queries.json"));
  assert.equal(files.includes("source_registry_review_requests.json"), false);
});

test("keeps complete local UI data without making production requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-radar-dev-data-"));
  try {
    const dataDir = join(root, "data");
    await mkdir(dataDir, { recursive: true });
    for (const path of DEV_DATA_FILES) await writeFile(join(dataDir, path), validArtifact(path), "utf8");
    let requests = 0;

    const result = await ensureDevData({
      dataDir,
      productionOrigin,
      fetchImpl: () => {
        requests += 1;
        return Promise.reject(new Error("fetch should not be called"));
      }
    });

    assert.deepEqual(result, { source: "local", fileCount: DEV_DATA_FILES.length });
    assert.equal(requests, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("downloads and validates missing UI data from the fixed production origin", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-radar-dev-data-"));
  try {
    const dataDir = join(root, "data");
    const requested: string[] = [];

    const result = await ensureDevData({
      dataDir,
      productionOrigin,
      fetchImpl: (input) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
        requested.push(url);
        const path = new URL(url).pathname.split("/").at(-1)!;
        return Promise.resolve(
          new Response(validArtifact(path), {
            headers: { "content-type": path.endsWith(".jsonl") ? "text/plain" : "application/json" }
          })
        );
      }
    });

    assert.deepEqual(result, { source: "production", fileCount: DEV_DATA_FILES.length });
    assert.deepEqual(
      requested,
      DEV_DATA_FILES.map((path) => `${productionOrigin}/data/${path}`)
    );
    for (const path of DEV_DATA_FILES) assert.equal(await readFile(join(dataDir, path), "utf8"), validArtifact(path));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("rejects production HTML fallback without replacing existing local data", async () => {
  const root = await mkdtemp(join(tmpdir(), "agent-radar-dev-data-"));
  try {
    const dataDir = join(root, "data");
    await mkdir(dataDir, { recursive: true });
    await writeFile(join(dataDir, "tool_cards.jsonl"), "existing\n", "utf8");

    await assert.rejects(
      ensureDevData({
        dataDir,
        productionOrigin,
        fetchImpl: () =>
          Promise.resolve(
            new Response("<!doctype html>", { headers: { "content-type": "text/html; charset=utf-8" } })
          )
      }),
      /Production UI artifact .* returned HTML/
    );

    assert.equal(await readFile(join(dataDir, "tool_cards.jsonl"), "utf8"), "existing\n");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
