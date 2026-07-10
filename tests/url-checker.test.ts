import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkippedToolCardUrlValidationV2,
  checkToolCardUrlsV2,
  type ToolCardUrlValidationArtifactV2,
} from "../src/validation/url-checker.js";
import type { ToolCard } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

function card(urls: string[]): ToolCard {
  return {
    ...reviewedToolCardFixtures[0],
    id: "url-v2-card",
    source_urls: urls,
    docs_url: undefined,
    repo_url: undefined,
    homepage_url: undefined,
    package_urls: [],
    install_methods: [],
  };
}

test("URL checker v2 classifies HTTP results and falls back from HEAD to GET", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = init?.method ?? "GET";
    calls.push({ url, method });
    if (url.endsWith("/ok")) return Promise.resolve(new Response("ok", { status: 200 }));
    if (url.endsWith("/auth")) return Promise.resolve(new Response("", { status: 403 }));
    if (url.endsWith("/missing")) return Promise.resolve(new Response("", { status: 404 }));
    if (url.endsWith("/fallback") && method === "HEAD") return Promise.resolve(new Response("", { status: 405 }));
    if (url.endsWith("/fallback") && method === "GET") return Promise.resolve(new Response("ok", { status: 200 }));
    return Promise.reject(new Error("unexpected request"));
  };

  const artifact = await checkToolCardUrlsV2(
    [card([
      "https://example.com/ok",
      "https://example.com/auth",
      "https://example.com/missing",
      "https://example.com/fallback",
    ])],
    {
      fetchImpl,
      checkedAt: "2026-07-10T00:00:00Z",
      sleepImpl: () => Promise.resolve(),
    },
  );

  assert.equal(artifact.schema_version, "tool_card_url_validation.v2");
  assert.equal(artifact.items.find((item) => item.url.endsWith("/ok"))?.status, "reachable");
  assert.equal(artifact.items.find((item) => item.url.endsWith("/auth"))?.status, "auth_required");
  assert.equal(artifact.items.find((item) => item.url.endsWith("/missing"))?.status, "permanent_failure");
  assert.equal(artifact.items.find((item) => item.url.endsWith("/fallback"))?.method, "GET");
  assert.ok(calls.some((call) => call.url.endsWith("/fallback") && call.method === "HEAD"));
  assert.ok(calls.some((call) => call.url.endsWith("/fallback") && call.method === "GET"));
});

test("URL checker v2 retries transient errors and carries forward failure history", async () => {
  let attempts = 0;
  const fetchImpl: typeof fetch = () => {
    attempts += 1;
    return Promise.resolve(new Response("", { status: 503 }));
  };
  const previous: ToolCardUrlValidationArtifactV2 = {
    schema_version: "tool_card_url_validation.v2",
    generated_at: "2026-07-09T00:00:00Z",
    options: { enabled: true, timeout_ms: 5000, max_retries: 2 },
    items: [{
      tool_id: "url-v2-card",
      field_path: "source_urls[0]",
      url: "https://example.com/flaky",
      status: "transient_error",
      reason_code: "http_503",
      method: "HEAD",
      http_status: 503,
      redirects: [],
      checked_at: "2026-07-09T00:00:00Z",
      attempt_count: 3,
      consecutive_failure_count: 1,
      history_status: "no_baseline",
      critical: true,
    }],
    summary: {
      reachable: 0,
      permanent_failure: 0,
      auth_required: 0,
      rate_limited: 0,
      transient_error: 1,
      skipped: 0,
      blocking: 0,
      stale: 0,
    },
  };

  const artifact = await checkToolCardUrlsV2(
    [card(["https://example.com/flaky"])],
    {
      fetchImpl,
      checkedAt: "2026-07-10T00:00:00Z",
      previousArtifact: previous,
      sleepImpl: () => Promise.resolve(),
    },
  );
  const item = artifact.items[0];

  assert.equal(attempts, 3);
  assert.equal(item?.status, "transient_error");
  assert.equal(item?.attempt_count, 3);
  assert.equal(item?.consecutive_failure_count, 2);
  assert.equal(item?.history_status, "continued");
  assert.equal(artifact.summary.blocking, 1);
});

test("URL checker v2 skips credential-bearing and non-HTTP URLs without requesting them", async () => {
  let calls = 0;
  const fetchImpl: typeof fetch = () => {
    calls += 1;
    return Promise.resolve(new Response("ok"));
  };

  const artifact = await checkToolCardUrlsV2(
    [card(["https://user:secret@example.com/private", "internal://manual-review/source"])],
    {
      fetchImpl,
      checkedAt: "2026-07-10T00:00:00Z",
      sleepImpl: () => Promise.resolve(),
    },
  );

  assert.equal(calls, 0);
  assert.deepEqual(
    artifact.items.map((item) => [item.status, item.reason_code]),
    [
      ["permanent_failure", "url_contains_credentials"],
      ["skipped", "non_http_url"],
    ],
  );
  assert.equal(artifact.summary.blocking, 1);
});

test("URL checker v2 produces explicit skipped results when disabled", () => {
  const artifact = buildSkippedToolCardUrlValidationV2(
    [card(["https://example.com/docs"])],
    "2026-07-10T00:00:00Z",
    "url_reachability_check_not_enabled",
  );

  assert.equal(artifact.options.enabled, false);
  assert.equal(artifact.items[0]?.status, "skipped");
  assert.equal(artifact.items[0]?.reason_code, "url_reachability_check_not_enabled");
});
