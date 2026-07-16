import { runMcpSmokeTest } from "../api/mcp-smoke-runner.js";
import { registryVersionFromTag } from "../release/mcp-registry.js";

const baseUrl = process.env.AGENT_RADAR_MCP_BASE_URL ?? "";
const releaseTag = process.env.AGENT_RADAR_RELEASE_ID ?? process.env.GITHUB_REF_NAME ?? "";
const result = await runMcpSmokeTest({
  baseUrl,
  expectedServerVersion: process.env.AGENT_RADAR_EXPECTED_MCP_SERVER_VERSION ?? registryVersionFromTag(releaseTag),
  generatedAt: process.env.AGENT_RADAR_MCP_SMOKE_GENERATED_AT
});

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exitCode = 1;
}
