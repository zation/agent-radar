export interface McpSmokeChecklistArtifact {
  schema_version: "mcp_smoke_checklist.v1";
  endpoint: "/api/mcp";
  generated_for: "deployment_review";
  summary: {
    total: number;
    required: number;
  };
  checks: Array<{
    id: string;
    required: true;
    method: "initialize" | "tools/list" | "tools/call" | "http_method_guard";
    expected: string;
  }>;
}

export function buildMcpSmokeChecklistArtifact(): McpSmokeChecklistArtifact {
  const checks: McpSmokeChecklistArtifact["checks"] = [
    {
      id: "mcp-initialize",
      required: true,
      method: "initialize",
      expected: "JSON-RPC result includes serverInfo.name=agent-radar and tools.listChanged=false."
    },
    {
      id: "mcp-tools-list",
      required: true,
      method: "tools/list",
      expected: "JSON-RPC result lists search_tools, get_tool_card, recommend_tools, and explain_rating with input schemas."
    },
    {
      id: "mcp-tools-call-get-tool-card",
      required: true,
      method: "tools/call",
      expected: "Calling get_tool_card with tool_id=skill-openai-docs returns text content containing tool_card_lookup_result.v1 JSON."
    },
    {
      id: "mcp-read-only-boundary",
      required: true,
      method: "http_method_guard",
      expected: "Unsupported write methods and unknown MCP tools return errors; no tool installs or executes recommended candidates."
    }
  ];

  return {
    schema_version: "mcp_smoke_checklist.v1",
    endpoint: "/api/mcp",
    generated_for: "deployment_review",
    summary: {
      total: checks.length,
      required: checks.filter((check) => check.required).length
    },
    checks
  };
}
