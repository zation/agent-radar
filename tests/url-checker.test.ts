import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSkippedToolCardUrlValidationV2,
  buildToolCardUrlValidationV1FromV2,
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

test("URL checker v2 checks distinct URLs concurrently", async () => {
  let started = 0;
  let releaseRequests: (() => void) | undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequests = resolve;
  });
  const fetchImpl: typeof fetch = async () => {
    started += 1;
    await released;
    return new Response("ok", { status: 200 });
  };

  const pending = checkToolCardUrlsV2(
    [card(["https://example.com/one", "https://example.com/two"])],
    {
      fetchImpl,
      checkedAt: "2026-07-10T00:00:00Z",
      sleepImpl: () => Promise.resolve(),
    },
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  const startedBeforeRelease = started;
  releaseRequests?.();
  await pending;

  assert.equal(startedBeforeRelease, 2);
});

test("URL checker v2 refuses private targets before making a request", async () => {
  let calls = 0;
  const artifact = await checkToolCardUrlsV2([card([
    "http://127.0.0.1/admin",
    "http://169.254.169.254/latest/meta-data",
    "http://localhost/private",
  ])], {
    checkedAt: "2026-07-10T00:00:00Z",
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response("ok"));
    },
  });

  assert.equal(calls, 0);
  assert.ok(artifact.items.every((item) => item.reason_code === "private_network_target"));
  assert.equal(artifact.summary.blocking, 3);
});

test("URL checker v2 validates every redirect target before following it", async () => {
  const calls: string[] = [];
  const artifact = await checkToolCardUrlsV2([card(["https://docs.example.com/start"])], {
    checkedAt: "2026-07-10T00:00:00Z",
    fetchImpl: (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      assert.equal(init?.redirect, "manual");
      return Promise.resolve(new Response("", {
        status: 302,
        headers: { location: "http://127.0.0.1/admin" },
      }));
    },
    sleepImpl: () => Promise.resolve(),
  });

  assert.deepEqual(calls, ["https://docs.example.com/start"]);
  assert.equal(artifact.items[0]?.reason_code, "unsafe_redirect_target");
  assert.equal(artifact.summary.blocking, 1);
});

test("URL checker v2 blocks HTTPS downgrade and unrelated cross-site redirects", async () => {
  for (const location of ["http://docs.example.com/insecure", "https://unrelated.example.net/docs"]) {
    const artifact = await checkToolCardUrlsV2([card(["https://docs.example.com/start"])], {
      checkedAt: "2026-07-10T00:00:00Z",
      fetchImpl: () => Promise.resolve(new Response("", { status: 302, headers: { location } })),
      sleepImpl: () => Promise.resolve(),
    });
    assert.equal(artifact.items[0]?.reason_code, "unsafe_redirect_target");
  }
});

test("URL checker v2 follows an explicitly reviewed cross-site redirect", async () => {
  const calls: string[] = [];
  const artifact = await checkToolCardUrlsV2([card(["https://developers.openai.com/codex"])], {
    checkedAt: "2026-07-10T00:00:00Z",
    fetchImpl: (input) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
      calls.push(url);
      return Promise.resolve(url.includes("developers.openai.com")
        ? new Response("", { status: 308, headers: { location: "https://learn.chatgpt.com/docs" } })
        : new Response("ok", { status: 200 }));
    },
  });

  assert.equal(artifact.items[0]?.status, "reachable");
  assert.deepEqual(calls, ["https://developers.openai.com/codex", "https://learn.chatgpt.com/docs"]);
});

test("URL checker v2 rejects hostnames that resolve to private addresses", async () => {
  let calls = 0;
  const artifact = await checkToolCardUrlsV2([card(["https://metadata.example.test/value"])], {
    checkedAt: "2026-07-10T00:00:00Z",
    resolveHostname: () => Promise.resolve(["10.0.0.8"]),
    fetchImpl: () => {
      calls += 1;
      return Promise.resolve(new Response("ok"));
    },
  });

  assert.equal(calls, 0);
  assert.equal(artifact.items[0]?.reason_code, "private_network_target");
});

test("URL checker v2 rejects IPv6 ULA and IPv4-mapped private targets", async () => {
  const artifact = await checkToolCardUrlsV2([card(["https://safe.example.test/value"])], {
    checkedAt: "2026-07-10T00:00:00Z",
    resolveHostname: () => Promise.resolve(["fd12::1", "::ffff:127.0.0.1"]),
    fetchImpl: () => Promise.resolve(new Response("ok")),
  });
  assert.equal(artifact.items[0]?.reason_code, "private_network_target");
});

test("URL checker v2 caps distinct URL concurrency", async () => {
  let active = 0;
  let peak = 0;
  let release: (() => void) | undefined;
  const released = new Promise<void>((resolve) => { release = resolve; });
  const pending = checkToolCardUrlsV2([card(Array.from({ length: 6 }, (_, index) => `https://example.com/${index}`))], {
    checkedAt: "2026-07-10T00:00:00Z",
    maxConcurrency: 2,
    fetchImpl: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await released;
      active -= 1;
      return new Response("ok");
    },
  });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(peak, 2);
  release?.();
  await pending;
});

test("URL validation v1 migration artifact is derived without a second request pass", async () => {
  const v2 = await checkToolCardUrlsV2([card(["https://example.com/docs"])], {
    checkedAt: "2026-07-10T00:00:00Z",
    fetchImpl: () => Promise.resolve(new Response("ok")),
  });
  const v1 = buildToolCardUrlValidationV1FromV2(v2);

  assert.equal(v1.schema_version, "tool_card_url_validation.v1");
  assert.equal(v1.summary.reachable, 1);
  assert.equal(v1.items[0]?.field, "source_urls");
});
