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
      buildProductionReleaseEvidence({ ...optionsFor(fixture), gitSha: "deadbe" }),
      /manifest git_sha must match GitHub SHA/
    );
  });
});

test("rejects evidence when the D1 seed differs from the reviewed manifest checksum", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, {
      ...fixture.manifest,
      checksums: { "data/d1_seed.sql": `sha256:${"0".repeat(64)}` }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /D1 seed checksum must match artifact manifest/
    );
  });
});

test("rejects malformed artifact manifest JSON without echoing its contents", async () => {
  await withFixture(async (fixture) => {
    await writeFile(fixture.manifestPath, '{"secret-manifest-token":', "utf8");

    const error = await captureRejection(() => buildProductionReleaseEvidence(optionsFor(fixture)));
    assert.match(error.message, /artifact manifest JSON is malformed/);
    assert.doesNotMatch(error.message, /secret-manifest-token/);
  });
});

test("rejects an artifact manifest that is not an object", async () => {
  await withFixture(async (fixture) => {
    await writeFile(fixture.manifestPath, "null", "utf8");

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest must be an object/
    );
  });
});

test("rejects an artifact manifest with the wrong schema version", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, { ...fixture.manifest, schema_version: "artifact_manifest.v2" });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest schema_version must be artifact_manifest.v1/
    );
  });
});

test("rejects an artifact manifest with an empty git_sha", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, { ...fixture.manifest, git_sha: "" });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest git_sha must be a non-empty single-line string/
    );
  });
});

test("rejects an artifact manifest with null checksums", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, { ...fixture.manifest, checksums: null });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest checksums must be a plain object/
    );
  });
});

test("rejects an artifact manifest with array checksums", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, { ...fixture.manifest, checksums: [] });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest checksums must be a plain object/
    );
  });
});

test("rejects non-canonical checksum values anywhere in the artifact manifest", async () => {
  await withFixture(async (fixture) => {
    await writeManifest(fixture, {
      ...fixture.manifest,
      checksums: {
        ...(fixture.manifest.checksums as Record<string, unknown>),
        "data/other.json": `sha256:${"A".repeat(64)}`
      }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /artifact manifest checksum values must use canonical sha256 format/
    );
  });
});

test("rejects evidence when the deployed MCP smoke result failed", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      passed: false,
      summary: { total: 4, passed: 4, failed: 0 }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result must report passed=true/
    );
  });
});

test("rejects malformed MCP smoke JSON without echoing its contents", async () => {
  await withFixture(async (fixture) => {
    await writeFile(fixture.smokeResultPath, '{"secret-smoke-token":', "utf8");

    const error = await captureRejection(() => buildProductionReleaseEvidence(optionsFor(fixture)));
    assert.match(error.message, /MCP smoke result JSON is malformed/);
    assert.doesNotMatch(error.message, /secret-smoke-token/);
  });
});

test("rejects an MCP smoke result that is not an object", async () => {
  await withFixture(async (fixture) => {
    await writeFile(fixture.smokeResultPath, "null", "utf8");

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result must be an object/
    );
  });
});

test("rejects an MCP smoke result with the wrong schema version", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, { ...fixture.smoke, schema_version: "mcp_smoke_result.v2" });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result schema_version must be mcp_smoke_result.v1/
    );
  });
});

test("rejects an MCP smoke check with invalid field types", async () => {
  await withFixture(async (fixture) => {
    const checks = smokeChecks(fixture);
    checks[0] = { ...checks[0], passed: "true" };
    await writeSmokeResult(fixture, { ...fixture.smoke, checks });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke checks must contain valid id, passed, and message fields/
    );
  });
});

test("rejects an MCP smoke result with missing checks", async () => {
  await withFixture(async (fixture) => {
    const smoke = { ...fixture.smoke };
    delete smoke.checks;
    await writeSmokeResult(fixture, smoke);

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result checks must be a non-empty array/
    );
  });
});

test("rejects an MCP smoke result with empty checks", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, { ...fixture.smoke, checks: [] });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result checks must be a non-empty array/
    );
  });
});

test("rejects an MCP smoke result with non-positive summary counts", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      summary: { total: 0, passed: 0, failed: 0 }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke summary total must be positive and result counts must be non-negative integers/
    );
  });
});

test("rejects an MCP smoke summary that disagrees with its checks", async () => {
  await withFixture(async (fixture) => {
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      summary: { total: 4, passed: 3, failed: 1 }
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke summary must match recomputed check counts/
    );
  });
});

test("rejects MCP smoke results missing a required deployed check", async () => {
  await withFixture(async (fixture) => {
    const checks = smokeChecks(fixture);
    checks.pop();
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      summary: { total: 3, passed: 3, failed: 0 },
      checks
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result is missing required deployed checks/
    );
  });
});

test("rejects MCP smoke results with duplicate check ids", async () => {
  await withFixture(async (fixture) => {
    const checks = smokeChecks(fixture);
    checks[3] = { ...checks[3], id: checks[0]?.id };
    await writeSmokeResult(fixture, { ...fixture.smoke, checks });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result check ids must be unique/
    );
  });
});

test("rejects MCP smoke results with unknown check ids", async () => {
  await withFixture(async (fixture) => {
    const checks = smokeChecks(fixture);
    checks.push({ id: "unexpected-check", passed: true, message: "ok" });
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      summary: { total: 5, passed: 5, failed: 0 },
      checks
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result contains unknown deployed checks/
    );
  });
});

test("rejects MCP smoke results when any individual check failed", async () => {
  await withFixture(async (fixture) => {
    const checks = smokeChecks(fixture);
    checks[0] = { ...checks[0], passed: false };
    await writeSmokeResult(fixture, {
      ...fixture.smoke,
      passed: true,
      summary: { total: 4, passed: 3, failed: 1 },
      checks
    });

    await assert.rejects(
      buildProductionReleaseEvidence(optionsFor(fixture)),
      /MCP smoke result must pass all required deployed checks/
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

test("normalizes the persisted production Worker origin", async () => {
  await withFixture(async (fixture) => {
    const evidence = await buildProductionReleaseEvidence({
      ...optionsFor(fixture),
      workerBaseUrl: "https://AGENT-RADAR.example:443/"
    });

    assert.equal(evidence.deployment.worker_base_url, "https://agent-radar.example");
    assert.equal(evidence.deployment.mcp_endpoint, "https://agent-radar.example/api/mcp");
  });
});

test("rejects a production Worker origin that does not use HTTPS", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), workerBaseUrl: "http://agent-radar.example" }),
      /production Worker base URL must be an HTTPS origin/
    );
  });
});

test("rejects userinfo in the production Worker origin without leaking credentials", async () => {
  await withFixture(async (fixture) => {
    const error = await captureRejection(() =>
      buildProductionReleaseEvidence({
        ...optionsFor(fixture),
        workerBaseUrl: "https://deploy-user:secret-worker-token@agent-radar.example"
      })
    );

    assert.match(error.message, /production Worker base URL must be an HTTPS origin/);
    assert.doesNotMatch(error.message, /secret-worker-token|deploy-user/);
  });
});

test("rejects a query in the production Worker origin", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), workerBaseUrl: "https://agent-radar.example?secret=value" }),
      /production Worker base URL must be an HTTPS origin/
    );
  });
});

test("rejects a non-root path in the production Worker origin", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), workerBaseUrl: "https://agent-radar.example/deploy" }),
      /production Worker base URL must be an HTTPS origin/
    );
  });
});

test("rejects a hash in the production Worker origin", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), workerBaseUrl: "https://agent-radar.example#deploy" }),
      /production Worker base URL must be an HTTPS origin/
    );
  });
});

test("rejects malformed production Worker URLs without echoing their input", async () => {
  await withFixture(async (fixture) => {
    const error = await captureRejection(() =>
      buildProductionReleaseEvidence({
        ...optionsFor(fixture),
        workerBaseUrl: "https://secret-worker-token%%%"
      })
    );

    assert.match(error.message, /production Worker base URL must be an HTTPS origin/);
    assert.doesNotMatch(error.message, /secret-worker-token/);
  });
});

test("rejects a production Worker URL without a hostname", async () => {
  await withFixture(async (fixture) => {
    await assert.rejects(
      buildProductionReleaseEvidence({ ...optionsFor(fixture), workerBaseUrl: "https:///" }),
      /production Worker base URL must be an HTTPS origin/
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

const invalidReleaseMetadataCases = [
  ["an empty repository", { repository: "" }, /GitHub repository must use owner\/repository format/],
  ["a malformed repository", { repository: "zation" }, /GitHub repository must use owner\/repository format/],
  ["a multi-line repository", { repository: "zation/agent-radar\ninjected" }, /GitHub repository must use owner\/repository format/],
  ["an empty run id", { runId: "" }, /GitHub run identifier must be a positive decimal integer/],
  ["a malformed run id", { runId: "run-29012144469" }, /GitHub run identifier must be a positive decimal integer/],
  ["a multi-line run id", { runId: "29012144469\ninjected" }, /GitHub run identifier must be a positive decimal integer/],
  ["an empty Git SHA", { gitSha: "" }, /GitHub SHA must be a lowercase hexadecimal commit identifier/],
  ["a malformed Git SHA", { gitSha: "not-a-sha" }, /GitHub SHA must be a lowercase hexadecimal commit identifier/],
  ["a multi-line Git SHA", { gitSha: "abc123\ninjected" }, /GitHub SHA must be a lowercase hexadecimal commit identifier/],
  ["an empty release tag", { releaseTag: "" }, /GitHub release tag must be a valid single-line Git ref/],
  ["a malformed release tag", { releaseTag: "all v0.2.5" }, /GitHub release tag must be a valid single-line Git ref/],
  ["a multi-line release tag", { releaseTag: "all-v0.2.5\ninjected" }, /GitHub release tag must be a valid single-line Git ref/],
  ["a malformed deployment id", { deploymentId: "deploy-5374846069" }, /production deployment identifier must be a positive decimal integer/],
  ["a multi-line deployment id", { deploymentId: "5374846069\ninjected" }, /production deployment identifier must be a positive decimal integer/],
  ["an empty bundle name", { bundleName: "" }, /reviewed bundle name must be a safe single-line artifact name/],
  ["a malformed bundle name", { bundleName: "agent-radar/all" }, /reviewed bundle name must be a safe single-line artifact name/],
  ["a multi-line bundle name", { bundleName: "agent-radar-all-29012144469\ninjected" }, /reviewed bundle name must be a safe single-line artifact name/],
  ["an empty generated timestamp", { generatedAt: "" }, /evidence generated_at must be a valid UTC ISO 8601 timestamp/],
  ["a malformed generated timestamp", { generatedAt: "2026-07-10" }, /evidence generated_at must be a valid UTC ISO 8601 timestamp/],
  ["a multi-line generated timestamp", { generatedAt: "2026-07-10T00:00:00Z\ninjected" }, /evidence generated_at must be a valid UTC ISO 8601 timestamp/]
] as const;

for (const [description, invalidOptions, expectedError] of invalidReleaseMetadataCases) {
  test(`rejects ${description} at the production evidence builder boundary`, async () => {
    await withFixture(async (fixture) => {
      await assert.rejects(
        buildProductionReleaseEvidence({ ...optionsFor(fixture), ...invalidOptions }),
        expectedError
      );
    });
  });
}

test("escapes Markdown structure injected into a manually constructed evidence object", async () => {
  await withFixture(async (fixture) => {
    const evidence = await buildProductionReleaseEvidence(optionsFor(fixture));
    evidence.github.repository = "zation/agent-radar\n## injected";

    const markdown = renderProductionReleaseEvidenceMarkdown(evidence);
    assert.doesNotMatch(markdown, /\n## injected/);
    assert.match(markdown, /zation\/agent-radar \\#\\# injected/);
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

function smokeChecks(fixture: EvidenceFixture): Array<Record<string, unknown>> {
  return (fixture.smoke.checks as Array<Record<string, unknown>>).map((check) => ({ ...check }));
}

async function captureRejection(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    assert.equal(error instanceof Error, true);
    return error as Error;
  }
  throw new Error("Expected operation to reject.");
}

function sha256(value: string | Buffer): string {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
