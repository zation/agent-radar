import { isDeepStrictEqual } from "node:util";
import { readFile } from "node:fs/promises";
import { validateMcpRegistryArtifactBinding, validateMcpRegistryReleaseInputs } from "../release/mcp-registry-release.js";
import { buildProductionReleaseEvidence } from "../release/production-evidence.js";

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? fallback : process.argv[index + 1];
  if (!value) throw new Error(`Missing required ${name}`);
  return value;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

const productionEvidencePath = option("--production-evidence", "source-evidence/production-release-evidence.json");
const smokeResultPath = option("--smoke-result", "source-evidence/mcp-smoke-result.json");
const repository = option("--repository");
const runId = option("--run-id");
const releaseTag = option("--release-tag");
const gitSha = option("--git-sha");
const metadataPath = option("--metadata", "dist-pages/server.json");
const manifestPath = option("--manifest");
const productionEvidence = await readJson(productionEvidencePath);
const metadataContents = await readFile(metadataPath);
validateMcpRegistryArtifactBinding(metadataContents, await readJson(manifestPath));
const validated = validateMcpRegistryReleaseInputs(
  productionEvidence,
  await readJson(smokeResultPath),
  JSON.parse(metadataContents.toString("utf8")) as unknown,
  { repository, runId, releaseTag, gitSha }
);
const evidenceRecord = requireRecord(productionEvidence, "Production evidence");
const deployment = requireRecord(evidenceRecord.deployment, "Production deployment evidence");
const bundle = requireRecord(evidenceRecord.bundle, "Production bundle evidence");
const rebuilt = await buildProductionReleaseEvidence({
  manifestPath,
  d1SeedPath: option("--d1-seed"),
  smokeResultPath,
  repository,
  runId,
  gitSha,
  releaseTag,
  deploymentId: requireString(deployment.id, "Production deployment ID"),
  bundleName: requireString(bundle.artifact_name, "Production bundle name"),
  workerBaseUrl: validated.workerBaseUrl,
  generatedAt: requireString(evidenceRecord.generated_at, "Production evidence timestamp")
});
if (!isDeepStrictEqual(rebuilt, productionEvidence)) {
  throw new Error("Production evidence must exactly match the rebuilt reviewed-bundle evidence");
}
process.stdout.write(`MCP Registry release inputs valid: ${validated.mcpEndpoint}\n`);

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value) throw new Error(`${label} must be a non-empty string`);
  return value;
}
