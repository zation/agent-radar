import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { McpSmokeResult } from "../api/mcp-smoke-runner.js";
import type { ArtifactManifest } from "../preview/manifest.js";

const d1SeedChecksumPath = "data/d1_seed.sql";

export interface BuildProductionReleaseEvidenceOptions {
  manifestPath: string;
  d1SeedPath: string;
  smokeResultPath: string;
  repository: string;
  runId: string;
  gitSha: string;
  releaseTag: string;
  deploymentId: string;
  bundleName: string;
  workerBaseUrl: string;
  generatedAt: string;
}

export interface ProductionReleaseEvidence {
  schema_version: "production_release_evidence.v1";
  github: {
    repository: string;
    run_id: string;
    sha: string;
    release_tag: string;
  };
  deployment: {
    id: string;
    environment: "production";
    worker_base_url: string;
    mcp_endpoint: string;
  };
  bundle: {
    artifact_name: string;
    manifest_sha256: string;
    d1_seed_sha256: string;
  };
  smoke: {
    passed: true;
    total: number;
    passed_checks: number;
    failed: 0;
  };
  generated_at: string;
}

export async function buildProductionReleaseEvidence(
  options: BuildProductionReleaseEvidenceOptions
): Promise<ProductionReleaseEvidence> {
  const [manifestContents, d1SeedContents, smokeResultContents] = await Promise.all([
    readFile(options.manifestPath),
    readFile(options.d1SeedPath),
    readFile(options.smokeResultPath)
  ]);
  const manifest = JSON.parse(manifestContents.toString()) as ArtifactManifest;
  const smokeResult = JSON.parse(smokeResultContents.toString()) as McpSmokeResult;
  const d1SeedSha256 = sha256(d1SeedContents);
  const expectedMcpEndpoint = buildMcpEndpoint(options.workerBaseUrl);

  if (!options.deploymentId.trim()) {
    throw new Error("production deployment identifier is required.");
  }
  if (manifest.git_sha !== options.gitSha) {
    throw new Error("manifest git_sha must match GitHub SHA.");
  }
  if (manifest.checksums[d1SeedChecksumPath] !== d1SeedSha256) {
    throw new Error("D1 seed checksum must match artifact manifest.");
  }
  if (
    smokeResult.passed !== true ||
    smokeResult.summary.failed !== 0 ||
    smokeResult.summary.passed !== smokeResult.summary.total
  ) {
    throw new Error("MCP smoke result must pass all checks.");
  }
  if (normalizeUrl(smokeResult.endpoint) !== expectedMcpEndpoint) {
    throw new Error("MCP smoke endpoint must match the production Worker MCP endpoint.");
  }

  return {
    schema_version: "production_release_evidence.v1",
    github: {
      repository: options.repository,
      run_id: options.runId,
      sha: options.gitSha,
      release_tag: options.releaseTag
    },
    deployment: {
      id: options.deploymentId,
      environment: "production",
      worker_base_url: options.workerBaseUrl,
      mcp_endpoint: expectedMcpEndpoint
    },
    bundle: {
      artifact_name: options.bundleName,
      manifest_sha256: sha256(manifestContents),
      d1_seed_sha256: d1SeedSha256
    },
    smoke: {
      passed: true,
      total: smokeResult.summary.total,
      passed_checks: smokeResult.summary.passed,
      failed: 0
    },
    generated_at: options.generatedAt
  };
}

export function renderProductionReleaseEvidenceMarkdown(evidence: ProductionReleaseEvidence): string {
  return [
    "### Production Release Evidence",
    `- GitHub: ${evidence.github.repository} run=${evidence.github.run_id} sha=${evidence.github.sha} tag=${evidence.github.release_tag}`,
    `- Deployment: environment=${evidence.deployment.environment} id=${evidence.deployment.id}`,
    `- Worker: ${evidence.deployment.worker_base_url}`,
    `- MCP endpoint: ${evidence.deployment.mcp_endpoint}`,
    `- Reviewed bundle: ${evidence.bundle.artifact_name}`,
    `- Checksums: manifest=${evidence.bundle.manifest_sha256} d1_seed=${evidence.bundle.d1_seed_sha256}`,
    `- MCP smoke: PASS ${evidence.smoke.passed_checks}/${evidence.smoke.total}`,
    `- Generated at: ${evidence.generated_at}`,
    ""
  ].join("\n");
}

function sha256(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function buildMcpEndpoint(workerBaseUrl: string): string {
  const baseUrl = workerBaseUrl.trim();
  if (!baseUrl) throw new Error("production Worker base URL is required.");
  return new URL("/api/mcp", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
}

function normalizeUrl(value: string): string {
  return new URL(value).toString();
}
