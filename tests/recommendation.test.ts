import assert from "node:assert/strict";
import test from "node:test";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { createOpenAiRecommendationClient, normalizeApiKey, RecommendationProviderError, recommendTools, resolveModelRequest, type RecommendationLlmClient } from "../src/recommendation/engine.js";
import { rateAllToolCards } from "../src/rating/engine.js";

const ratings = rateAllToolCards(reviewedToolCardFixtures);
const release = { release_id: "all-v0.3.2-test", commit_sha: "0123456789abcdef" };

test("routes MiniMax model labels to the MiniMax chat completions endpoint", () => {
  assert.deepEqual(resolveModelRequest("MiniMax M3"), {
    endpoint: "https://api.minimax.io/v1/chat/completions",
    instructionRole: "system",
    model: "MiniMax-M3",
    provider: "minimax"
  });
});

test("uses AGENT_RADAR_LLM_BASE_URL to override the selected provider endpoint", () => {
  const originalBaseUrl = process.env.AGENT_RADAR_LLM_BASE_URL;

  try {
    process.env.AGENT_RADAR_LLM_BASE_URL = "https://api.minimaxi.com";

    assert.deepEqual(resolveModelRequest("MiniMax M3"), {
      endpoint: "https://api.minimaxi.com/v1/chat/completions",
      instructionRole: "system",
      model: "MiniMax-M3",
      provider: "minimax"
    });
  } finally {
    if (originalBaseUrl === undefined) delete process.env.AGENT_RADAR_LLM_BASE_URL;
    else process.env.AGENT_RADAR_LLM_BASE_URL = originalBaseUrl;
  }
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
  assert.deepEqual(resolveModelRequest("DeepSeek V4 Flash"), {
    endpoint: "https://api.deepseek.com/chat/completions",
    instructionRole: "system",
    model: "deepseek-v4-flash",
    provider: "deepseek"
  });
});

test("normalizes provider API keys before building authorization headers", () => {
  assert.equal(normalizeApiKey(" Bearer minimax-secret "), "minimax-secret");
  assert.equal(normalizeApiKey("minimax-secret"), "minimax-secret");
});

test("sends MiniMax requests with a single bearer authorization header", async () => {
  const calls: Array<{ url: string; authorization: string | null; body: { model?: string; messages?: Array<{ role: string }>; thinking?: { type?: string } } }> = [];
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
  assert.deepEqual(calls[0]?.body.thinking, { type: "disabled" });
});

test("does not send MiniMax thinking controls to non-MiniMax providers", async () => {
  const calls: Array<{ body: { thinking?: { type?: string } } }> = [];
  const fetchImpl: typeof fetch = (_url, init) => {
    const requestBody = typeof init?.body === "string" ? init.body : "{}";
    calls.push({ body: JSON.parse(requestBody) as { thinking?: { type?: string } } });
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] }) } }]
        })
      )
    );
  };
  const client = createOpenAiRecommendationClient(fetchImpl);

  await client.recommend({ apiKey: "openai-secret", model: "OpenAI GPT-4.1", prompt: "{}" });

  assert.equal(calls[0]?.body.thinking, undefined);
});

test("aborts provider requests that exceed the configured timeout", async () => {
  const fetchImpl: typeof fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
    });
  const client = createOpenAiRecommendationClient(fetchImpl, 5);

  await assert.rejects(
    client.recommend({ apiKey: "sk-test", model: "OpenAI GPT-4.1", prompt: "{}" }),
    (error: unknown) =>
      error instanceof RecommendationProviderError
      && error.code === "provider_request_failed"
      && /timed out/i.test(error.message)
  );
});

test("parses fenced JSON provider responses", async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "```json",
                  "{\"recommended_action\":\"no_reliable_match\",\"candidates\":[],\"rejected_candidates\":[]}",
                  "```"
                ].join("\n")
              }
            }
          ]
        })
      )
    );
  const client = createOpenAiRecommendationClient(fetchImpl);

  const output = await client.recommend({ apiKey: "sk-test", model: "OpenAI GPT-4.1", prompt: "{}" });

  assert.deepEqual(output, {
    recommended_action: "no_reliable_match",
    candidates: [],
    rejected_candidates: []
  });
});

test("extracts recommendation JSON from provider content with thinking preface", async () => {
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: [
                  "I should inspect the catalog first, then return the requested object.",
                  "{\"recommended_action\":\"no_reliable_match\",\"candidates\":[],\"rejected_candidates\":[]}"
                ].join("\n")
              }
            }
          ]
        })
      )
    );
  const client = createOpenAiRecommendationClient(fetchImpl);

  const output = await client.recommend({ apiKey: "minimax-secret", model: "MiniMax M3", prompt: "{}" });

  assert.deepEqual(output, {
    recommended_action: "no_reliable_match",
    candidates: [],
    rejected_candidates: []
  });
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
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "gpt-4.1", client, release }
  );

  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.apiKey, "sk-test-secret");
  assert.equal(calls[0]?.model, "gpt-4.1");
  assert.match(calls[0]?.prompt ?? "", /skill-test-driven-development/);
  assert.equal(result.schema_version, "recommendation_result.v2");
  assert.deepEqual(result.release, release);
  assert.equal(result.safety_assessment.risk_level, "high");
  assert.equal(result.safety_assessment.requires_human_approval, true);
  assert.equal(result.recommended_action, "ask_human");
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

  const result = await recommendTools({ task: "pick a tool" }, reviewedToolCardFixtures, ratings, {
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

  const result = await recommendTools({ task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" }, reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.equal(result.recommended_action, "ask_human");
  assert.equal(result.candidates[0]?.risk_level, "high");
});

test("adds local permission risks when LLM candidate risks omit tool card scopes", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "use",
        query_understanding: {
          intent: "browser_validation",
          task_domains: ["web"],
          required_capabilities: ["screenshot_validation"],
          likely_permissions: [],
          tool_type_hints: ["mcp"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [
          {
            tool_id: "mcp-browser-automation",
            why: ["Can open local pages and capture screenshots."],
            risks: ["Use an isolated browser profile."],
            next_steps: ["Open the local preview and capture a screenshot."]
          }
        ],
        rejected_candidates: []
      });
    }
  };

  const result = await recommendTools({ task: "让 agent 打开本地网页并做截图验证", risk_tolerance: "medium" }, reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.ok(result.candidates[0]?.risks.some((risk) => risk.includes("browser")));
  assert.ok(result.candidates[0]?.risks.some((risk) => risk.includes("network")));
  assert.ok(result.query_understanding.likely_permissions.includes("browser"));
  assert.ok(result.query_understanding.likely_permissions.includes("network"));
});

test("infers high-risk permissions for no reliable match queries", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "no_reliable_match",
        query_understanding: {
          intent: "high_risk_production_action",
          task_domains: ["operations"],
          required_capabilities: [],
          likely_permissions: [],
          tool_type_hints: ["agent"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: [],
        no_match_reason: "No safe candidate."
      });
    }
  };

  const result = await recommendTools({ task: "自动处理线上支付退款并读取生产数据库", risk_tolerance: "low" }, reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.equal(result.recommended_action, "no_reliable_match");
  assert.ok(result.query_understanding.likely_permissions.includes("payment"));
  assert.ok(result.query_understanding.likely_permissions.includes("database"));
  assert.ok(result.query_understanding.likely_permissions.includes("secrets"));
});

test("recovers database MCP candidates when LLM over-rejects high-risk production database work", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "no_reliable_match",
        query_understanding: {
          intent: "production_database_schema_change",
          task_domains: ["database"],
          required_capabilities: ["schema_change"],
          likely_permissions: [],
          tool_type_hints: ["mcp"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: [],
        no_match_reason: "Production schema changes are high risk."
      });
    }
  };

  const result = await recommendTools(
    {
      task: "让 agent 直接修改生产 Postgres 数据库 schema",
      environment: ["production", "database"],
      risk_tolerance: "low",
      preferred_tool_types: ["mcp"]
    },
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "deepseek-v4-flash", client }
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("database")));
  assert.ok(result.query_understanding.likely_permissions.includes("database"));
  assert.ok(result.query_understanding.likely_permissions.includes("cloud"));
});

test("recovers browser automation candidates when LLM over-rejects a covered testing task", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "no_reliable_match",
        query_understanding: {
          intent: "browser_screenshot_validation",
          task_domains: ["testing"],
          required_capabilities: ["browser_automation"],
          likely_permissions: [],
          tool_type_hints: ["mcp"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: [],
        no_match_reason: "No safe browser automation candidate."
      });
    }
  };

  const result = await recommendTools(
    {
      task: "让 agent 打开本地网页并做截图验证",
      environment: ["local_dev", "browser"],
      risk_tolerance: "medium",
      preferred_tool_types: ["mcp"]
    },
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "gpt-4.1", client }
  );

  assert.notEqual(result.recommended_action, "no_reliable_match");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("browser_automation")));
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("testing")));
  assert.ok(result.query_understanding.likely_permissions.includes("browser"));
  assert.ok(result.query_understanding.likely_permissions.includes("network"));
});

test("recovers high-risk payment guidance behind human approval when LLM over-rejects covered integration work", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "no_reliable_match",
        query_understanding: {
          intent: "stripe_checkout_integration",
          task_domains: ["payment", "web_app"],
          required_capabilities: ["checkout_integration"],
          likely_permissions: [],
          tool_type_hints: ["skill"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: [],
        no_match_reason: "Payments require care."
      });
    }
  };

  const result = await recommendTools(
    {
      task: "给 Next.js 应用接入 Stripe Checkout",
      language_or_stack: ["typescript", "next.js"],
      environment: ["web_app"],
      risk_tolerance: "medium",
      preferred_tool_types: ["skill"]
    },
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "gpt-4.1", client }
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("payment")));
  assert.ok(result.query_understanding.likely_permissions.includes("payment"));
  assert.ok(result.query_understanding.likely_permissions.includes("secrets"));
  assert.ok(result.query_understanding.likely_permissions.includes("network"));
});

test("recovers database MCP candidates when LLM avoids high-risk production database work without candidates", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "avoid",
        query_understanding: {
          intent: "production_database_schema_change",
          task_domains: ["database"],
          required_capabilities: ["schema_change"],
          likely_permissions: [],
          tool_type_hints: ["mcp"],
          risk_flags: ["production_write"],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: [],
        no_match_reason: "Avoid direct production schema changes."
      });
    }
  };

  const result = await recommendTools(
    {
      task: "让 agent 直接修改生产 Postgres 数据库 schema",
      environment: ["production", "database"],
      risk_tolerance: "low",
      preferred_tool_types: ["mcp"]
    },
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "deepseek-v4-flash", client }
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("database")));
  assert.ok(result.query_understanding.likely_permissions.includes("cloud"));
});

test("recovers database MCP candidates when LLM asks for human review without candidates", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "ask_human",
        query_understanding: {
          intent: "production_postgres_schema_change",
          task_domains: ["database"],
          required_capabilities: ["schema_change"],
          likely_permissions: [],
          tool_type_hints: ["mcp"],
          risk_flags: ["human_review_required"],
          confidence: "medium"
        },
        candidates: [],
        rejected_candidates: []
      });
    }
  };

  const result = await recommendTools(
    {
      task: "让 agent 直接修改生产 Postgres 数据库 schema",
      environment: ["production", "database"],
      risk_tolerance: "low",
      preferred_tool_types: ["mcp"]
    },
    reviewedToolCardFixtures,
    ratings,
    { apiKey: "sk-test-secret", model: "deepseek-v4-flash", client }
  );

  assert.equal(result.recommended_action, "ask_human");
  assert.ok(result.candidates.some((candidate) => candidate.tags.includes("database")));
  assert.ok(result.query_understanding.likely_permissions.includes("database"));
  assert.ok(result.query_understanding.likely_permissions.includes("cloud"));
});

test("forces no reliable match for low-tolerance payment plus database operations", async () => {
  const client: RecommendationLlmClient = {
    recommend() {
      return Promise.resolve({
        recommended_action: "use",
        query_understanding: {
          intent: "production_refund_database_action",
          task_domains: ["payments", "database"],
          required_capabilities: ["refunds", "database_access"],
          likely_permissions: [],
          tool_type_hints: ["skill"],
          risk_flags: [],
          confidence: "medium"
        },
        candidates: [
          {
            tool_id: "skill-stripe-checkout-guidance",
            why: ["Official Stripe guidance is payment-related."],
            risks: [],
            next_steps: ["Read the Stripe docs."]
          }
        ],
        rejected_candidates: []
      });
    }
  };

  const result = await recommendTools({ task: "自动处理线上支付退款并读取生产数据库", risk_tolerance: "low" }, reviewedToolCardFixtures, ratings, {
    apiKey: "sk-test-secret",
    model: "gpt-4.1",
    client
  });

  assert.equal(result.recommended_action, "no_reliable_match");
  assert.equal(result.candidates.length, 0);
  assert.match(result.no_match_reason ?? "", /risk tolerance/i);
});

test("forces avoid for explicit unknown-source code execution without provider candidates", async () => {
  const result = await recommendTools(
    { task: "Execute code from an unknown source by running a remote script.", risk_tolerance: "low" },
    reviewedToolCardFixtures,
    ratings,
    {
      apiKey: "sk-test-secret",
      model: "gpt-4.1",
      client: {
        recommend() {
          return Promise.resolve({ recommended_action: "no_reliable_match", candidates: [], rejected_candidates: [] });
        }
      }
    }
  );

  assert.equal(result.recommended_action, "avoid");
  assert.ok(result.query_understanding.likely_permissions.includes("code_execution"));
  assert.ok(result.safety_assessment.reason_codes.includes("unknown_trust_code_execution"));
});
