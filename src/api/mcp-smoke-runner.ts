import { buildMcpSmokeChecklistArtifact } from "./mcp-smoke-checklist.js";

export interface McpSmokeCheckResult {
  id: string;
  passed: boolean;
  message: string;
}

export interface McpSmokeResult {
  schema_version: "mcp_smoke_result.v1";
  endpoint: string;
  passed: boolean;
  summary: {
    total: number;
    passed: number;
    failed: number;
  };
  checks: McpSmokeCheckResult[];
}

export interface RunMcpSmokeTestOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface McpInitializeResult {
  serverInfo?: { name?: string };
  capabilities?: { tools?: { listChanged?: boolean } };
}

interface McpToolsListResult {
  tools?: Array<{ name?: string; inputSchema?: unknown }>;
}

interface McpToolCallResult {
  content?: Array<{ type?: string; text?: string }>;
}

interface ToolCardLookupResult {
  schema_version?: string;
  tool_card?: { id?: string };
}

const expectedToolNames = ["search_tools", "get_tool_card", "recommend_tools", "explain_rating"];

export async function runMcpSmokeTest(options: RunMcpSmokeTestOptions): Promise<McpSmokeResult> {
  const endpoint = new URL(buildMcpSmokeChecklistArtifact().endpoint, normalizeBaseUrl(options.baseUrl)).toString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks = [
    await runCheck("mcp-initialize", () => checkInitialize(endpoint, fetchImpl)),
    await runCheck("mcp-tools-list", () => checkToolsList(endpoint, fetchImpl)),
    await runCheck("mcp-tools-call-get-tool-card", () => checkGetToolCard(endpoint, fetchImpl)),
    await runCheck("mcp-read-only-boundary", () => checkReadOnlyBoundary(endpoint, fetchImpl))
  ];
  const passed = checks.filter((check) => check.passed).length;

  return {
    schema_version: "mcp_smoke_result.v1",
    endpoint,
    passed: passed === checks.length,
    summary: {
      total: checks.length,
      passed,
      failed: checks.length - passed
    },
    checks
  };
}

async function runCheck(id: string, check: () => Promise<string>): Promise<McpSmokeCheckResult> {
  try {
    return { id, passed: true, message: await check() };
  } catch (error) {
    return { id, passed: false, message: error instanceof Error ? error.message : "Unknown smoke check failure." };
  }
}

async function checkInitialize(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, { jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  const result = response.result as McpInitializeResult | undefined;
  if (result?.serverInfo?.name !== "agent-radar") throw new Error("initialize result must include serverInfo.name=agent-radar.");
  if (result.capabilities?.tools?.listChanged !== false) throw new Error("initialize result must include capabilities.tools.listChanged=false.");
  return "initialize returned agent-radar serverInfo and stable tools capability.";
}

async function checkToolsList(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const result = response.result as McpToolsListResult | undefined;
  const tools = result?.tools ?? [];
  for (const name of expectedToolNames) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool) throw new Error(`tools/list result missing ${name}.`);
    if (!tool.inputSchema) throw new Error(`tools/list result missing inputSchema for ${name}.`);
  }
  return "tools/list returned all read-only Agent Radar tool schemas.";
}

async function checkGetToolCard(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: "get-tool-card-smoke",
    method: "tools/call",
    params: {
      name: "get_tool_card",
      arguments: {
        tool_id: "skill-openai-docs"
      }
    }
  });
  const result = response.result as McpToolCallResult | undefined;
  const text = result?.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error("get_tool_card call must return text content.");
  const payload = JSON.parse(text) as ToolCardLookupResult;
  if (payload.schema_version !== "tool_card_lookup_result.v1") throw new Error("get_tool_card content must contain tool_card_lookup_result.v1 JSON.");
  if (payload.tool_card?.id !== "skill-openai-docs") throw new Error("get_tool_card content must return skill-openai-docs.");
  return "tools/call get_tool_card returned the expected Tool Card lookup payload.";
}

async function checkReadOnlyBoundary(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const deleteResponse = await fetchImpl(endpoint, { method: "DELETE" });
  if (deleteResponse.status < 400) throw new Error("DELETE /api/mcp must be rejected.");

  const unknownTool = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: "unknown-tool-smoke",
    method: "tools/call",
    params: {
      name: "install_tool",
      arguments: {}
    }
  });
  if (!unknownTool.error?.message?.includes("Unknown MCP tool")) throw new Error("Unknown MCP tools must return a JSON-RPC error.");
  return "write-like HTTP methods and unknown MCP tools were rejected.";
}

async function postJsonRpc(endpoint: string, fetchImpl: typeof fetch, body: Record<string, unknown>): Promise<JsonRpcResponse> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`POST ${endpoint} failed with HTTP ${response.status}.`);
  const payload = (await response.json()) as JsonRpcResponse;
  if (payload.error && body.method !== "tools/call") throw new Error(`JSON-RPC ${String(body.method)} failed: ${payload.error.message ?? payload.error.code ?? "unknown error"}.`);
  return payload;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("AGENT_RADAR_MCP_BASE_URL is required for MCP smoke tests.");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}
