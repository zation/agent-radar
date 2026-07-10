import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import {
  buildProductionReleaseEvidence,
  renderProductionReleaseEvidenceMarkdown
} from "../src/release/production-evidence.js";

const execFile = promisify(execFileCallback);

interface EvidenceFixture {
  directory: string;
  manifestPath: string;
  d1SeedPath: string;
  smokeResultPath: string;
  manifest: Record<string, unknown>;
  smoke: Record<string, unknown>;
  d1SeedSha256: string;
}

test("builds immutable production evidence from the reviewed bundle and deployed smoke result", async () => {
  await withFixture(async (fixture) => {
    const evidence = await buildProductionReleaseEvidence(optionsFor(fixture));
    const manifestSha256 = sha256(await readFile(fixture.manifestPath));

    assert.equal(evidence.schema_version, "production_release_evidence.v1");
    assert.deepEqual(evidence.github, {
      repository: "zation/agent-radar",
      run_id: "29012144469",
      sha: "abc123",
      release_tag: "all-v0.2.5"
    });
    assert.deepEqual(evidence.deployment, {
      id: "5374846069",
      environment: "production",
      worker_base_url: "https://agent-radar.example",
      mcp_endpoint: "https://agent-radar.example/api/mcp"
    });
    assert.deepEqual(evidence.bundle, {
      artifact_name: "agent-radar-all-29012144469",
      manifest_sha256: manifestSha256,
      d1_seed_sha256: fixture.d1SeedSha256
    });
    assert.deepEqual(evidence.smoke, { passed: true, total: 4, passed_checks: 4, failed: 0 });
    assert.equal(evidence.generated_at, "2026-07-10T00:00:00Z");
    assert.match(renderProductionReleaseEvidenceMarkdown(evidence), /### Production Release Evidence/);
    assert.match(renderProductionReleaseEvidenceMarkdown(evidence), /PASS 4\/4/);
  });
});

test("rejects evidence when the reviewed manifest SHA differs from the GitHub SHA", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), gitSha: "wrong" }),
      /manifest git_sha must match GitHub SHA/
    );
  });
});

test("rejects evidence when the D1 seed differs from the reviewed manifest checksum", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, {
      ...fixture.manifest,
      checksums: { "data/d1_seed.sql": "sha256:wrong" }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /D1 seed checksum must match artifact manifest/
    );
  });
});

test("rejects evidence when the deployed MCP smoke result failed", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      passed: false,
      summary: { total: 4, passed: 3, failed: 1 }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result must pass all checks/
    );
  });
});

test("rejects evidence when the smoke endpoint is not the deployed Worker MCP endpoint", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, { ...fixture.smoke, endpoint: "https://other-worker.example/api/mcp" });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke endpoint must match the production Worker MCP endpoint/
    );
  });
});

test("rejects evidence without the GitHub production deployment identifier", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), deploymentId: "" }),
      /production deployment identifier is required/
    );
  });
});

test("CLI writes the evidence JSON and prints its Markdown summary", async () => {
  await withFixture(async (fixture) => {
    const outputPath = join(fixture.directory, "production-release-evidence.json");
    const { stdout } = await execFile(process.execPath, [resolve("dist/src/cli/build-production-evidence.js")], {
      env: {
        ...process.env,
        AGENT_RADAR_ARTIFACT_MANIFEST: fixture.manifestPath,
        AGENT_RADAR_D1_SEED: fixture.d1SeedPath,
        AGENT_RADAR_MCP_SMOKE_RESULT: fixture.smokeResultPath,
        GITHUB_REPOSITORY: "zation/agent-radar",
        GITHUB_RUN_ID: "29012144469",
        GITHUB_SHA: "abc123",
        GITHUB_REF_NAME: "all-v0.2.5",
        AGENT_RADAR_PRODUCTION_DEPLOYMENT_ID: "5374846069",
        AGENT_RADAR_REVIEWED_BUNDLE: "agent-radar-all-29012144469",
        AGENT_RADAR_WORKER_BASE_URL: "https://agent-radar.example",
        AGENT_RADAR_EVIDENCE_GENERATED_AT: "2026-07-10T00:00:00Z",
        AGENT_RADAR_PRODUCTION_EVIDENCE: outputPath
      }
    });

    const evidence = JSON.parse(await readFile(outputPath, "utf8")) as { schema_version?: string };
    assert.equal(evidence.schema_version, "production_release_evidence.v1");
    assert.match(stdout, /### Production Release Evidence/);
  });
});

async function withFixture(run: (fixture: EvidenceFixture) => Promise<void>): Promise<void> {
  const fixture = await createFixture();
  try {
    await run(fixture);
  } finally {
    await rm(fixture.directory, { recursive: true, force: true });
  }
}

async function createFixture(): Promise<EvidenceFixture> {
  const directory = await mkdtemp(join(tmpdir(), "agent-radar-production-evidence-"));
  const dataDirectory = join(directory, "data");
  const manifestPath = join(directory, "artifact-manifest.json");
  const d1SeedPath = join(dataDirectory, "d1_seed.sql");
  const smokeResultPath = join(directory, "mcp-smoke-result.json");
  const d1Seed = "CREATE TABLE tool_cards (id TEXT PRIMARY KEY);\n";
  const d1SeedSha256 = sha256(d1Seed);
  const manifest = {
    schema_version: "artifact_manifest.v1",
    git_sha: "abc123",
    built_at: "2026-07-10T00:00:00Z",
    data_version: "data-test",
    eval: { passed: 10, total: 10, model: "deepseek-v4-flash", failure_categories: { none: 10 } },
    checksums: { "data/d1_seed.sql": d1SeedSha256 }
  };
  const smoke = {
    schema_version: "mcp_smoke_result.v1",
    endpoint: "https://agent-radar.example/api/mcp",
    passed: true,
    summary: { total: 4, passed: 4, failed: 0 },
    checks: [
      { id: "mcp-initialize", passed: true, message: "ok" },
      { id: "mcp-tools-list", passed: true, message: "ok" },
      { id: "mcp-tools-call-get-tool-card", passed: true, message: "ok" },
      { id: "mcp-read-only-boundary", passed: true, message: "ok" }
    ]
  };

  await mkdir(dataDirectory, { recursive: true });
  await writeFile(d1SeedPath, d1Seed, "utf8");
  await writeManifest({ directory, manifestPath, d1SeedPath, smokeResultPath, manifest, smoke, d1SeedSha256 }, manifest);
  await writeSmokeResult({ directory, manifestPath, d1SeedPath, smokeResultPath, manifest, smoke, d1SeedSha256 }, smoke);

  return { directory, manifestPath, d1SeedPath, smokeResultPath, manifest, smoke, d1SeedSha256 };
}

function optionsFor(fixture: EvidenceFixture) {
  return {
    manifestPath: fixture.manifestPath,
    d1SeedPath: fixture.d1SeedPath,
    smokeResultPath: fixture.smokeResultPath,
    repository: "zation/agent-radar",
    runId: "29012144469",
    gitSha: "abc123",
    releaseTag: "all-v0.2.5",
    deploymentId: "5374846069",
    bundleName: "agent-radar-all-29012144469",
    workerBaseUrl: "https://agent-radar.example",
    generatedAt: "2026-07-10T00:00:00Z"
  };
}

async function writeManifest(fixture: EvidenceFixture, manifest: Record<string, unknown>): Promise<void> {
  await writeFile(fixture.manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

async function writeSmokeResult(fixture: EvidenceFixture, smoke: Record<string, unknown>): Promise<void> {
  await writeFile(fixture.smokeResultPath, JSON.stringify(smoke, null, 2), "utf8");
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
