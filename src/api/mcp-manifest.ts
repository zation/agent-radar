export interface McpToolManifest {
  schema_version: "mcp_tool_manifest.v1";
  transport: "http_json";
  base_path: "/api";
  tools: Array<{
    name: "search_tools" | "get_tool_card" | "recommend_tools" | "explain_rating";
    description: string;
    method: "GET_OR_POST" | "POST";
    path: string;
    read_only: true;
    input_schema: Record<string, unknown>;
  }>;
}

export function buildMcpToolManifest(): McpToolManifest {
  return {
    schema_version: "mcp_tool_manifest.v1",
    transport: "http_json",
    base_path: "/api",
    tools: [
      {
        name: "search_tools",
        description: "Search Agent Radar Tool Cards by query text and optional type, tag, or risk filters.",
        method: "GET_OR_POST",
        path: "/api/search_tools",
        read_only: true,
        input_schema: objectSchema({
          query: { type: "string" },
          top_k: { type: "number" },
          filters: {
            type: "object",
            properties: {
              type: { type: "string" },
              tags: { type: "array", items: { type: "string" } },
              risk_level: { type: "string" }
            }
          }
        })
      },
      {
        name: "get_tool_card",
        description: "Return one Tool Card and its Rating Result by stable tool_id.",
        method: "GET_OR_POST",
        path: "/api/get_tool_card",
        read_only: true,
        input_schema: objectSchema({ tool_id: { type: "string" } }, ["tool_id"])
      },
      {
        name: "recommend_tools",
        description: "Recommend known tools for a task using BYOK LLM credentials supplied only for the request.",
        method: "POST",
        path: "/api/recommend_tools",
        read_only: true,
        input_schema: objectSchema(
          {
            task: { type: "string" },
            risk_tolerance: { type: "string", enum: ["low", "medium", "high"] },
            preferred_tool_types: { type: "array", items: { type: "string" } },
            allowed_permissions: { type: "array", items: { type: "string" } },
            api_key: {
              type: "string",
              description: "Optional when AGENT_RADAR_LLM_API_KEY is configured in the local or server environment."
            },
            model: {
              type: "string",
              description: "Optional; defaults to AGENT_RADAR_LLM_MODEL or the provider registry default model."
            }
          },
          ["task"]
        )
      },
      {
        name: "explain_rating",
        description: "Return rating dimensions, explanations, penalties, and boosts for one tool_id.",
        method: "GET_OR_POST",
        path: "/api/explain_rating",
        read_only: true,
        input_schema: objectSchema({ tool_id: { type: "string" } }, ["tool_id"])
      }
    ]
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false
  };
}
