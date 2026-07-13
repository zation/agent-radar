export interface McpExamplesArtifact {
  schema_version: "mcp_examples.v2";
  endpoint: "/api/mcp";
  transport: "streamable-http";
  request_headers: {
    accept: "application/json, text/event-stream";
    content_type: "application/json";
    optional_secret_header: "X-Agent-Radar-LLM-API-Key";
  };
  examples: Array<{
    name: string;
    description: string;
    request: {
      jsonrpc: "2.0";
      id: string | number;
      method: "initialize" | "tools/list" | "tools/call";
      params: Record<string, unknown>;
    };
  }>;
}

export function buildMcpExamplesArtifact(): McpExamplesArtifact {
  return {
    schema_version: "mcp_examples.v2",
    endpoint: "/api/mcp",
    transport: "streamable-http",
    request_headers: {
      accept: "application/json, text/event-stream",
      content_type: "application/json",
      optional_secret_header: "X-Agent-Radar-LLM-API-Key"
    },
    examples: [
      {
        name: "initialize",
        description: "Negotiate a stateless 2025-era MCP request with the official SDK endpoint.",
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "example-client", version: "1.0.0" } }
        }
      },
      {
        name: "tools/list",
        description: "List the four read-only Agent Radar tools.",
        request: { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }
      },
      {
        name: "tools/call:search_tools",
        description: "Search rated Tool Cards; text content and structuredContent contain the same object.",
        request: {
          jsonrpc: "2.0", id: "search-tools-example", method: "tools/call",
          params: { name: "search_tools", arguments: { query: "browser screenshot", top_k: 3 } }
        }
      },
      {
        name: "tools/call:get_tool_card",
        description: "Return one Tool Card and Rating Result using a tool_id discovered by search_tools.",
        request: {
          jsonrpc: "2.0", id: "get-tool-card-example", method: "tools/call",
          params: { name: "get_tool_card", arguments: { tool_id: "<tool_id from search_tools>" } }
        }
      },
      {
        name: "tools/call:explain_rating",
        description: "Explain the evidence and dimensions behind one rated Tool Card.",
        request: {
          jsonrpc: "2.0", id: "explain-rating-example", method: "tools/call",
          params: { name: "explain_rating", arguments: { tool_id: "<tool_id from search_tools>" } }
        }
      },
      {
        name: "tools/call:recommend_tools",
        description: "Recommend tools. Supply the Provider key only in X-Agent-Radar-LLM-API-Key when no server fallback is configured.",
        request: {
          jsonrpc: "2.0", id: "recommend-tools-example", method: "tools/call",
          params: { name: "recommend_tools", arguments: { task: "Choose a browser automation MCP server", risk_tolerance: "low" } }
        }
      }
    ]
  };
}
