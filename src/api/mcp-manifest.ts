import * as z from "zod/v4";
import { MCP_TOOL_NAMES, toolContracts, type ToolName } from "./tool-contracts.js";

export interface McpToolManifest {
  schema_version: "mcp_tool_manifest.v1";
  transport: "streamable-http";
  base_path: "/api";
  tools: Array<{
    name: "search_tools" | "get_tool_card" | "recommend_tools" | "explain_rating";
    description: string;
    method: "GET_OR_POST" | "POST";
    path: string;
    read_only: true;
    input_schema: Record<string, unknown>;
    output_schema: Record<string, unknown>;
    annotations: {
      readOnlyHint: true;
      destructiveHint: false;
      idempotentHint: boolean;
    };
  }>;
}

export function buildMcpToolManifest(): McpToolManifest {
  return {
    schema_version: "mcp_tool_manifest.v1",
    transport: "streamable-http",
    base_path: "/api",
    tools: MCP_TOOL_NAMES.map(buildManifestTool)
  };
}

function buildManifestTool(name: ToolName): McpToolManifest["tools"][number] {
  const contract = toolContracts[name];
  return {
    name,
    description: contract.description,
    method: contract.http.method,
    path: contract.http.path,
    read_only: true,
    input_schema: z.toJSONSchema(contract.input),
    output_schema: z.toJSONSchema(contract.output),
    annotations: contract.annotations
  };
}
