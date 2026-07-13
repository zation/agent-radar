import { buildMcpSmokeChecklistArtifact } from "./mcp-smoke-checklist.js";
import { REQUIRED_MCP_SMOKE_CHECK_IDS, type McpSmokeCheckId } from "./mcp-smoke-contract.js";
import { MCP_TOOL_NAMES } from "./tool-contracts.js";

export { REQUIRED_MCP_SMOKE_CHECK_IDS } from "./mcp-smoke-contract.js";

export interface McpSmokeCheckResult {
  id: McpSmokeCheckId;
  passed: boolean;
  message: string;
}

export interface McpSmokeResult {
  schema_version: "mcp_smoke_result.v2";
  endpoint: string;
  release_id: string;
  commit_sha: string;
  generated_at: string;
  passed: boolean;
  summary: { total: number; passed: number; failed: number };
  checks: McpSmokeCheckResult[];
}

export interface RunMcpSmokeTestOptions {
  baseUrl: string;
  releaseId?: string;
  commitSha?: string;
  generatedAt?: string;
  fetchImpl?: typeof fetch;
}

interface JsonRpcResponse {
  jsonrpc?: string;
  id?: string | number | null;
  result?: unknown;
  error?: { code?: number; message?: string };
}

interface McpToolCallResult {
  isError?: boolean;
  content?: Array<{ type?: string; text?: string }>;
  structuredContent?: unknown;
}

export async function runMcpSmokeTest(options: RunMcpSmokeTestOptions): Promise<McpSmokeResult> {
  const endpoint = new URL(buildMcpSmokeChecklistArtifact().endpoint, normalizeBaseUrl(options.baseUrl)).toString();
  const fetchImpl = options.fetchImpl ?? fetch;
  const checks: McpSmokeCheckResult[] = [
    await runCheck("initialize", () => checkInitialize(endpoint, fetchImpl)),
    await runCheck("tools-list", () => checkToolsList(endpoint, fetchImpl)),
    await runCheck("search-tools", () => checkSearchTools(endpoint, fetchImpl)),
    await runCheck("get-tool-card", () => checkGetToolCard(endpoint, fetchImpl)),
    await runCheck("explain-rating", () => checkExplainRating(endpoint, fetchImpl)),
    await runCheck("recommend-missing-key", () => checkRecommendMissingKey(endpoint, fetchImpl)),
    await runCheck("write-method-rejected", () => checkReadOnlyBoundary(endpoint, fetchImpl))
  ];
  if (checks.some((check, index) => check.id !== REQUIRED_MCP_SMOKE_CHECK_IDS[index])) {
    throw new Error("MCP smoke runner order must match the required smoke contract.");
  }
  const passed = checks.filter((check) => check.passed).length;
  return {
    schema_version: "mcp_smoke_result.v2",
    endpoint,
    release_id: options.releaseId ?? "unknown",
    commit_sha: options.commitSha ?? "unknown",
    generated_at: options.generatedAt ?? new Date().toISOString(),
    passed: passed === checks.length,
    summary: { total: checks.length, passed, failed: checks.length - passed },
    checks
  };
}

async function runCheck(
  id: McpSmokeCheckResult["id"],
  check: () => Promise<string>
): Promise<McpSmokeCheckResult> {
  try {
    return { id, passed: true, message: await check() };
  } catch (error) {
    return { id, passed: false, message: error instanceof Error ? error.message : "Unknown smoke check failure." };
  }
}

async function checkInitialize(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "agent-radar-smoke", version: "0.6.2" }
    }
  });
  const result = response.result as { serverInfo?: { name?: string; version?: string }; capabilities?: { tools?: unknown } } | undefined;
  if (result?.serverInfo?.name !== "io.github.zation/agent-radar") {
    throw new Error("initialize result must include serverInfo.name=io.github.zation/agent-radar.");
  }
  if (!result.capabilities || !("tools" in result.capabilities)) {
    throw new Error("initialize result must advertise the tools capability.");
  }
  return `initialize returned Agent Radar serverInfo version ${result.serverInfo.version ?? "unknown"}.`;
}

async function checkToolsList(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const tools = (response.result as { tools?: Array<{ name?: string; inputSchema?: unknown; annotations?: { readOnlyHint?: boolean } }> } | undefined)?.tools ?? [];
  for (const name of MCP_TOOL_NAMES) {
    const tool = tools.find((candidate) => candidate.name === name);
    if (!tool?.inputSchema) throw new Error(`tools/list result missing inputSchema for ${name}.`);
    if (tool.annotations?.readOnlyHint !== true) throw new Error(`tools/list result must mark ${name} read-only.`);
  }
  return "tools/list returned all shared read-only Agent Radar tool schemas.";
}

async function checkSearchTools(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const toolId = await discoverSmokeToolId(endpoint, fetchImpl);
  return `search_tools returned catalog tool_id=${toolId}.`;
}

async function checkGetToolCard(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const toolId = await discoverSmokeToolId(endpoint, fetchImpl);
  const payload = await callSuccessfulTool(endpoint, fetchImpl, "get_tool_card", { tool_id: toolId });
  if (payload.schema_version !== "tool_card_lookup_result.v1") throw new Error("get_tool_card must return tool_card_lookup_result.v1.");
  if ((payload.tool_card as { id?: string } | undefined)?.id !== toolId) throw new Error("get_tool_card must return the discovered tool_id.");
  return `get_tool_card returned ${toolId}.`;
}

async function checkExplainRating(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const toolId = await discoverSmokeToolId(endpoint, fetchImpl);
  const payload = await callSuccessfulTool(endpoint, fetchImpl, "explain_rating", { tool_id: toolId });
  if (payload.schema_version !== "rating_explanation_result.v1" || payload.tool_id !== toolId) {
    throw new Error("explain_rating must return rating_explanation_result.v1 for the discovered tool_id.");
  }
  return `explain_rating returned ${toolId}.`;
}

async function checkRecommendMissingKey(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const response = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: "recommend-missing-key-smoke",
    method: "tools/call",
    params: { name: "recommend_tools", arguments: { task: "choose a safe tool" } }
  });
  const result = readToolResult(response, "recommend_tools");
  if (result.isError !== true) throw new Error("recommend_tools without a key must return isError=true.");
  const payload = readMatchingStructuredContent(result, "recommend_tools");
  if (payload.code !== "missing_provider_key") throw new Error("recommend_tools without a key must return missing_provider_key.");
  return "recommend_tools returned a safe missing_provider_key Tool Result.";
}

async function checkReadOnlyBoundary(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const deleteResponse = await fetchImpl(endpoint, { method: "DELETE" });
  if (deleteResponse.status < 400) throw new Error("DELETE /api/mcp must be rejected.");
  const unknown = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: "unknown-tool-smoke",
    method: "tools/call",
    params: { name: "install_tool", arguments: {} }
  });
  const toolError = (unknown.result as McpToolCallResult | undefined)?.isError === true;
  if (!unknown.error && !toolError) throw new Error("Unknown write-like MCP tools must be rejected.");
  return "DELETE and unknown write-like MCP tools were rejected.";
}

async function discoverSmokeToolId(endpoint: string, fetchImpl: typeof fetch): Promise<string> {
  const payload = await callSuccessfulTool(endpoint, fetchImpl, "search_tools", { query: "", top_k: 1 });
  const results = payload.results as Array<{ tool_id?: string }> | undefined;
  const toolId = results?.find((result) => typeof result.tool_id === "string" && result.tool_id.length > 0)?.tool_id;
  if (!toolId) throw new Error("search_tools must return at least one tool_id.");
  return toolId;
}

async function callSuccessfulTool(
  endpoint: string,
  fetchImpl: typeof fetch,
  name: string,
  args: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const response = await postJsonRpc(endpoint, fetchImpl, {
    jsonrpc: "2.0",
    id: `${name}-smoke`,
    method: "tools/call",
    params: { name, arguments: args }
  });
  const result = readToolResult(response, name);
  if (result.isError) throw new Error(`${name} returned isError=true.`);
  return readMatchingStructuredContent(result, name);
}

function readToolResult(response: JsonRpcResponse, toolName: string): McpToolCallResult {
  if (response.error) throw new Error(`${toolName} call failed: ${response.error.message ?? response.error.code ?? "unknown error"}.`);
  const result = response.result as McpToolCallResult | undefined;
  if (!result?.content) throw new Error(`${toolName} call must return Tool Result content.`);
  return result;
}

function readMatchingStructuredContent(result: McpToolCallResult, toolName: string): Record<string, unknown> {
  const text = result.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new Error(`${toolName} must return text content.`);
  const parsed = JSON.parse(text) as unknown;
  if (!isPlainObject(parsed) || !isPlainObject(result.structuredContent)) {
    throw new Error(`${toolName} must return object structuredContent.`);
  }
  if (JSON.stringify(parsed) !== JSON.stringify(result.structuredContent)) {
    throw new Error(`${toolName} text content must match structuredContent.`);
  }
  return result.structuredContent;
}

async function postJsonRpc(
  endpoint: string,
  fetchImpl: typeof fetch,
  body: Record<string, unknown>
): Promise<JsonRpcResponse> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) throw new Error(`POST ${endpoint} failed with HTTP ${response.status}.`);
  return readJsonRpcResponse(response);
}

async function readJsonRpcResponse(response: Response): Promise<JsonRpcResponse> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    if (!data) throw new Error("MCP SSE response did not contain a data frame.");
    return JSON.parse(data) as JsonRpcResponse;
  }
  return JSON.parse(text) as JsonRpcResponse;
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) throw new Error("AGENT_RADAR_MCP_BASE_URL is required for MCP smoke tests.");
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
