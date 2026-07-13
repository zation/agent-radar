import { runMcpSmokeTest } from "../api/mcp-smoke-runner.js";

const baseUrl = process.env.AGENT_RADAR_MCP_BASE_URL ?? "";
const result = await runMcpSmokeTest({
  baseUrl,
  releaseId: process.env.AGENT_RADAR_RELEASE_ID ?? process.env.GITHUB_REF_NAME,
  commitSha: process.env.AGENT_RADAR_COMMIT_SHA ?? process.env.GITHUB_SHA,
  generatedAt: process.env.AGENT_RADAR_MCP_SMOKE_GENERATED_AT
});

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exitCode = 1;
}
