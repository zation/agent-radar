import { runMcpSmokeTest } from "../api/mcp-smoke-runner.js";

const baseUrl = process.env.AGENT_RADAR_MCP_BASE_URL ?? "";
const result = await runMcpSmokeTest({ baseUrl });

console.log(JSON.stringify(result, null, 2));

if (!result.passed) {
  process.exitCode = 1;
}
