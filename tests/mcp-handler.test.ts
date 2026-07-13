import assert from "node:assert/strict";
import test from "node:test";
import { createMcpHttpHandler } from "../src/api/mcp-handler.js";
import { createStaticRepository } from "../src/api/repository.js";
import { createToolService } from "../src/api/tool-service.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);
const repository = createStaticRepository({
  cards: reviewedToolCardFixtures,
  ratings,
  index: buildSearchIndex(reviewedToolCardFixtures, ratings)
});
const service = createToolService(repository, {
  versionInfo: { release_id: "all-v0.6.2", commit_sha: "abc123" }
});
const handler = createMcpHttpHandler(service, {
  serverVersion: "0.6.2",
  allowedHosts: ["agent-radar.test", "localhost"],
  allowedOrigins: ["https://console.agent-radar.test"]
});

function rpcRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("https://agent-radar.test/api/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      host: "agent-radar.test",
      ...headers
    },
    body: JSON.stringify(body)
  });
}

async function readRpcResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (response.headers.get("content-type")?.includes("text/event-stream")) {
    const data = text.split("\n").find((line) => line.startsWith("data: "))?.slice(6);
    assert.ok(data, `Missing SSE data frame in ${text}`);
    return JSON.parse(data) as T;
  }
  return JSON.parse(text) as T;
}

interface InitializeRpcResponse {
  result: { serverInfo: { name: string; version: string } };
}

interface ToolsListRpcResponse {
  result: {
    tools: Array<{ name: string; annotations?: { readOnlyHint?: boolean } }>;
  };
}

interface ToolCallRpcResponse {
  result: {
    isError?: boolean;
    content: Array<{ text: string }>;
    structuredContent: Record<string, unknown>;
  };
}

interface ProtocolErrorRpcResponse {
  error: { code: number };
}

test("SDK MCP handler initializes and lists the shared read-only tools", async () => {
  const initialize = await handler(rpcRequest({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "agent-radar-test", version: "1.0.0" }
    }
  }));
  assert.equal(initialize.status, 200);
  const initialized = await readRpcResponse<InitializeRpcResponse>(initialize);
  assert.equal(initialized.result.serverInfo.name, "io.github.zation/agent-radar");
  assert.equal(initialized.result.serverInfo.version, "0.6.2");

  const listed = await readRpcResponse<ToolsListRpcResponse>(await handler(rpcRequest({
    jsonrpc: "2.0", id: 2, method: "tools/list", params: {}
  })));
  assert.deepEqual(listed.result.tools.map((tool) => tool.name), [
    "search_tools", "get_tool_card", "recommend_tools", "explain_rating"
  ]);
  assert.equal(listed.result.tools.every((tool) => tool.annotations?.readOnlyHint), true);
});

test("SDK MCP tool calls return matching text and structured content", async () => {
  const calls = [
    { name: "search_tools", arguments: { query: "browser screenshot", top_k: 2 } },
    { name: "get_tool_card", arguments: { tool_id: "skill-openai-docs" } },
    { name: "explain_rating", arguments: { tool_id: "skill-openai-docs" } }
  ];

  for (const [index, params] of calls.entries()) {
    const rpc = await readRpcResponse<ToolCallRpcResponse>(await handler(rpcRequest({
      jsonrpc: "2.0", id: index + 10, method: "tools/call", params
    })));
    assert.equal(rpc.result.isError, undefined);
    assert.deepEqual(JSON.parse(rpc.result.content[0].text), rpc.result.structuredContent);
  }
});

test("recommend_tools returns a safe MCP tool error when the header is missing", async () => {
  const rpc = await readRpcResponse<ToolCallRpcResponse>(await handler(rpcRequest({
    jsonrpc: "2.0",
    id: 20,
    method: "tools/call",
    params: { name: "recommend_tools", arguments: { task: "choose" } }
  })));

  assert.equal(rpc.result.isError, true);
  assert.equal(rpc.result.structuredContent.code, "missing_provider_key");
  assert.deepEqual(JSON.parse(rpc.result.content[0].text), rpc.result.structuredContent);
});

test("SDK validates tool arguments and protocol methods", async () => {
  const invalid = await readRpcResponse<Partial<ToolCallRpcResponse & ProtocolErrorRpcResponse>>(await handler(rpcRequest({
    jsonrpc: "2.0",
    id: 30,
    method: "tools/call",
    params: { name: "recommend_tools", arguments: { task: "choose", api_key: "legacy-secret" } }
  })));
  assert.ok(invalid.error || invalid.result?.isError);
  assert.equal(JSON.stringify(invalid).includes("legacy-secret"), false);

  const unknown = await readRpcResponse<ProtocolErrorRpcResponse>(await handler(rpcRequest({
    jsonrpc: "2.0", id: 31, method: "tools/write", params: {}
  })));
  assert.equal(unknown.error.code, -32601);
});

test("MCP guards enforce method, host, origin, CORS, and body size", async () => {
  const options = await handler(new Request("https://agent-radar.test/api/mcp", {
    method: "OPTIONS",
    headers: { host: "agent-radar.test", origin: "https://agent-radar.test" }
  }));
  assert.equal(options.status, 204);
  assert.match(options.headers.get("access-control-allow-headers") ?? "", /x-agent-radar-llm-api-key/i);

  for (const method of ["GET", "DELETE", "PUT", "PATCH"]) {
    const response = await handler(new Request("https://agent-radar.test/api/mcp", {
      method,
      headers: { host: "agent-radar.test" }
    }));
    assert.equal(response.status, 405);
  }

  assert.equal((await handler(rpcRequest({}, { host: "evil.test" }))).status, 403);
  assert.equal((await handler(rpcRequest({}, { host: "user@agent-radar.test" }))).status, 403);
  assert.equal((await handler(new Request("https://evil.test/api/mcp", {
    method: "POST",
    headers: { host: "agent-radar.test", "content-type": "application/json" },
    body: "{}"
  }))).status, 403);
  assert.equal((await handler(rpcRequest({}, { origin: "https://evil.test" }))).status, 403);
  assert.notEqual((await handler(rpcRequest({}, { origin: "https://agent-radar.test" }))).status, 403);
  assert.notEqual((await handler(rpcRequest({}, { origin: "https://console.agent-radar.test" }))).status, 403);

  const atLimit = await handler(new Request("https://agent-radar.test/api/mcp", {
    method: "POST",
    headers: { host: "agent-radar.test", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: "x".repeat(65_536)
  }));
  assert.notEqual(atLimit.status, 413);
  const overLimit = await handler(new Request("https://agent-radar.test/api/mcp", {
    method: "POST",
    headers: { host: "agent-radar.test", "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: "x".repeat(65_537)
  }));
  assert.equal(overLimit.status, 413);
});

test("MCP guards allow an explicitly configured localhost host", async () => {
  const response = await handler(new Request("http://localhost:8787/api/mcp", {
    method: "OPTIONS",
    headers: { host: "localhost:8787", origin: "http://localhost:8787" }
  }));
  assert.equal(response.status, 204);
});
