import {
  createMcpHandler,
  McpServer,
  type CallToolResult,
  type JSONObject,
  type StandardSchemaWithJSON,
  type ToolAnnotations
} from "@modelcontextprotocol/server";
import { guardMcpRequest, type McpHttpGuardOptions } from "./mcp-http-guards.js";
import { ToolServiceError, type SafeToolErrorBody, type ToolRequestContext, type ToolService } from "./tool-service.js";
import { MCP_TOOL_NAMES, toolContracts, type ToolInput, type ToolName } from "./tool-contracts.js";

export interface McpHttpHandlerOptions extends McpHttpGuardOptions {
  serverVersion: string;
}

export function createMcpHttpHandler(
  service: ToolService,
  options: McpHttpHandlerOptions
): (request: Request) => Promise<Response> {
  const sdkHandler = createMcpHandler((context) => {
    const requestContext: ToolRequestContext = {
      llmApiKey: context.requestInfo?.headers.get("X-Agent-Radar-LLM-API-Key") ?? undefined
    };
    return createServer(service, requestContext, options.serverVersion);
  }, {
    legacy: "stateless"
  });

  return async (request: Request) => {
    const rejected = await guardMcpRequest(request, options);
    return rejected ?? sdkHandler.fetch(request);
  };
}

function createServer(service: ToolService, context: ToolRequestContext, version: string): McpServer {
  const server = new McpServer({ name: "io.github.zation/agent-radar", version });
  for (const name of MCP_TOOL_NAMES) registerTool(server, name, toolContracts[name], service, context);
  return server;
}

function registerTool<Name extends ToolName>(
  server: McpServer,
  name: Name,
  contract: {
    title: string;
    description: string;
    input: StandardSchemaWithJSON;
    output: StandardSchemaWithJSON;
    annotations: ToolAnnotations;
  },
  service: ToolService,
  context: ToolRequestContext
): void {
  const callback = async (input: unknown): Promise<CallToolResult> => {
    try {
      const output = await service.execute(name, input as ToolInput<Name>, context);
      const structuredContent = output as JSONObject;
      return {
        content: [{ type: "text" as const, text: JSON.stringify(structuredContent) }],
        structuredContent
      };
    } catch (error) {
      const safe = toSafeToolError(error) as unknown as JSONObject;
      return {
        isError: true,
        content: [{ type: "text" as const, text: JSON.stringify(safe) }],
        structuredContent: safe
      };
    }
  };
  const registerSdkTool = server.registerTool.bind(server) as unknown as (
    toolName: string,
    config: {
      title: string;
      description: string;
      inputSchema: StandardSchemaWithJSON;
      outputSchema: StandardSchemaWithJSON;
      annotations: ToolAnnotations;
    },
    toolCallback: (input: unknown) => Promise<CallToolResult>
  ) => unknown;
  registerSdkTool(name, {
    title: contract.title,
    description: contract.description,
    inputSchema: contract.input,
    outputSchema: contract.output,
    annotations: contract.annotations
  }, callback);
}

export function toSafeToolError(error: unknown): SafeToolErrorBody {
  if (error instanceof ToolServiceError) return compactError(error.body);
  return {
    code: "internal_tool_error",
    message: "The Agent Radar tool call failed.",
    recovery: "Retry the request or use the equivalent Agent Radar HTTP API."
  };
}

function compactError(body: SafeToolErrorBody): SafeToolErrorBody {
  return Object.fromEntries(
    Object.entries(body).filter((entry): entry is [string, string | number] => entry[1] !== undefined)
  ) as unknown as SafeToolErrorBody;
}
