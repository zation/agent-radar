import assert from "node:assert/strict";
import test from "node:test";
import { normalizeProviderUsage } from "../src/recommendation/provider-usage.js";

test("normalizes OpenAI-compatible prompt and completion usage", () => {
  assert.deepEqual(normalizeProviderUsage({
    prompt_tokens: 1200,
    prompt_tokens_details: { cached_tokens: 200 },
    completion_tokens: 120,
    total_tokens: 1320,
  }), {
    status: "reported",
    input_tokens: 1200,
    cached_input_tokens: 200,
    output_tokens: 120,
    total_tokens: 1320,
  });
});

test("normalizes input and output aliases", () => {
  assert.deepEqual(normalizeProviderUsage({
    input_tokens: 900,
    input_tokens_details: { cached_tokens: 100 },
    output_tokens: 90,
    total_tokens: 990,
  }), {
    status: "reported",
    input_tokens: 900,
    cached_input_tokens: 100,
    output_tokens: 90,
    total_tokens: 990,
  });
});

test("allows reported usage without cached-token details", () => {
  assert.deepEqual(normalizeProviderUsage({ prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 }), {
    status: "reported",
    input_tokens: 12,
    cached_input_tokens: null,
    output_tokens: 3,
    total_tokens: 15,
  });
});

for (const usage of [undefined, null]) {
  test(`marks ${String(usage)} usage as missing`, () => {
    assert.deepEqual(normalizeProviderUsage(usage), {
      status: "unavailable",
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      unavailable_reason: "missing_provider_usage",
    });
  });
}

for (const invalid of [-1, 1.5, "12", Number.NaN, Number.POSITIVE_INFINITY]) {
  test(`rejects invalid token value ${String(invalid)}`, () => {
    assert.deepEqual(normalizeProviderUsage({ prompt_tokens: invalid, completion_tokens: 1, total_tokens: 1 }), {
      status: "unavailable",
      input_tokens: null,
      cached_input_tokens: null,
      output_tokens: null,
      total_tokens: null,
      unavailable_reason: "invalid_provider_usage",
    });
  });
}

test("rejects malformed cached-token details", () => {
  assert.equal(normalizeProviderUsage({
    prompt_tokens: 12,
    prompt_tokens_details: { cached_tokens: -1 },
    completion_tokens: 3,
    total_tokens: 15,
  }).unavailable_reason, "invalid_provider_usage");
});
