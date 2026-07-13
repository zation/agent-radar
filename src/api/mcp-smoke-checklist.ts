import { REQUIRED_MCP_SMOKE_CHECK_IDS, type McpSmokeCheckId } from "./mcp-smoke-contract.js";
import { MCP_TOOL_NAMES } from "./tool-contracts.js";

export interface McpSmokeChecklistArtifact {
  schema_version: "mcp_smoke_checklist.v2";
  endpoint: "/api/mcp";
  transport: "streamable-http";
  generated_for: "deployment_review";
  summary: { total: number; required: number };
  checks: Array<{
    id: McpSmokeCheckId;
    required: true;
    method: "initialize" | "tools/list" | "tools/call" | "http_method_guard";
    expected: string;
  }>;
}

export function buildMcpSmokeChecklistArtifact(): McpSmokeChecklistArtifact {
  const checks: McpSmokeChecklistArtifact["checks"] = [
    { id: "initialize", required: true, method: "initialize", expected: "Official SDK negotiates a 2025-era stateless Streamable HTTP request and returns io.github.zation/agent-radar serverInfo." },
    { id: "tools-list", required: true, method: "tools/list", expected: `Returns ${MCP_TOOL_NAMES.join(", ")} with input schemas and readOnlyHint=true.` },
    { id: "search-tools", required: true, method: "tools/call", expected: "search_tools returns matching JSON text and structuredContent with at least one current tool_id." },
    { id: "get-tool-card", required: true, method: "tools/call", expected: "get_tool_card returns matching tool_card_lookup_result.v1 text and structuredContent." },
    { id: "explain-rating", required: true, method: "tools/call", expected: "explain_rating returns matching rating_explanation_result.v1 text and structuredContent." },
    { id: "recommend-missing-key", required: true, method: "tools/call", expected: "recommend_tools without the optional secret header returns isError=true and missing_provider_key without leaking credentials." },
    { id: "write-method-rejected", required: true, method: "http_method_guard", expected: "DELETE and an unknown write-like MCP tool are rejected without installing or executing candidates." }
  ];
  if (checks.some((check, index) => check.id !== REQUIRED_MCP_SMOKE_CHECK_IDS[index])) {
    throw new Error("MCP smoke checklist order must match the required smoke contract.");
  }
  return {
    schema_version: "mcp_smoke_checklist.v2",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    generated_for: "deployment_review",
    summary: { total: checks.length, required: checks.length },
    checks
  };
}
