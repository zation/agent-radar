import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { REQUIRED_MCP_SMOKE_CHECK_IDS } from "../src/api/mcp-smoke-contract.js";
import { validateMcpRegistryReleaseInputs } from "../src/release/mcp-registry-release.js";
import { buildProductionReleaseEvidence } from "../src/release/production-evidence.js";

const execFile = promisify(execFileCallback);

const metadata = JSON.parse(await readFile("server.json", "utf8")) as Record<string, unknown>;
const source = {
  repository: "zation/agent-radar",
  runId: "31000000001",
  releaseTag: "all-v0.6.2",
  gitSha: "abcdef1234567890"
};

function production(endpoint = "https://agent-radar.zation1.workers.dev/api/mcp") {
  return {
    schema_version: "production_release_evidence.v1",
    github: { repository: source.repository, run_id: source.runId, sha: source.gitSha, release_tag: source.releaseTag },
    deployment: {
      environment: "production",
      worker_base_url: endpoint.replace(/\/api\/mcp$/, ""),
      mcp_endpoint: endpoint
    },
    smoke: { passed: true, total: 7, passed_checks: 7, failed: 0 }
  };
}

function smoke(endpoint = "https://agent-radar.zation1.workers.dev/api/mcp") {
  return {
    schema_version: "mcp_smoke_result.v2",
    endpoint,
    release_id: source.releaseTag,
    commit_sha: source.gitSha,
    generated_at: "2026-07-13T08:00:00Z",
    passed: true,
    summary: { total: 7, passed: 7, failed: 0 },
    checks: REQUIRED_MCP_SMOKE_CHECK_IDS.map((id) => ({ id, passed: true, message: "passed" }))
  };
}

test("binds production evidence and source smoke to the immutable Registry remote", () => {
  const validated = validateMcpRegistryReleaseInputs(production(), smoke(), metadata, source);
  assert.equal(validated.workerBaseUrl, "https://agent-radar.zation1.workers.dev");
  assert.equal(validated.mcpEndpoint, "https://agent-radar.zation1.workers.dev/api/mcp");
});

test("rejects production evidence or smoke for a different Worker", () => {
  assert.throws(
    () => validateMcpRegistryReleaseInputs(production("https://other.workers.dev/api/mcp"), smoke(), metadata, source),
    /production MCP endpoint/i
  );
  assert.throws(
    () => validateMcpRegistryReleaseInputs(production(), smoke("https://other.workers.dev/api/mcp"), metadata, source),
    /smoke endpoint/i
  );
});

test("rejects incomplete, failed, or identity-mismatched source smoke", () => {
  const incomplete = smoke();
  incomplete.checks = incomplete.checks.slice(1);
  assert.throws(() => validateMcpRegistryReleaseInputs(production(), incomplete, metadata, source), /exact seven checks/i);
  assert.throws(() => validateMcpRegistryReleaseInputs(production(), { ...smoke(), commit_sha: "deadbeef" }, metadata, source), /smoke identity/i);
});

test("release validation CLI rebuilds checksum-bound production evidence before publication", async () => {
  const directory = await mkdtemp(join(tmpdir(), "agent-radar-registry-release-"));
  const paths = Object.fromEntries(["manifest", "seed", "smoke", "production", "metadata"].map((name) => [name, join(directory, `${name}.json`)])) as Record<string, string>;
  const seed = "INSERT INTO release_meta VALUES ('all-v0.6.2');\n";
  const manifest = {
    schema_version: "artifact_manifest.v1",
    git_sha: source.gitSha,
    checksums: {
      "data/d1_seed.sql": sha256(seed),
      "data/feedback_processing_plan.json": `sha256:${"c".repeat(64)}`
    },
    feedback: {
      rules_version: "feedback_rules.v0.1",
      vote_snapshot_checksum: `sha256:${"b".repeat(64)}`,
      processing_plan_checksum: `sha256:${"c".repeat(64)}`
    }
  };
  try {
    await Promise.all([
      writeFile(paths.manifest, JSON.stringify(manifest), "utf8"),
      writeFile(paths.seed, seed, "utf8"),
      writeFile(paths.smoke, JSON.stringify(smoke()), "utf8"),
      writeFile(paths.metadata, JSON.stringify(metadata), "utf8")
    ]);
    const evidence = await buildProductionReleaseEvidence({
      manifestPath: paths.manifest,
      d1SeedPath: paths.seed,
      smokeResultPath: paths.smoke,
      repository: source.repository,
      runId: source.runId,
      gitSha: source.gitSha,
      releaseTag: source.releaseTag,
      deploymentId: "5500000001",
      bundleName: `agent-radar-all-${source.runId}`,
      workerBaseUrl: "https://agent-radar.zation1.workers.dev",
      generatedAt: "2026-07-13T08:02:00Z"
    });
    await writeFile(paths.production, JSON.stringify(evidence), "utf8");
    const args = [
      "dist/src/cli/validate-mcp-registry-release.js",
      "--production-evidence", paths.production,
      "--smoke-result", paths.smoke,
      "--metadata", paths.metadata,
      "--manifest", paths.manifest,
      "--d1-seed", paths.seed,
      "--repository", source.repository,
      "--run-id", source.runId,
      "--release-tag", source.releaseTag,
      "--git-sha", source.gitSha
    ];
    const { stdout } = await execFile(process.execPath, args);
    assert.match(stdout, /release inputs valid/);
    await writeFile(paths.seed, `${seed}-- drift\n`, "utf8");
    await assert.rejects(execFile(process.execPath, args), /D1 seed checksum/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

function sha256(value: string): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
