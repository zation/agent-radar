import assert from "node:assert/strict";
import test from "node:test";
import {
  EvalTokenUsageCollector,
  validateEvalTokenUsageArtifact,
  type EvalTokenUsageArtifact,
} from "../src/eval/token-usage.js";
import { unavailableProviderUsage } from "../src/recommendation/provider-usage.js";

const release = { release_id: "all-v0.7.0", commit_sha: "abc123" };

function reported(input: number, cached: number | null, output: number, total: number) {
  return { status: "reported" as const, input_tokens: input, cached_input_tokens: cached, output_tokens: output, total_tokens: total };
}

test("builds deterministic case and attempt ordering with retry totals", () => {
  const collector = new EvalTokenUsageCollector({
    caseIds: ["gq-b", "gq-a"],
    generatedAt: "2026-07-14T00:00:00.000Z",
    release,
  });
  collector.record({ case_id: "gq-b", attempt: 1, provider: "minimax", model_identifier: "MiniMax-M3", outcome: "completed", failure_category: "none", usage: reported(20, null, 2, 22) });
  collector.record({ case_id: "gq-a", attempt: 2, provider: "minimax", model_identifier: "MiniMax-M3", outcome: "completed", failure_category: "none", usage: reported(12, 4, 3, 15) });
  collector.record({ case_id: "gq-a", attempt: 1, provider: "minimax", model_identifier: "MiniMax-M3", outcome: "schema_error", failure_category: "schema_error", usage: reported(10, 2, 1, 11) });

  const artifact = collector.build([
    { case_id: "gq-b", execution_status: "completed" },
    { case_id: "gq-a", execution_status: "completed" },
  ]);

  assert.deepEqual(artifact.cases.map(({ case_id }) => case_id), ["gq-a", "gq-b"]);
  assert.deepEqual(artifact.cases[0]?.attempts.map(({ attempt }) => attempt), [1, 2]);
  assert.deepEqual(artifact.summary, {
    case_count: 2,
    request_attempts: 3,
    reported_attempts: 3,
    unavailable_attempts: 0,
    retry_count: 1,
    input_tokens: 42,
    cached_input_tokens: 6,
    cached_usage_available_attempts: 2,
    output_tokens: 6,
    total_tokens: 48,
    average_total_tokens_per_reported_attempt: 16,
  });
});

test("counts unavailable retries without inventing token totals", () => {
  const collector = new EvalTokenUsageCollector({ caseIds: ["gq-a"], generatedAt: "2026-07-14T00:00:00.000Z", release });
  collector.record({ case_id: "gq-a", attempt: 1, provider: "openai", model_identifier: "gpt-4.1", outcome: "provider_error", failure_category: "provider_error", usage: unavailableProviderUsage("request_failed") });
  collector.record({ case_id: "gq-a", attempt: 2, provider: "openai", model_identifier: "gpt-4.1", outcome: "completed", failure_category: "none", usage: reported(8, null, 2, 10) });

  const artifact = collector.build([{ case_id: "gq-a", execution_status: "completed" }]);

  assert.equal(artifact.summary.request_attempts, 2);
  assert.equal(artifact.summary.reported_attempts, 1);
  assert.equal(artifact.summary.unavailable_attempts, 1);
  assert.equal(artifact.summary.retry_count, 1);
  assert.equal(artifact.summary.total_tokens, 10);
  assert.equal(artifact.summary.average_total_tokens_per_reported_attempt, 10);
});

test("represents blocked evaluation with zero attempts", () => {
  const collector = new EvalTokenUsageCollector({ caseIds: ["gq-a"], generatedAt: "2026-07-14T00:00:00.000Z", release });
  const artifact = collector.build([{ case_id: "gq-a", execution_status: "blocked_no_key" }]);

  assert.equal(artifact.cases[0]?.execution_status, "blocked_no_key");
  assert.deepEqual(artifact.cases[0]?.attempts, []);
  assert.equal(artifact.summary.request_attempts, 0);
  assert.equal(artifact.summary.average_total_tokens_per_reported_attempt, null);
});

test("rejects duplicate and unknown attempt identities", () => {
  const collector = new EvalTokenUsageCollector({ caseIds: ["gq-a"], generatedAt: "2026-07-14T00:00:00.000Z", release });
  const attempt = { case_id: "gq-a", attempt: 1, provider: "openai", model_identifier: "gpt-4.1", outcome: "completed" as const, failure_category: "none" as const, usage: reported(1, null, 1, 2) };
  collector.record(attempt);
  assert.throws(() => collector.record(attempt), /duplicate/i);
  assert.throws(() => collector.record({ ...attempt, case_id: "gq-unknown" }), /unknown/i);
});

test("validator rejects release, ordering, arithmetic, and attempt tampering", () => {
  const collector = new EvalTokenUsageCollector({ caseIds: ["gq-a", "gq-b"], generatedAt: "2026-07-14T00:00:00.000Z", release });
  collector.record({ case_id: "gq-a", attempt: 1, provider: "openai", model_identifier: "gpt-4.1", outcome: "completed", failure_category: "none", usage: reported(5, 1, 1, 6) });
  collector.record({ case_id: "gq-b", attempt: 1, provider: "openai", model_identifier: "gpt-4.1", outcome: "completed", failure_category: "none", usage: reported(7, null, 2, 9) });
  const artifact = collector.build([{ case_id: "gq-a", execution_status: "completed" }, { case_id: "gq-b", execution_status: "completed" }]);

  assert.throws(() => validateEvalTokenUsageArtifact(artifact, { ...release, commit_sha: "wrong" }), /release/i);
  const reversed = clone(artifact);
  reversed.cases.reverse();
  assert.throws(() => validateEvalTokenUsageArtifact(reversed), /order/i);
  const badTotal = clone(artifact);
  badTotal.summary.total_tokens += 1;
  assert.throws(() => validateEvalTokenUsageArtifact(badTotal), /summary|total/i);
  const badAttempt = clone(artifact);
  badAttempt.cases[0]!.attempts[0]!.usage.total_tokens = 99;
  assert.throws(() => validateEvalTokenUsageArtifact(badAttempt), /case|summary|total/i);
});

function clone(value: EvalTokenUsageArtifact): EvalTokenUsageArtifact {
  return JSON.parse(JSON.stringify(value)) as EvalTokenUsageArtifact;
}
