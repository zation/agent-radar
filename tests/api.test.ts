import assert from "node:assert/strict";
import test from "node:test";
import { createApiHandler } from "../src/api/handler.js";
import { createStaticRepository } from "../src/api/repository.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { RecommendationProviderError } from "../src/recommendation/engine.js";
import { buildSearchIndex } from "../src/search/index-builder.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);
const repository = createStaticRepository({
  cards: reviewedToolCardFixtures,
  ratings,
  index: buildSearchIndex(reviewedToolCardFixtures, ratings)
});
const handler = createApiHandler(repository, {
  versionInfo: {
    release_id: "all-v0.2.1",
    commit_sha: "0123456789abcdef",
    data_version: "data-test",
    api_version: "api-test",
    web_version: "web-test"
  },
  recommendationClient: {
    recommend() {
      return Promise.resolve({
        recommended_action: "ask_human",
        query_understanding: {
          intent: "gmail_summary",
          task_domains: ["communication"],
          required_capabilities: ["email_summary"],
          likely_permissions: ["email"],
          tool_type_hints: ["skill"],
          risk_flags: ["email"],
          confidence: "medium"
        },
        candidates: [{ tool_id: "skill-gmail-triage", fit_score: 88, why: ["Reads Gmail."], risks: ["email:read - personal data."], next_steps: [] }],
        rejected_candidates: []
      });
    }
  }
});

interface McpManifestResponse {
  schema_version: string;
  tools: Array<{ name: string; read_only: boolean }>;
}

interface McpInitializeResponse {
  jsonrpc: string;
  id: number;
  result: {
    serverInfo: { name: string };
    capabilities: { tools: { listChanged: boolean } };
  };
}

interface McpToolsListResponse {
  result: {
    tools: Array<{ name: string; inputSchema?: unknown }>;
  };
}

interface McpToolCallResponse {
  jsonrpc: string;
  id: string;
  result: {
    content: Array<{ type: string; text: string }>;
  };
}

interface ToolCardLookupPayload {
  schema_version: string;
  tool_card: { id: string };
}

test("version endpoint returns release and component versions", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/version"));

  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    schema_version: string;
    service: string;
    release_id: string;
    data_version: string;
    api_version: string;
    web_version: string;
  };
  assert.deepEqual(body, {
    schema_version: "agent_radar_version.v1",
    service: "agent-radar",
    release_id: "all-v0.2.1",
    commit_sha: "0123456789abcdef",
    data_version: "data-test",
    api_version: "api-test",
    web_version: "web-test"
  });
});

test("search_tools returns summaries with match reasons", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/search_tools", {
      method: "POST",
      body: JSON.stringify({ query: "browser screenshot", top_k: 2 })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schema_version, "search_tools_result.v1");
  assert.equal(body.results[0].tool_id, "mcp-browser-automation");
  assert.ok(body.results[0].matched_fields.length > 0);
});

test("get_tool_card returns card and rating", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/get_tool_card?tool_id=skill-openai-docs"));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tool_card.id, "skill-openai-docs");
  assert.equal(body.rating.tool_id, "skill-openai-docs");
});

test("recommend_tools returns recommendation result", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/recommend_tools", {
      method: "POST",
      headers: { "X-Agent-Radar-LLM-API-Key": "sk-test-secret" },
      body: JSON.stringify({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low", model: "gpt-4.1" })
    })
  );

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.schema_version, "recommendation_result.v2");
  assert.deepEqual(body.release, { release_id: "all-v0.2.1", commit_sha: "0123456789abcdef" });
  assert.equal(body.recommended_action, "ask_human");
});

test("recommend_tools rejects legacy body credentials without echoing them", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/recommend_tools", {
      method: "POST",
      body: JSON.stringify({ task: "choose", api_key: "legacy-secret" })
    })
  );

  assert.equal(response.status, 400);
  const body = await response.text();
  assert.match(body, /X-Agent-Radar-LLM-API-Key/);
  assert.equal(body.includes("legacy-secret"), false);
});

test("recommend_tools requires BYOK credentials", async () => {
  const originalApiKey = process.env.AGENT_RADAR_LLM_API_KEY;
  const originalModel = process.env.AGENT_RADAR_LLM_MODEL;

  try {
    delete process.env.AGENT_RADAR_LLM_API_KEY;
    delete process.env.AGENT_RADAR_LLM_MODEL;
    const response = await handler(
      new Request("https://agent-radar.test/api/recommend_tools", {
        method: "POST",
        body: JSON.stringify({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" })
      })
    );

    assert.equal(response.status, 400);
    const body = (await response.json()) as { error: string; message: string };
    assert.equal(body.error, "missing_provider_key");
    assert.match(body.message, /API key/);
    assert.match(body.message, /recommend_tools/);
  } finally {
    if (originalApiKey === undefined) delete process.env.AGENT_RADAR_LLM_API_KEY;
    else process.env.AGENT_RADAR_LLM_API_KEY = originalApiKey;
    if (originalModel === undefined) delete process.env.AGENT_RADAR_LLM_MODEL;
    else process.env.AGENT_RADAR_LLM_MODEL = originalModel;
  }
});

test("recommend_tools falls back to explicitly configured environment credentials", async () => {
  const calls: Array<{ apiKey: string; model: string }> = [];
  const envHandler = createApiHandler(repository, {
    fallbackLlmApiKey: "env-secret",
    fallbackModel: "MiniMax M3",
    recommendationClient: {
      recommend(input) {
        calls.push({ apiKey: input.apiKey, model: input.model });
        return Promise.resolve({
          recommended_action: "compare",
          candidates: [{
            tool_id: "skill-gmail-triage",
            fit_score: 82,
            why: ["Matches communication task."],
            risks: ["Requires email access."],
            next_steps: ["Ask the user to confirm Gmail scope."]
          }]
        });
      }
    }
  });

  const response = await envHandler(new Request("https://example.com/api/recommend_tools", {
    method: "POST",
    body: JSON.stringify({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" })
  }));

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ apiKey: "env-secret", model: "MiniMax M3" }]);
});

test("recommend_tools maps provider failures to stable API errors", async () => {
  const erroringHandler = createApiHandler(repository, {
    recommendationClient: {
      recommend() {
        throw new RecommendationProviderError({
          code: "provider_auth_failed",
          message: "Provider rejected the API key.",
          provider: "openai",
          status: 401
        });
      }
    }
  });

  const response = await erroringHandler(
    new Request("https://agent-radar.test/api/recommend_tools", {
      method: "POST",
      headers: { "X-Agent-Radar-LLM-API-Key": "sk-test-secret" },
      body: JSON.stringify({ task: "pick a safe tool", model: "gpt-4.1" })
    })
  );

  assert.equal(response.status, 502);
  const body = (await response.json()) as { error: string; message: string; provider?: string; provider_status?: number };
  assert.equal(body.error, "provider_auth_failed");
  assert.equal(body.message, "Provider rejected the API key.");
  assert.equal(body.provider, "openai");
  assert.equal(body.provider_status, 401);
});

test("explain_rating returns dimension explanations", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/explain_rating?tool_id=skill-test-driven-development"));

  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.tool_id, "skill-test-driven-development");
  assert.ok(body.explanations.length > 0);
});

test("mcp_manifest exposes read-only tool definitions", async () => {
  const response = await handler(new Request("https://agent-radar.test/api/mcp_manifest"));

  assert.equal(response.status, 200);
  const body = (await response.json()) as McpManifestResponse;
  assert.equal(body.schema_version, "mcp_tool_manifest.v1");
  assert.deepEqual(
    body.tools.map((tool: { name: string }) => tool.name),
    ["search_tools", "get_tool_card", "recommend_tools", "explain_rating"]
  );
  assert.equal(body.tools.every((tool: { read_only: boolean }) => tool.read_only), true);
});

test("mcp endpoint initializes and lists read-only tools", async () => {
  const initializeResponse = await handler(
    new Request("https://agent-radar.test/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} })
    })
  );

  assert.equal(initializeResponse.status, 200);
  const initializeBody = (await initializeResponse.json()) as McpInitializeResponse;
  assert.equal(initializeBody.jsonrpc, "2.0");
  assert.equal(initializeBody.id, 1);
  assert.equal(initializeBody.result.serverInfo.name, "agent-radar");
  assert.equal(initializeBody.result.capabilities.tools.listChanged, false);

  const listResponse = await handler(
    new Request("https://agent-radar.test/api/mcp", {
      method: "POST",
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
    })
  );

  assert.equal(listResponse.status, 200);
  const listBody = (await listResponse.json()) as McpToolsListResponse;
  assert.deepEqual(
    listBody.result.tools.map((tool: { name: string }) => tool.name),
    ["search_tools", "get_tool_card", "recommend_tools", "explain_rating"]
  );
  assert.equal(listBody.result.tools.every((tool: { inputSchema?: unknown }) => Boolean(tool.inputSchema)), true);
});

test("mcp endpoint calls read-only tools and returns JSON content", async () => {
  const response = await handler(
    new Request("https://agent-radar.test/api/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "call-1",
        method: "tools/call",
        params: {
          name: "get_tool_card",
          arguments: {
            tool_id: "skill-openai-docs"
          }
        }
      })
    })
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as McpToolCallResponse;
  assert.equal(body.jsonrpc, "2.0");
  assert.equal(body.id, "call-1");
  assert.equal(body.result.content[0].type, "text");
  const payload = JSON.parse(body.result.content[0]?.text ?? "{}") as ToolCardLookupPayload;
  assert.equal(payload.schema_version, "tool_card_lookup_result.v1");
  assert.equal(payload.tool_card.id, "skill-openai-docs");
});

test("rejects unsupported writes and unknown routes", async () => {
  const writeResponse = await handler(new Request("https://agent-radar.test/api/get_tool_card", { method: "DELETE" }));
  const unknownResponse = await handler(new Request("https://agent-radar.test/api/unknown"));

  assert.equal(writeResponse.status, 405);
  assert.equal(unknownResponse.status, 404);
});
