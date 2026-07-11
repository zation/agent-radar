import assert from "node:assert/strict";
import test from "node:test";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import { rateAllToolCards } from "../src/rating/engine.js";
import { createToolViewModels, loadUiArtifacts, parseJsonl } from "../src/ui/data.js";

test("parses JSONL records for browser-loaded artifacts", () => {
  const jsonl = `${JSON.stringify({ id: "a" })}\n${JSON.stringify({ id: "b" })}\n`;

  assert.deepEqual(parseJsonl<{ id: string }>(jsonl), [{ id: "a" }, { id: "b" }]);
});

test("creates tool view models with ratings and default sort", () => {
  const viewModels = createToolViewModels(reviewedToolCardFixtures, rateAllToolCards(reviewedToolCardFixtures));

  assert.equal(viewModels[0].rating.overall_score >= viewModels.at(-1)!.rating.overall_score, true);
  assert.ok(viewModels.every((model) => model.card.id === model.rating.tool_id));
});

test("loads golden query definitions without retired Review page artifacts", async () => {
  const firstCard = reviewedToolCardFixtures[0];
  assert.ok(firstCard);
  const cards = `${JSON.stringify(firstCard)}\n`;
  const ratings = `${JSON.stringify(rateAllToolCards([firstCard])[0])}\n`;
  const requestedUrls: string[] = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    requestedUrls.push(url);
    if (url === "/data/tool_cards.jsonl") return Promise.resolve(new Response(cards));
    if (url === "/data/ratings.jsonl") return Promise.resolve(new Response(ratings));
    if (url === "/data/eval_summary.json") {
      return Promise.resolve(
        Response.json({
          passed: 1,
          total: 1,
          results: [],
          critical: { total: 4, passed: 4, failed: 0, release_blocking: false },
          release: { release_id: "all-v0.3.3", commit_sha: "abcdef123456" }
        })
      );
    }
    if (url === "/data/golden_queries.json") {
      return Promise.resolve(
        Response.json([{
          id: "gq-gmail-task-summary",
          schema_version: "eval_case.v1",
          category: "recommendation",
          query: { task: "在 Codex 中读取 Gmail 并总结待办", risk_tolerance: "low" },
          expected: { recommended_action: "ask_human", must_warn_permissions: ["email"] },
          review_notes: "邮件内容敏感，必须要求用户确认授权范围。",
          severity: "major",
          owner: "agent-radar",
          updated_at: "2026-07-06T00:00:00Z"
        }])
      );
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`));
  };

  try {
    const artifacts = await loadUiArtifacts();

    assert.ok(requestedUrls.includes("/data/golden_queries.json"));
    assert.equal(requestedUrls.includes("/data/source_registry_review_requests.json"), false);
    assert.equal(artifacts.goldenQueries[0]?.id, "gq-gmail-task-summary");
    assert.equal(artifacts.evalSummary.release.release_id, "all-v0.3.3");
    assert.equal(artifacts.evalSummary.critical.total, 4);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports missing UI artifacts with the local data generation command", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    return Promise.resolve(new Response(`missing ${url}`, { status: 404, statusText: "Not Found" }));
  };

  try {
    await assert.rejects(loadUiArtifacts(), /Missing UI artifact \/data\/tool_cards\.jsonl.*npm run dev:data/s);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("reports Vite HTML fallback as an unavailable UI artifact", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = () =>
    Promise.resolve(
      new Response("<!doctype html><html></html>", {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" }
      })
    );

  try {
    await assert.rejects(
      loadUiArtifacts(),
      /UI data artifact \/data\/tool_cards\.jsonl is unavailable.*npm run dev:data/s
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wraps malformed JSON artifact errors with regeneration guidance", async () => {
  const firstCard = reviewedToolCardFixtures[0];
  assert.ok(firstCard);
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/data/tool_cards.jsonl") return Promise.resolve(new Response(`${JSON.stringify(firstCard)}\n`));
    if (url === "/data/ratings.jsonl") {
      return Promise.resolve(new Response(`${JSON.stringify(rateAllToolCards([firstCard])[0])}\n`));
    }
    if (url === "/data/eval_summary.json") {
      return Promise.resolve(new Response("{broken", { headers: { "content-type": "application/json" } }));
    }
    return Promise.resolve(Response.json({ schema_version: "source_registry_review_requests.v1", items: [] }));
  };

  try {
    await assert.rejects(
      loadUiArtifacts(),
      /UI data artifact \/data\/eval_summary\.json could not be parsed.*npm run dev:data/s
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("wraps malformed JSONL artifact errors with regeneration guidance", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (url === "/data/tool_cards.jsonl") return Promise.resolve(new Response("{broken\n"));
    if (url === "/data/ratings.jsonl") return Promise.resolve(new Response(""));
    if (url === "/data/eval_summary.json") return Promise.resolve(Response.json({ passed: 0, total: 0, results: [] }));
    return Promise.resolve(Response.json({ schema_version: "source_registry_review_requests.v1", items: [] }));
  };

  try {
    await assert.rejects(
      loadUiArtifacts(),
      /UI data artifact \/data\/tool_cards\.jsonl could not be parsed.*npm run dev:data/s
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
