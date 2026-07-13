import assert from "node:assert/strict";
import test from "node:test";
import { REQUIRED_MCP_SMOKE_CHECK_IDS, runMcpSmokeTest } from "../src/api/mcp-smoke-runner.js";

interface SmokeRequestBody {
  id?: string | number;
  method?: string;
  params?: { name?: string; arguments?: { tool_id?: string } };
}

test("MCP smoke runner verifies all deployed SDK and read-only boundaries", async () => {
  const requests: Array<{ method: string; body?: SmokeRequestBody; accept?: string }> = [];
  const fetchImpl: typeof fetch = (_input, init) => {
    const body: SmokeRequestBody | undefined = typeof init?.body === "string" ? JSON.parse(init.body) as SmokeRequestBody : undefined;
    const headers = new Headers(init?.headers);
    requests.push({ method: init?.method ?? "GET", body, accept: headers.get("accept") ?? undefined });
    if (init?.method === "DELETE") return Promise.resolve(jsonResponse({ error: "method_not_allowed" }, 405));

    if (body?.method === "initialize") {
      return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: body.id, result: {
        serverInfo: { name: "io.github.zation/agent-radar", version: "0.6.3" }, capabilities: { tools: {} }
      } }));
    }
    if (body?.method === "tools/list") {
      return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: body.id, result: { tools: [
        "search_tools", "get_tool_card", "recommend_tools", "explain_rating"
      ].map((name) => ({ name, inputSchema: { type: "object" }, annotations: { readOnlyHint: true } })) } }));
    }
    if (body?.method === "tools/call" && body.params?.name === "search_tools") {
      return Promise.resolve(toolResult(body.id, { schema_version: "search_tools_result.v1", results: [{ tool_id: "mcp-live-catalog-tool" }] }));
    }
    if (body?.method === "tools/call" && body.params?.name === "get_tool_card") {
      return Promise.resolve(toolResult(body.id, {
        schema_version: "tool_card_lookup_result.v1", tool_card: { id: body.params.arguments?.tool_id }
      }));
    }
    if (body?.method === "tools/call" && body.params?.name === "explain_rating") {
      return Promise.resolve(toolResult(body.id, {
        schema_version: "rating_explanation_result.v1", tool_id: body.params.arguments?.tool_id
      }));
    }
    if (body?.method === "tools/call" && body.params?.name === "recommend_tools") {
      return Promise.resolve(toolResult(body.id, {
        code: "missing_provider_key", message: "recommend_tools requires an LLM provider API key."
      }, true));
    }
    return Promise.resolve(jsonResponse({ jsonrpc: "2.0", id: body?.id, error: { code: -32602, message: "Tool not found" } }));
  };

  const result = await runMcpSmokeTest({
    baseUrl: "https://agent-radar.example/",
    releaseId: "all-v0.6.3",
    commitSha: "abc123",
    generatedAt: "2026-07-13T12:00:00Z",
    fetchImpl
  });

  assert.equal(result.schema_version, "mcp_smoke_result.v2");
  assert.equal(result.endpoint, "https://agent-radar.example/api/mcp");
  assert.equal(result.release_id, "all-v0.6.3");
  assert.equal(result.commit_sha, "abc123");
  assert.equal(result.generated_at, "2026-07-13T12:00:00Z");
  assert.equal(result.passed, true);
  assert.deepEqual(result.summary, { total: 7, passed: 7, failed: 0 });
  assert.deepEqual(result.checks.map((check) => check.id), REQUIRED_MCP_SMOKE_CHECK_IDS);
  assert.equal(requests.filter((request) => request.method === "POST").every((request) => request.accept === "application/json, text/event-stream"), true);
  assert.equal(requests.some((request) => request.method === "DELETE"), true);
});

test("MCP smoke runner records all failed deployed checks without leaking response bodies", async () => {
  const result = await runMcpSmokeTest({
    baseUrl: "https://agent-radar.example",
    releaseId: "all-v0.6.3",
    commitSha: "abc123",
    generatedAt: "2026-07-13T12:00:00Z",
    fetchImpl: () => Promise.resolve(jsonResponse({ secret: "must-not-leak" }, 500))
  });

  assert.equal(result.passed, false);
  assert.equal(result.summary.failed, 7);
  assert.equal(JSON.stringify(result).includes("must-not-leak"), false);
});

function toolResult(id: string | number | undefined, output: Record<string, unknown>, isError = false): Response {
  return jsonResponse({ jsonrpc: "2.0", id, result: {
    ...(isError ? { isError: true } : {}),
    content: [{ type: "text", text: JSON.stringify(output) }],
    structuredContent: output
  } });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
