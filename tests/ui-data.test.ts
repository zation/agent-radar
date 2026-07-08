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

test("loads source registry review requests for the review page", async () => {
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
          results: []
        })
      );
    }
    if (url === "/data/source_registry_review_requests.json") {
      return Promise.resolve(
        Response.json({
          schema_version: "source_registry_review_requests.v1",
          generated_at: "2026-07-08T00:00:00Z",
          summary: {
            pending_review: 1,
            confirmation_required: 1
          },
          items: [
            {
              source_id: "github-topic-mcp",
              field: "enabled",
              reason: "Enabled source changes crawler scope.",
              confirmation_required: true,
              decision_options: ["confirmed", "rejected", "needs_changes"],
              review_record_template: {
                id: "source-review-github-topic-mcp-enabled",
                schema_version: "source_registry_review_record.v1",
                source_id: "github-topic-mcp",
                field: "enabled",
                required_fields: ["decision", "reason", "reviewer", "reviewed_at"]
              }
            }
          ]
        })
      );
    }
    return Promise.reject(new Error(`Unexpected fetch ${url}`));
  };

  try {
    const artifacts = await loadUiArtifacts();

    assert.ok(requestedUrls.includes("/data/source_registry_review_requests.json"));
    assert.equal(artifacts.sourceReviewRequests.summary.pending_review, 1);
    assert.equal(artifacts.sourceReviewRequests.items[0]?.review_record_template.id, "source-review-github-topic-mcp-enabled");
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
    await assert.rejects(loadUiArtifacts(), /Missing UI artifact \/data\/tool_cards\.jsonl.*npm run dev:with-data/s);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
