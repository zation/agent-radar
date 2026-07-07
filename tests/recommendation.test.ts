import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { createOpenAiRecommendationClient, normalizeApiKey, recommendTools, resolveModelRequest, type RecommendationLlmClient } from "../src/recommendation/engine.js";
import { rateAllToolCards } from "../src/rating/engine.js";

const ratings = rateAllToolCards(seedToolCards);

test("routes MiniMax model labels to the MiniMax chat completions endpoint", () => {
  assert.deepEqual(resolveModelRequest("MiniMax M3"), {
    endpoint: "https://api.minimax.io/v1/chat/completions",
    instructionRole: "system",
    model: "MiniMax-M3",
    provider: "minimax"
  });
});

test("keeps OpenAI model labels on the OpenAI chat completions endpoint", () => {
  assert.deepEqual(resolveModelRequest("OpenAI GPT-4.1"), {
    endpoint: "https://api.openai.com/v1/chat/completions",
    instructionRole: "developer",
    model: "gpt-4.1",
    provider: "openai"
  });
});

test("routes DeepSeek model labels to the DeepSeek chat completions endpoint", () => {
  assert.deepEqual(resolveModelRequest("DeepSeek V4 Pro"), {
    endpoint: "https://api.deepseek.com/chat/completions",
    instructionRole: "system",
    model: "deepseek-v4-pro",
    provider: "deepseek"
  });
});

test("normalizes provider API keys before building authorization headers", () => {
  assert.equal(normalizeApiKey(" Bearer minimax-secret "), "minimax-secret");
  assert.equal(normalizeApiKey("minimax-secret"), "minimax-secret");
});

test("sends MiniMax requests with a single bearer authorization header", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: { model?: string; messages?: Array<{ role: string }> } }> = [];
  const fetchImpl: typeof fetch = (url, init) => {
    const headers = new Headers(init?.headers);
    const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const requestBody = typeof init?.body === "string" ? init.body : "{}";
    calls.push({
      url: requestUrl,
      authorization: headers.get("authorization"),
      body: JSON.parse(requestBody) as { model?: string; messages?: Array<{ role: string }> }
    });
    return Promise.resolve(new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] }) } }]
      })
    ));
  };
  const client = createOpenAiRecommendationClient(fetchImpl);

  await client.recommend({ apiKey: " Bearer minimax-secret ", model: "MiniMax M3", prompt: "{}" });

  assert.equal(calls[0]?.url, "https://api.minimax.io/v1/chat/completions");
  assert.equal(calls[0]?.authorization, "Bearer minimax-secret");
  assert.equal(calls[0]?.body.model, "MiniMax-M3");
  assert.equal(calls[0]?.body.messages?.[0]?.role, "system");
});

test("builds recommendations from an LLM client response", async () => {
  const calls: Array<{ apiKey: string; model: string; prompt: string }> = [];
  const client: RecommendationLlmClient = {
    recommend(input) {
      calls.push(input);
      return Promise.resolve({
        recommended_action: "compare",
        query_understanding: {
          intent: "testing",
          task_domains: ["testing"],
          required_capabilities: ["test_strategy"],
          likely_permissions: ["filesystem"],
          tool_type_hints: ["skill"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [
          {
            tool_id: "skill-test-driven-development",
            fit_score: 91,
            why: ["LLM selected the test workflow for coverage work."],
            risks: ["filesystem:write - may edit project tests."],
            next_steps: ["Start with a failing coverage test."]
          }
        ],
        rejected_candidates: [{ tool_id: "mcp-browser-automation", reason: "Not needed for test coverage." }]
      });
    }
  };

  const result = await recommendTools(
    {
      task: "为一个 Python 项目增加测试覆盖率",
      language_or_stack: ["python"],
      risk_tolerance: "medium",
      top_k: 3
    },
    seedToolCards,
    ratings,
    { apiKey: "sk-test-secret", model: "gpt-4.1", client }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.apiKey, "sk-test-secret");
  assert.equal(calls[0]?.model, "gpt-4.1");
  assert.match(calls[0]?.prompt ?? "", /skill-test-driven-development/);
  assert.equal(result.schema_version, "recommendation_result.v1");
  assert.equal(result.recommended_action, "compare");
  assert.equal(result.candidates[0]?.tool_id, "skill-test-driven-development");
  assert.equal(result.candidates[0]?.name, "Test Driven Development Skill");
  assert.equal(result.candidates[0]?.fit_score, 91);
  assert.ok(result.candidates[0]?.evidence_refs.some((ref) => ref.startsWith("rating:skill-test-driven-development")));
});

test("does not allow the LLM to recommend unknown tool ids", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "use",
        query_understanding: {
          intent: "unknown_tool",
          task_domains: [],
          required_capabilities: [],
          likely_permissions: [],
          tool_type_hints: ["agent"],
          risk_flags: [],
          confidence: "low"
        },
        candidates: [{ tool_id: "made-up-tool", why: ["Unknown candidate."], risks: [], next_steps: [] }],
        rejected_candidates: []
      });
    }
  };

  const result = await recommendTools({ task: "pick a tool" }, seedToolCards, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.equal(result.recommended_action, "no_reliable_match");
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected_candidates[0]?.tool_id, "made-up-tool");
  assert.match(result.no_match_reason ?? "", /known tool/i);
});

test("keeps high-risk LLM recommendations behind human approval", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "use",
        query_understanding: {
          intent: "gmail_summary",
          task_domains: ["communication"],
          required_capabilities: ["email_summary"],
          likely_permissions: ["email"],
          tool_type_hints: ["mcp"],
          risk_flags: ["email"],
          confidence: "medium"
        },
        candidates: [{ tool_id: "skill-gmail-triage", why: ["Reads Gmail."], risks: ["email:read - personal data."], next_steps: [] }],
        rejected_candidates: []
      });
    }
  };

  const result = await recommendTools({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" }, seedToolCards, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.equal(result.recommended_action, "ask_human");
  assert.equal(result.candidates[0]?.risk_level, "high");
});
