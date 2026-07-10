import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { McpSmokeResult } from "../api/mcp-smoke-runner.js";
import type { ArtifactManifest } from "../preview/manifest.js";

const d1SeedChecksumPath = "data/d1_seed.sql";
const requiredMcpSmokeCheckIds = [
  "mcp-initialize",
  "mcp-tools-list",
  "mcp-tools-call-get-tool-card",
  "mcp-read-only-boundary"
] as const;
const canonicalSha256Pattern = /^sha256:[0-9a-f]{64}$/;
const githubRepositoryPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const positiveDecimalIntegerPattern = /^[1-9][0-9]*$/;
const gitShaPattern = /^[0-9a-f]{6,64}$/;
const bundleNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
type ProductionArtifactManifest = Pick<ArtifactManifest, "schema_version" | "git_sha" | "checksums">;

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
  validateReleaseMetadata(options);
  const workerBaseUrl = parseProductionWorkerOrigin(options.workerBaseUrl);
  const [manifestContents, d1SeedContents, smokeResultContents] = await Promise.all([
    readFile(options.manifestPath),
    readFile(options.d1SeedPath),
    readFile(options.smokeResultPath)
  ]);
  const manifest = parseArtifactManifest(manifestContents);
  const smokeResult = parseMcpSmokeResult(smokeResultContents);
  const d1SeedSha256 = sha256(d1SeedContents);
  const expectedMcpEndpoint = `${workerBaseUrl}/api/mcp`;

  if (manifest.git_sha !== options.gitSha) {
    throw new Error("manifest git_sha must match GitHub SHA.");
  }
  if (manifest.checksums[d1SeedChecksumPath] !== d1SeedSha256) {
    throw new Error("D1 seed checksum must match artifact manifest.");
  }
  if (normalizeMcpEndpoint(smokeResult.endpoint) !== expectedMcpEndpoint) {
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
      worker_base_url: workerBaseUrl,
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
    `- GitHub: ${markdownInline(evidence.github.repository)} run=${markdownInline(evidence.github.run_id)} sha=${markdownInline(evidence.github.sha)} tag=${markdownInline(evidence.github.release_tag)}`,
    `- Deployment: environment=${markdownInline(evidence.deployment.environment)} id=${markdownInline(evidence.deployment.id)}`,
    `- Worker: ${markdownInline(evidence.deployment.worker_base_url)}`,
    `- MCP endpoint: ${markdownInline(evidence.deployment.mcp_endpoint)}`,
    `- Reviewed bundle: ${markdownInline(evidence.bundle.artifact_name)}`,
    `- Checksums: manifest=${markdownInline(evidence.bundle.manifest_sha256)} d1_seed=${markdownInline(evidence.bundle.d1_seed_sha256)}`,
    `- MCP smoke: PASS ${evidence.smoke.passed_checks}/${evidence.smoke.total}`,
    `- Generated at: ${markdownInline(evidence.generated_at)}`,
    ""
  ].join("\n");
}

function validateReleaseMetadata(options: BuildProductionReleaseEvidenceOptions): void {
  if (!isSingleLineString(options.repository) || !githubRepositoryPattern.test(options.repository)) {
    throw new Error("GitHub repository must use owner/repository format.");
  }
  if (!isSingleLineString(options.runId) || !positiveDecimalIntegerPattern.test(options.runId)) {
    throw new Error("GitHub run identifier must be a positive decimal integer.");
  }
  if (!isSingleLineString(options.gitSha) || !gitShaPattern.test(options.gitSha)) {
    throw new Error("GitHub SHA must be a lowercase hexadecimal commit identifier.");
  }
  if (!isValidGitRef(options.releaseTag)) {
    throw new Error("GitHub release tag must be a valid single-line Git ref.");
  }
  if (typeof options.deploymentId !== "string" || !options.deploymentId.trim()) {
    throw new Error("production deployment identifier is required.");
  }
  if (!isSingleLineString(options.deploymentId) || !positiveDecimalIntegerPattern.test(options.deploymentId)) {
    throw new Error("production deployment identifier must be a positive decimal integer.");
  }
  if (!isSingleLineString(options.bundleName) || !bundleNamePattern.test(options.bundleName)) {
    throw new Error("reviewed bundle name must be a safe single-line artifact name.");
  }
  if (!isValidUtcTimestamp(options.generatedAt)) {
    throw new Error("evidence generated_at must be a valid UTC ISO 8601 timestamp.");
  }
}

function sha256(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function parseArtifactManifest(contents: Buffer): ProductionArtifactManifest {
  const value = parseJson(contents, "artifact manifest");
  if (!isPlainObject(value)) {
    throw new Error("artifact manifest must be an object.");
  }
  if (value.schema_version !== "artifact_manifest.v1") {
    throw new Error("artifact manifest schema_version must be artifact_manifest.v1.");
  }
  if (
    typeof value.git_sha !== "string" ||
    !value.git_sha.trim() ||
    value.git_sha !== value.git_sha.trim() ||
    hasControlCharacters(value.git_sha)
  ) {
    throw new Error("artifact manifest git_sha must be a non-empty single-line string.");
  }
  if (!isPlainObject(value.checksums)) {
    throw new Error("artifact manifest checksums must be a plain object.");
  }
  if (Object.values(value.checksums).some((checksum) => typeof checksum !== "string" || !canonicalSha256Pattern.test(checksum))) {
    throw new Error("artifact manifest checksum values must use canonical sha256 format.");
  }

  return {
    schema_version: "artifact_manifest.v1",
    git_sha: value.git_sha,
    checksums: value.checksums as Record<string, string>
  };
}

function parseMcpSmokeResult(contents: Buffer): McpSmokeResult {
  const value = parseJson(contents, "MCP smoke result");
  if (!isPlainObject(value)) {
    throw new Error("MCP smoke result must be an object.");
  }
  if (value.schema_version !== "mcp_smoke_result.v1") {
    throw new Error("MCP smoke result schema_version must be mcp_smoke_result.v1.");
  }
  if (typeof value.endpoint !== "string" || !value.endpoint || typeof value.passed !== "boolean") {
    throw new Error("MCP smoke result fields must contain a valid endpoint and passed flag.");
  }
  if (!isPlainObject(value.summary)) {
    throw new Error("MCP smoke result summary must be an object.");
  }
  if (!Array.isArray(value.checks) || value.checks.length === 0) {
    throw new Error("MCP smoke result checks must be a non-empty array.");
  }

  const summary = value.summary;
  if (
    !Number.isInteger(summary.total) ||
    !Number.isInteger(summary.passed) ||
    !Number.isInteger(summary.failed) ||
    (summary.total as number) <= 0 ||
    (summary.passed as number) < 0 ||
    (summary.failed as number) < 0
  ) {
    throw new Error("MCP smoke summary total must be positive and result counts must be non-negative integers.");
  }

  const checks = value.checks;
  if (
    checks.some(
      (check) =>
        !isPlainObject(check) ||
        typeof check.id !== "string" ||
        !check.id ||
        typeof check.passed !== "boolean" ||
        typeof check.message !== "string"
    )
  ) {
    throw new Error("MCP smoke checks must contain valid id, passed, and message fields.");
  }

  const typedChecks = checks as McpSmokeResult["checks"];
  const checkIds = typedChecks.map((check) => check.id);
  if (new Set(checkIds).size !== checkIds.length) {
    throw new Error("MCP smoke result check ids must be unique.");
  }
  if (checkIds.some((id) => !requiredMcpSmokeCheckIds.includes(id as (typeof requiredMcpSmokeCheckIds)[number]))) {
    throw new Error("MCP smoke result contains unknown deployed checks.");
  }
  if (requiredMcpSmokeCheckIds.some((id) => !checkIds.includes(id))) {
    throw new Error("MCP smoke result is missing required deployed checks.");
  }

  const passed = typedChecks.filter((check) => check.passed).length;
  const failed = typedChecks.length - passed;
  if (summary.total !== typedChecks.length || summary.passed !== passed || summary.failed !== failed) {
    throw new Error("MCP smoke summary must match recomputed check counts.");
  }
  if (value.passed !== true) {
    throw new Error("MCP smoke result must report passed=true.");
  }
  if (failed !== 0) {
    throw new Error("MCP smoke result must pass all required deployed checks.");
  }

  return {
    schema_version: "mcp_smoke_result.v1",
    endpoint: value.endpoint,
    passed: true,
    summary: {
      total: summary.total as number,
      passed,
      failed
    },
    checks: typedChecks
  };
}

function parseJson(contents: Buffer, label: string): unknown {
  try {
    return JSON.parse(contents.toString()) as unknown;
  } catch {
    throw new Error(`${label} JSON is malformed.`);
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseProductionWorkerOrigin(value: unknown): string {
  if (typeof value !== "string" || value !== value.trim() || hasControlCharacters(value)) {
    throw new Error("production Worker base URL must be an HTTPS origin.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("production Worker base URL must be an HTTPS origin.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("production Worker base URL must be an HTTPS origin.");
  }

  return url.origin;
}

function normalizeMcpEndpoint(value: string): string {
  try {
    return new URL(value).toString();
  } catch {
    throw new Error("MCP smoke endpoint must be a valid URL.");
  }
}

function isSingleLineString(value: unknown): value is string {
  return typeof value === "string" && Boolean(value.trim()) && value === value.trim() && !hasControlCharacters(value);
}

function isValidGitRef(value: unknown): value is string {
  return (
    isSingleLineString(value) &&
    !value.startsWith("/") &&
    !value.endsWith("/") &&
    !value.endsWith(".") &&
    !value.includes("..") &&
    !value.includes("@{") &&
    !/[ ~^:?*[\\]/.test(value)
  );
}

function isValidUtcTimestamp(value: unknown): value is string {
  if (!isSingleLineString(value) || !utcTimestampPattern.test(value)) return false;

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return false;

  const canonicalTimestamp = timestamp.toISOString();
  return value.includes(".") ? canonicalTimestamp === value : canonicalTimestamp === `${value.slice(0, -1)}.000Z`;
}

function markdownInline(value: unknown): string {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/([`*_{}\[\]<>#+!|])/g, "\\$1");
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}
