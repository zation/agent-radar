export interface McpExamplesArtifact {
  schema_version: "mcp_examples.v1";
  endpoint: "/api/mcp";
  transport: "http_json_rpc";
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
    schema_version: "mcp_examples.v1",
    endpoint: "/api/mcp",
    transport: "http_json_rpc",
    examples: [
      {
        name: "initialize",
        description: "Start an MCP JSON-RPC session with the Agent Radar read-only server.",
        request: {
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {}
        }
      },
      {
        name: "tools/list",
        description: "List the read-only Agent Radar tools exposed through MCP.",
        request: {
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
          params: {}
        }
      },
      {
        name: "tools/call:get_tool_card",
        description: "Fetch one Tool Card and its Rating Result by a tool_id discovered from search_tools.",
        request: {
          jsonrpc: "2.0",
          id: "get-tool-card-example",
          method: "tools/call",
          params: {
            name: "get_tool_card",
            arguments: {
              tool_id: "<tool_id from tools/call:search_tools>"
            }
          }
        }
      },
      {
        name: "tools/call:search_tools",
        description: "Search Agent Radar Tool Cards from an MCP client.",
        request: {
          jsonrpc: "2.0",
          id: "search-tools-example",
          method: "tools/call",
          params: {
            name: "search_tools",
            arguments: {
              query: "browser screenshot",
              top_k: 3
            }
          }
        }
      }
    ]
  };
}
