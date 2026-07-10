import { writeFile } from "node:fs/promises";
import {
  buildProductionReleaseEvidence,
  renderProductionReleaseEvidenceMarkdown
} from "../release/production-evidence.js";

const evidence = await buildProductionReleaseEvidence({
  manifestPath: process.env.AGENT_RADAR_ARTIFACT_MANIFEST ?? "dist-pages/artifact-manifest.json",
  d1SeedPath: process.env.AGENT_RADAR_D1_SEED ?? "dist-pages/data/d1_seed.sql",
  smokeResultPath: process.env.AGENT_RADAR_MCP_SMOKE_RESULT ?? "mcp-smoke-result.json",
  repository: requireEnv("GITHUB_REPOSITORY"),
  runId: requireEnv("GITHUB_RUN_ID"),
  gitSha: requireEnv("GITHUB_SHA"),
  releaseTag: requireEnv("GITHUB_REF_NAME"),
  deploymentId: requireEnv("AGENT_RADAR_PRODUCTION_DEPLOYMENT_ID"),
  bundleName: requireEnv("AGENT_RADAR_REVIEWED_BUNDLE"),
  workerBaseUrl: requireEnv("AGENT_RADAR_WORKER_BASE_URL"),
  generatedAt: process.env.AGENT_RADAR_EVIDENCE_GENERATED_AT ?? new Date().toISOString()
});

await writeFile(
  process.env.AGENT_RADAR_PRODUCTION_EVIDENCE ?? "production-release-evidence.json",
  JSON.stringify(evidence, null, 2),
  "utf8"
);
process.stdout.write(renderProductionReleaseEvidenceMarkdown(evidence));

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
