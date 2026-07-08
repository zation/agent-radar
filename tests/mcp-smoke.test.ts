import assert from "node:assert/strict";
import test from "node:test";
import { runMcpSmokeTest } from "../src/api/mcp-smoke-runner.js";

test("mcp smoke runner verifies the deployed JSON-RPC endpoint and read-only boundary", async () => {
  const requests: Array<{ url: string; method: string; body?: unknown }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    requests.push({ url, method, body });

    if (method === "DELETE") {
      return Promise.resolve(jsonResponse({ error: "method_not_allowed" }, 405));
    }

    const rpcMethod = body?.method as string | undefined;
    if (rpcMethod === "initialize") {
      return Promise.resolve(jsonResponse({
        jsonrpc: "2.0",
        id: body?.id,
        result: {
          serverInfo: { name: "agent-radar" },
          capabilities: { tools: { listChanged: false } }
        }
      }));
    }

    if (rpcMethod === "tools/list") {
      return Promise.resolve(jsonResponse({
        jsonrpc: "2.0",
        id: body?.id,
        result: {
          tools: [
            { name: "search_tools", inputSchema: { type: "object" } },
            { name: "get_tool_card", inputSchema: { type: "object" } },
            { name: "recommend_tools", inputSchema: { type: "object" } },
            { name: "explain_rating", inputSchema: { type: "object" } }
          ]
        }
      }));
    }

    if (rpcMethod === "tools/call" && body?.params?.name === "get_tool_card") {
      return Promise.resolve(jsonResponse({
        jsonrpc: "2.0",
        id: body.id,
        result: {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                schema_version: "tool_card_lookup_result.v1",
                tool_card: { id: "skill-openai-docs" }
              })
            }
          ]
        }
      }));
    }

    return Promise.resolve(jsonResponse({
      jsonrpc: "2.0",
      id: body?.id,
      error: { code: -32000, message: "Unknown MCP tool: install_tool" }
    }));
  };

  const result = await runMcpSmokeTest({ baseUrl: "https://agent-radar.example/", fetchImpl });

  assert.equal(result.schema_version, "mcp_smoke_result.v1");
  assert.equal(result.endpoint, "https://agent-radar.example/api/mcp");
  assert.equal(result.passed, true);
  assert.deepEqual(result.summary, { total: 4, passed: 4, failed: 0 });
  assert.deepEqual(
    result.checks.map((check) => [check.id, check.passed]),
    [
      ["mcp-initialize", true],
      ["mcp-tools-list", true],
      ["mcp-tools-call-get-tool-card", true],
      ["mcp-read-only-boundary", true]
    ]
  );
  assert.equal(requests.every((request) => request.url === "https://agent-radar.example/api/mcp"), true);
  assert.equal(requests.filter((request) => request.method === "POST").length, 4);
  assert.equal(requests.some((request) => request.method === "DELETE"), true);
});

test("mcp smoke runner reports a failed check when the deployed endpoint returns an invalid response", async () => {
  const result = await runMcpSmokeTest({
    baseUrl: "https://agent-radar.example",
    fetchImpl: () =>
      Promise.resolve(jsonResponse({
        jsonrpc: "2.0",
        id: 1,
        result: {
          serverInfo: { name: "wrong-server" },
          capabilities: { tools: { listChanged: true } }
        }
      }))
  });

  assert.equal(result.passed, false);
  assert.equal(result.summary.failed, 4);
  assert.match(result.checks[0]?.message ?? "", /serverInfo.name/);
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
