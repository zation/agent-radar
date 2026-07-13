import { REQUIRED_MCP_SMOKE_CHECK_IDS } from "../api/mcp-smoke-contract.js";
import { validateMcpRegistryMetadata } from "./mcp-registry.js";

export interface McpRegistryReleaseSource {
  repository: string;
  runId: string;
  releaseTag: string;
  gitSha: string;
}

export function validateMcpRegistryReleaseInputs(
  productionEvidence: unknown,
  smokeResult: unknown,
  metadataValue: unknown,
  source: McpRegistryReleaseSource
): { workerBaseUrl: string; mcpEndpoint: string } {
  const metadata = validateMcpRegistryMetadata(metadataValue, { releaseTag: source.releaseTag });
  const endpoint = metadata.remotes[0].url;
  const endpointUrl = new URL(endpoint);
  const production = requireRecord(productionEvidence, "Production evidence");
  const github = requireRecord(production.github, "Production evidence GitHub identity");
  const deployment = requireRecord(production.deployment, "Production deployment evidence");
  const productionSmoke = requireRecord(production.smoke, "Production smoke evidence");

  if (production.schema_version !== "production_release_evidence.v1"
    || github.repository !== source.repository
    || github.run_id !== source.runId
    || github.release_tag !== source.releaseTag
    || github.sha !== source.gitSha) {
    throw new Error("Production evidence must match the selected repository, run, tag, and SHA");
  }
  if (deployment.environment !== "production" || deployment.mcp_endpoint !== endpoint) {
    throw new Error("Production MCP endpoint must match immutable Registry metadata");
  }
  if (deployment.worker_base_url !== endpointUrl.origin) {
    throw new Error("Production Worker base URL must match the Registry remote origin");
  }
  if (productionSmoke.passed !== true || productionSmoke.total !== 7
    || productionSmoke.passed_checks !== 7 || productionSmoke.failed !== 0) {
    throw new Error("Production evidence must report all seven MCP smoke checks passed");
  }

  const smoke = requireRecord(smokeResult, "Source MCP smoke result");
  const summary = requireRecord(smoke.summary, "Source MCP smoke summary");
  if (smoke.schema_version !== "mcp_smoke_result.v2") {
    throw new Error("Source MCP smoke schema_version is invalid");
  }
  if (smoke.release_id !== source.releaseTag || smoke.commit_sha !== source.gitSha) {
    throw new Error("Source MCP smoke identity must match the selected tag and SHA");
  }
  if (smoke.endpoint !== endpoint) {
    throw new Error("Source MCP smoke endpoint must match immutable Registry metadata");
  }
  if (!Array.isArray(smoke.checks)) throw new Error("Source MCP smoke must contain the exact seven checks");
  const checks = smoke.checks.map((check) => requireRecord(check, "Source MCP smoke check"));
  const ids = checks.map((check) => check.id);
  const hasExactIds = checks.length === REQUIRED_MCP_SMOKE_CHECK_IDS.length
    && new Set(ids).size === ids.length
    && REQUIRED_MCP_SMOKE_CHECK_IDS.every((id) => ids.includes(id));
  if (!hasExactIds || checks.some((check) => check.passed !== true || typeof check.message !== "string")) {
    throw new Error("Source MCP smoke must contain the exact seven checks and pass all of them");
  }
  if (smoke.passed !== true || summary.total !== 7 || summary.passed !== 7 || summary.failed !== 0) {
    throw new Error("Source MCP smoke summary must report seven passing checks");
  }

  return { workerBaseUrl: endpointUrl.origin, mcpEndpoint: endpoint };
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be a JSON object`);
  }
  return value as Record<string, unknown>;
}
