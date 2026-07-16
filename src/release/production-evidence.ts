import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { McpSmokeResult } from "../api/mcp-smoke-runner.js";
import { REQUIRED_MCP_SMOKE_CHECK_IDS } from "../api/mcp-smoke-contract.js";
import type { ArtifactManifest } from "../preview/manifest.js";
import { registryVersionFromTag } from "./mcp-registry.js";
import type { ReleaseIdentityConvergenceResult } from "./release-identity-convergence.js";

const d1SeedChecksumPath = "data/d1_seed.sql";
const canonicalSha256Pattern = /^sha256:[0-9a-f]{64}$/;
const githubRepositoryPattern = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const positiveDecimalIntegerPattern = /^[1-9][0-9]*$/;
const gitShaPattern = /^[0-9a-f]{6,64}$/;
const bundleNamePattern = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const utcTimestampPattern = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;
type ProductionArtifactManifest = Pick<ArtifactManifest, "schema_version" | "git_sha" | "checksums" | "feedback">;

export interface BuildProductionReleaseEvidenceOptions {
  manifestPath: string;
  d1SeedPath: string;
  smokeResultPath: string;
  identityResultPath: string;
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
  schema_version: "production_release_evidence.v2";
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
    feedback_rules_version: "feedback_rules.v0.1";
    feedback_vote_snapshot_checksum: string;
    feedback_processing_plan_checksum: string;
  };
  smoke: {
    passed: true;
    total: number;
    passed_checks: number;
    failed: 0;
  };
  identity: {
    expected_release_id: string;
    actual_release_id: string;
    expected_commit_sha: string;
    actual_commit_sha: string;
    expected_server_version: string;
    actual_server_version: string;
    convergence_attempts: number;
    convergence_started_at: string;
    converged_at: string;
  };
  generated_at: string;
}

export async function buildProductionReleaseEvidence(
  options: BuildProductionReleaseEvidenceOptions
): Promise<ProductionReleaseEvidence> {
  validateReleaseMetadata(options);
  const workerBaseUrl = parseProductionWorkerOrigin(options.workerBaseUrl);
  const [manifestContents, d1SeedContents, smokeResultContents, identityResultContents] = await Promise.all([
    readFile(options.manifestPath),
    readFile(options.d1SeedPath),
    readFile(options.smokeResultPath),
    readFile(options.identityResultPath)
  ]);
  const manifest = parseArtifactManifest(manifestContents);
  const smokeResult = parseMcpSmokeResult(smokeResultContents);
  const identityResult = parseReleaseIdentityResult(identityResultContents);
  const d1SeedSha256 = sha256(d1SeedContents);
  const expectedMcpEndpoint = `${workerBaseUrl}/api/mcp`;

  if (manifest.git_sha !== options.gitSha) {
    throw new Error("manifest git_sha must match GitHub SHA.");
  }
  if (manifest.checksums[d1SeedChecksumPath] !== d1SeedSha256) {
    throw new Error("D1 seed checksum must match artifact manifest.");
  }
  if (!manifest.feedback || manifest.feedback.rules_version !== "feedback_rules.v0.1") throw new Error("Feedback release evidence is required.");
  if (manifest.checksums["data/feedback_processing_plan.json"] !== manifest.feedback.processing_plan_checksum) {
    throw new Error("Feedback processing plan checksum must match artifact manifest.");
  }
  if (normalizeMcpEndpoint(smokeResult.endpoint) !== expectedMcpEndpoint) {
    throw new Error("MCP smoke endpoint must match the production Worker MCP endpoint.");
  }
  if (identityResult.version_url !== `${workerBaseUrl}/api/version`) {
    throw new Error("Release identity endpoint must match the production Worker version endpoint.");
  }
  if (identityResult.expected.release_id !== options.releaseTag || identityResult.actual.release_id !== options.releaseTag) {
    throw new Error("Expected and actual release identity must match the GitHub release tag.");
  }
  if (identityResult.expected.commit_sha !== options.gitSha || identityResult.actual.commit_sha !== options.gitSha) {
    throw new Error("Expected and actual release commit must match the GitHub SHA.");
  }
  const expectedServerVersion = registryVersionFromTag(options.releaseTag);
  if (smokeResult.identity.expected_server_version !== expectedServerVersion
    || smokeResult.identity.actual_server_version !== expectedServerVersion) {
    throw new Error("Expected and actual MCP server version must match the GitHub release tag.");
  }

  return {
    schema_version: "production_release_evidence.v2",
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
      d1_seed_sha256: d1SeedSha256,
      feedback_rules_version: manifest.feedback.rules_version,
      feedback_vote_snapshot_checksum: manifest.feedback.vote_snapshot_checksum,
      feedback_processing_plan_checksum: manifest.feedback.processing_plan_checksum
    },
    smoke: {
      passed: true,
      total: smokeResult.summary.total,
      passed_checks: smokeResult.summary.passed,
      failed: 0
    },
    identity: {
      expected_release_id: identityResult.expected.release_id,
      actual_release_id: identityResult.actual.release_id,
      expected_commit_sha: identityResult.expected.commit_sha,
      actual_commit_sha: identityResult.actual.commit_sha,
      expected_server_version: smokeResult.identity.expected_server_version,
      actual_server_version: smokeResult.identity.actual_server_version,
      convergence_attempts: identityResult.attempts,
      convergence_started_at: identityResult.started_at,
      converged_at: identityResult.converged_at
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
    `- Checksums: manifest=${markdownInline(evidence.bundle.manifest_sha256)} d1_seed=${markdownInline(evidence.bundle.d1_seed_sha256)} feedback_plan=${markdownInline(evidence.bundle.feedback_processing_plan_checksum)}`,
    `- MCP smoke: PASS ${evidence.smoke.passed_checks}/${evidence.smoke.total}`,
    `- Release identity: ${markdownInline(evidence.identity.actual_release_id)} sha=${markdownInline(evidence.identity.actual_commit_sha)} mcp=${markdownInline(evidence.identity.actual_server_version)} attempts=${evidence.identity.convergence_attempts}`,
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
    checksums: value.checksums as Record<string, string>,
    feedback: parseFeedbackManifest(value.feedback)
  };
}

function parseFeedbackManifest(value: unknown): NonNullable<ArtifactManifest["feedback"]> {
  if (!isPlainObject(value) || value.rules_version !== "feedback_rules.v0.1"
    || typeof value.vote_snapshot_checksum !== "string" || !canonicalSha256Pattern.test(value.vote_snapshot_checksum)
    || typeof value.processing_plan_checksum !== "string" || !canonicalSha256Pattern.test(value.processing_plan_checksum)) {
    throw new Error("artifact manifest feedback evidence is invalid.");
  }
  return value as unknown as NonNullable<ArtifactManifest["feedback"]>;
}

function parseMcpSmokeResult(contents: Buffer): McpSmokeResult {
  const value = parseJson(contents, "MCP smoke result");
  if (!isPlainObject(value)) {
    throw new Error("MCP smoke result must be an object.");
  }
  if (value.schema_version !== "mcp_smoke_result.v3") {
    throw new Error("MCP smoke result schema_version must be mcp_smoke_result.v3.");
  }
  if (typeof value.endpoint !== "string" || !value.endpoint || typeof value.passed !== "boolean"
    || typeof value.generated_at !== "string" || !isValidUtcTimestamp(value.generated_at)) {
    throw new Error("MCP smoke result fields must contain a valid endpoint and passed flag.");
  }
  const identity = requireRecord(value.identity, "MCP smoke identity");
  if (!isSingleLineString(identity.expected_server_version) || !isSingleLineString(identity.actual_server_version)) {
    throw new Error("MCP smoke identity must contain expected and actual server versions.");
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
  if (checkIds.some((id) => !REQUIRED_MCP_SMOKE_CHECK_IDS.includes(id))) {
    throw new Error("MCP smoke result contains unknown deployed checks.");
  }
  if (REQUIRED_MCP_SMOKE_CHECK_IDS.some((id) => !checkIds.includes(id))) {
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
    schema_version: "mcp_smoke_result.v3",
    endpoint: value.endpoint,
    identity: {
      expected_server_version: identity.expected_server_version,
      actual_server_version: identity.actual_server_version
    },
    generated_at: value.generated_at,
    passed: true,
    summary: {
      total: summary.total,
      passed,
      failed
    },
    checks: typedChecks
  };
}

function parseReleaseIdentityResult(contents: Buffer): ReleaseIdentityConvergenceResult {
  const value = parseJson(contents, "release identity convergence result");
  const result = requireRecord(value, "Release identity convergence result");
  const expected = requireRecord(result.expected, "Expected release identity");
  const actual = requireRecord(result.actual, "Actual release identity");
  if (result.schema_version !== "release_identity_convergence.v1" || result.converged !== true
    || !isSingleLineString(result.version_url)
    || !isSingleLineString(expected.release_id) || !gitShaPattern.test(String(expected.commit_sha))
    || !isSingleLineString(actual.release_id) || !gitShaPattern.test(String(actual.commit_sha))
    || !Number.isInteger(result.attempts) || (result.attempts as number) <= 0
    || !isValidUtcTimestamp(result.started_at) || !isValidUtcTimestamp(result.converged_at)) {
    throw new Error("Release identity convergence result is invalid.");
  }
  return result as unknown as ReleaseIdentityConvergenceResult;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isPlainObject(value)) throw new Error(`${label} must be an object.`);
  return value;
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
