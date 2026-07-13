import { writeFile } from "node:fs/promises";
import { buildMcpRegistryPublicationEvidence } from "../release/mcp-registry-evidence.js";

function option(name: string, fallback?: string): string {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? fallback : process.argv[index + 1];
  if (!value) throw new Error(`Missing required ${name}`);
  return value;
}

const outputPath = option("--output", "mcp-registry-publication-evidence.json");
const evidence = await buildMcpRegistryPublicationEvidence({
  productionEvidencePath: option("--production-evidence", "production-release-evidence.json"),
  metadataPath: option("--metadata", "server.json"),
  registryResponsePath: option("--registry-response"),
  repository: option("--repository"),
  runId: option("--run-id"),
  releaseTag: option("--release-tag"),
  gitSha: option("--git-sha"),
  registryQueryUrl: option("--registry-query-url"),
  registryQueriedAt: option("--registry-queried-at")
});

await writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
process.stdout.write(`MCP Registry publication evidence written to ${outputPath}\n`);
