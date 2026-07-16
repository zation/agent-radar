import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { promisify } from "node:util";
import test from "node:test";

const execFileAsync = promisify(execFile);
const scriptPath = "skills/agent-radar/scripts/agent-radar.mjs";

test("installable Agent Radar skill has valid local-first metadata", async () => {
  const skill = await readFile("skills/agent-radar/SKILL.md", "utf8");
  const metadata = await readFile("skills/agent-radar/agents/openai.yaml", "utf8");
  assert.match(skill, /^---\nname: agent-radar\ndescription: .+\n---/);
  assert.doesNotMatch(skill, /\[TODO/);
  assert.match(skill, /does not call MCP/);
  assert.match(skill, /agent-radar\.mjs sync/);
  assert.match(metadata, /default_prompt: "Use \$agent-radar /);
});

test("skill client atomically syncs verified data and searches offline", async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-cache-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  const fixture = buildDatasetFixture("all-v0.9.1");
  const requestedPaths: string[] = [];
  const server = createServer((request, response) => {
    requestedPaths.push(request.url ?? "");
    const contents = fixture.routes.get(request.url ?? "");
    if (!contents) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json", "content-length": contents.byteLength });
    response.end(contents);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const env = {
    ...process.env,
    AGENT_RADAR_BASE_URL: `http://127.0.0.1:${address.port}`,
    AGENT_RADAR_CACHE_DIR: cacheDir
  };

  const sync = JSON.parse((await execFileAsync(process.execPath, [scriptPath, "sync"], { env })).stdout) as {
    status: string;
    release_id: string;
  };
  assert.deepEqual({ status: sync.status, release_id: sync.release_id }, { status: "synced", release_id: "all-v0.9.1" });
  assert.deepEqual(requestedPaths, [
    "/data/skill/channels/v1/latest.json",
    "/data/skill/releases/all-v0.9.1/manifest.json",
    "/data/skill/releases/all-v0.9.1/tool_cards.jsonl",
    "/data/skill/releases/all-v0.9.1/ratings.jsonl",
    "/data/skill/releases/all-v0.9.1/search_index.json"
  ]);
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));

  const search = JSON.parse((await execFileAsync(
    process.execPath,
    [scriptPath, "search", '{"query":"browser automation","top_k":3}'],
    { env }
  )).stdout) as { release: { release_id: string }; results: Array<{ tool_id: string }> };
  assert.equal(search.release.release_id, "all-v0.9.1");
  assert.deepEqual(search.results.map(({ tool_id }) => tool_id), ["mcp-browser-automation"]);

  const context = JSON.parse((await execFileAsync(
    process.execPath,
    [scriptPath, "context", '{"task":"browser automation","risk_tolerance":"low"}'],
    { env }
  )).stdout) as { candidates: Array<{ maximum_allowed_action: string }> };
  assert.equal(context.candidates[0]?.maximum_allowed_action, "ask_human");

  const unsafeContext = JSON.parse((await execFileAsync(
    process.execPath,
    [scriptPath, "context", '{"task":"untrusted code execution","risk_tolerance":"high"}'],
    { env }
  )).stdout) as { candidates: Array<{ maximum_allowed_action: string }> };
  assert.equal(unsafeContext.candidates[0]?.maximum_allowed_action, "avoid");

  await writeFile(join(cacheDir, "releases", "all-v0.9.1", "tool_cards.jsonl"), "tampered\n", "utf8");
  await assert.rejects(
    execFileAsync(process.execPath, [scriptPath, "search", '{"query":"browser"}'], { env }),
    /local_release_corrupt/
  );
});

test("failed checksum verification keeps the previous local release active", async (t) => {
  const cacheDir = await mkdtemp(join(tmpdir(), "agent-radar-skill-fallback-"));
  t.after(() => rm(cacheDir, { recursive: true, force: true }));
  let fixture = buildDatasetFixture("all-v0.9.1");
  const server = createServer((request, response) => {
    const contents = fixture.routes.get(request.url ?? "");
    if (!contents) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(contents);
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => server.close());
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const env = {
    ...process.env,
    AGENT_RADAR_BASE_URL: `http://127.0.0.1:${address.port}`,
    AGENT_RADAR_CACHE_DIR: cacheDir
  };
  await execFileAsync(process.execPath, [scriptPath, "sync"], { env });

  fixture = buildDatasetFixture("all-v0.9.2", { corruptToolCards: true });
  await assert.rejects(execFileAsync(process.execPath, [scriptPath, "sync"], { env }), /dataset_checksum_mismatch/);

  const status = JSON.parse((await execFileAsync(process.execPath, [scriptPath, "status"], { env })).stdout) as {
    release_id: string;
  };
  assert.equal(status.release_id, "all-v0.9.1");
  await assert.rejects(readFile(join(cacheDir, "releases", "all-v0.9.2", "_verified.json")), { code: "ENOENT" });

  fixture = buildDatasetFixture("all-v0.9.3", { minimumClientVersion: "1.0.0" });
  await assert.rejects(execFileAsync(process.execPath, [scriptPath, "sync"], { env }), /skill_update_required/);
  const statusAfterIncompatibleUpdate = JSON.parse(
    (await execFileAsync(process.execPath, [scriptPath, "status"], { env })).stdout
  ) as { release_id: string };
  assert.equal(statusAfterIncompatibleUpdate.release_id, "all-v0.9.1");
});

function buildDatasetFixture(
  releaseId: string,
  options: { corruptToolCards?: boolean; minimumClientVersion?: string } = {}
): {
  routes: Map<string, Buffer>;
} {
  const toolCards = Buffer.from(`${JSON.stringify({
    id: "mcp-browser-automation",
    schema_version: "tool_card.v1",
    name: "Browser Automation MCP",
    type: "mcp",
    summary: "Automates browsers.",
    tags: ["browser", "automation"],
    permissions: [{ scope: "browser", access: "execute", required: true, notes: "Controls a browser." }],
    security: { risk_level: "high", trust_level: "official", known_risks: [], requires_human_approval: true, security_notes: "Confirm browser access." }
  })}\n${JSON.stringify({
    id: "agent-untrusted-code",
    schema_version: "tool_card.v1",
    name: "Untrusted Code Agent",
    type: "agent",
    summary: "Executes untrusted code.",
    tags: ["untrusted", "code", "execution"],
    permissions: [{ scope: "code_execution", access: "execute", required: true, notes: "Executes code." }],
    security: { risk_level: "critical", trust_level: "unknown", known_risks: [], requires_human_approval: true, security_notes: "Unknown trust." }
  })}\n`);
  const ratings = Buffer.from(`${JSON.stringify({
    id: "rating-mcp-browser-automation",
    schema_version: "rating_result.v2",
    tool_id: "mcp-browser-automation",
    rules_version: "rating_rules.v0.2",
    overall_score: 82,
    recommendation_level: "consider",
    risk_level: "high",
    dimension_scores: {},
    explanations: [],
    penalties: [],
    boosts: []
  })}\n${JSON.stringify({
    id: "rating-agent-untrusted-code",
    schema_version: "rating_result.v2",
    tool_id: "agent-untrusted-code",
    rules_version: "rating_rules.v0.2",
    overall_score: 10,
    recommendation_level: "avoid",
    risk_level: "critical",
    dimension_scores: {},
    explanations: [],
    penalties: [],
    boosts: []
  })}\n`);
  const searchIndex = Buffer.from(`${JSON.stringify({
    schema_version: "search_index.v1",
    built_at: "2026-07-16T00:00:00Z",
    documents: [{
      tool_id: "mcp-browser-automation",
      text: "browser automation mcp automates browsers",
      tags: ["browser", "automation"],
      type: "mcp",
      rating_overall: 82,
      risk_level: "high",
      confidence: "high"
    }, {
      tool_id: "agent-untrusted-code",
      text: "untrusted code execution agent",
      tags: ["untrusted", "code", "execution"],
      type: "agent",
      rating_overall: 10,
      risk_level: "critical",
      confidence: "low"
    }]
  })}\n`);
  const entries = [
    fileEntry("tool_cards.jsonl", "tool_card.v1", toolCards),
    fileEntry("ratings.jsonl", "rating_result.v2", ratings),
    fileEntry("search_index.json", "search_index.v1", searchIndex)
  ];
  if (options.corruptToolCards) entries[0] = { ...entries[0], sha256: `sha256:${"0".repeat(64)}` };
  const manifest = Buffer.from(`${JSON.stringify({
    schema_version: "agent_radar_skill_data_manifest.v1",
    data_contract_version: "agent_radar_skill_dataset.v1",
    minimum_client_version: options.minimumClientVersion ?? "0.9.0",
    release_id: releaseId,
    commit_sha: "0123456789abcdef",
    data_version: "data-test",
    published_at: "2026-07-16T00:00:00Z",
    files: entries
  }, null, 2)}\n`);
  const channel = Buffer.from(`${JSON.stringify({
    schema_version: "agent_radar_skill_channel.v1",
    data_contract_version: "agent_radar_skill_dataset.v1",
    release_id: releaseId,
    manifest_path: `/data/skill/releases/${releaseId}/manifest.json`,
    manifest_size_bytes: manifest.byteLength,
    manifest_sha256: sha256(manifest)
  }, null, 2)}\n`);
  return {
    routes: new Map([
      ["/data/skill/channels/v1/latest.json", channel],
      [`/data/skill/releases/${releaseId}/manifest.json`, manifest],
      [`/data/skill/releases/${releaseId}/tool_cards.jsonl`, toolCards],
      [`/data/skill/releases/${releaseId}/ratings.jsonl`, ratings],
      [`/data/skill/releases/${releaseId}/search_index.json`, searchIndex]
    ])
  };
}

function fileEntry(path: string, schemaVersion: string, contents: Buffer): {
  path: string;
  schema_version: string;
  size_bytes: number;
  sha256: string;
} {
  return { path, schema_version: schemaVersion, size_bytes: contents.byteLength, sha256: sha256(contents) };
}

function sha256(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}
