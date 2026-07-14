import { isDeepStrictEqual } from "node:util";
import type { NormalizedProviderUsage } from "../recommendation/provider-usage.js";

export type EvalAttemptOutcome = "completed" | "provider_error" | "schema_error";
export type EvalAttemptFailureCategory = "none" | "provider_error" | "schema_error";
export type EvalCaseExecutionStatus = "completed" | "failed" | "blocked_no_key";

export interface EvalTokenUsageAttemptInput {
  case_id: string;
  attempt: number;
  provider: string;
  model_identifier: string;
  outcome: EvalAttemptOutcome;
  failure_category: EvalAttemptFailureCategory;
  usage: NormalizedProviderUsage;
}

export type EvalTokenUsageAttempt = Omit<EvalTokenUsageAttemptInput, "case_id">;

export interface EvalTokenUsageCaseResult {
  case_id: string;
  execution_status: EvalCaseExecutionStatus;
}

export interface EvalTokenUsageCase {
  case_id: string;
  execution_status: EvalCaseExecutionStatus;
  request_attempts: number;
  reported_attempts: number;
  unavailable_attempts: number;
  retry_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  attempts: EvalTokenUsageAttempt[];
}

export interface EvalTokenUsageSummary {
  case_count: number;
  request_attempts: number;
  reported_attempts: number;
  unavailable_attempts: number;
  retry_count: number;
  input_tokens: number;
  cached_input_tokens: number;
  cached_usage_available_attempts: number;
  output_tokens: number;
  total_tokens: number;
  average_total_tokens_per_reported_attempt: number | null;
}

export interface EvalTokenUsageArtifact {
  schema_version: "eval_token_usage.v1";
  generated_at: string;
  release: { release_id: string; commit_sha: string };
  summary: EvalTokenUsageSummary;
  cases: EvalTokenUsageCase[];
}

export class EvalTokenUsageCollector {
  readonly #caseIds: Set<string>;
  readonly #generatedAt: string;
  readonly #release: { release_id: string; commit_sha: string };
  readonly #attempts: EvalTokenUsageAttemptInput[] = [];

  constructor(input: { caseIds: string[]; generatedAt: string; release: { release_id: string; commit_sha: string } }) {
    if (new Set(input.caseIds).size !== input.caseIds.length) throw new Error("eval_token_usage duplicate case id");
    if (input.caseIds.some((caseId) => !caseId.trim())) throw new Error("eval_token_usage case id must not be empty");
    this.#caseIds = new Set(input.caseIds);
    this.#generatedAt = input.generatedAt;
    this.#release = { ...input.release };
  }

  record(input: EvalTokenUsageAttemptInput): void {
    if (!this.#caseIds.has(input.case_id)) throw new Error(`eval_token_usage unknown case: ${input.case_id}`);
    if (!Number.isInteger(input.attempt) || input.attempt < 1) throw new Error("eval_token_usage attempt must be a positive integer");
    if (this.#attempts.some((item) => item.case_id === input.case_id && item.attempt === input.attempt)) {
      throw new Error(`eval_token_usage duplicate attempt: ${input.case_id}/${input.attempt}`);
    }
    this.#attempts.push({ ...input, usage: { ...input.usage } });
  }

  build(results: EvalTokenUsageCaseResult[]): EvalTokenUsageArtifact {
    const resultByCase = new Map<string, EvalTokenUsageCaseResult>();
    for (const result of results) {
      if (!this.#caseIds.has(result.case_id)) throw new Error(`eval_token_usage unknown result case: ${result.case_id}`);
      if (resultByCase.has(result.case_id)) throw new Error(`eval_token_usage duplicate result case: ${result.case_id}`);
      resultByCase.set(result.case_id, { ...result });
    }
    if (resultByCase.size !== this.#caseIds.size) throw new Error("eval_token_usage results must cover every case");

    const cases = [...this.#caseIds]
      .sort(compareText)
      .map((caseId) => buildCase(
        resultByCase.get(caseId)!,
        this.#attempts
          .filter((item) => item.case_id === caseId)
          .sort((left, right) => left.attempt - right.attempt)
          .map(({ case_id: _caseId, ...attempt }) => ({ ...attempt, usage: { ...attempt.usage } })),
      ));
    const artifact: EvalTokenUsageArtifact = {
      schema_version: "eval_token_usage.v1",
      generated_at: this.#generatedAt,
      release: { ...this.#release },
      summary: summarizeCases(cases),
      cases,
    };
    return validateEvalTokenUsageArtifact(artifact, this.#release);
  }
}

export function validateEvalTokenUsageArtifact(
  value: unknown,
  expectedRelease?: { release_id: string; commit_sha: string },
): EvalTokenUsageArtifact {
  if (!isRecord(value) || value.schema_version !== "eval_token_usage.v1") throw new Error("eval_token_usage invalid schema");
  if (typeof value.generated_at !== "string" || !value.generated_at) throw new Error("eval_token_usage invalid generated_at");
  if (!isRelease(value.release)) throw new Error("eval_token_usage invalid release");
  if (expectedRelease && !isDeepStrictEqual(value.release, expectedRelease)) throw new Error("eval_token_usage release mismatch");
  if (!Array.isArray(value.cases)) throw new Error("eval_token_usage cases must be an array");

  const cases = value.cases as unknown[];
  const parsedCases = cases.map(parseCase);
  const caseIds = parsedCases.map(({ case_id }) => case_id);
  if (new Set(caseIds).size !== caseIds.length) throw new Error("eval_token_usage duplicate case");
  if (!isDeepStrictEqual(caseIds, [...caseIds].sort(compareText))) throw new Error("eval_token_usage case order invalid");
  if (!isRecord(value.summary)) throw new Error("eval_token_usage summary invalid");
  const expectedSummary = summarizeCases(parsedCases);
  assertSummary(value.summary, expectedSummary, "summary");

  return JSON.parse(JSON.stringify({
    schema_version: value.schema_version,
    generated_at: value.generated_at,
    release: value.release,
    summary: expectedSummary,
    cases: parsedCases,
  })) as EvalTokenUsageArtifact;
}

function parseCase(value: unknown): EvalTokenUsageCase {
  if (!isRecord(value) || typeof value.case_id !== "string" || !value.case_id) throw new Error("eval_token_usage invalid case");
  const caseId = value.case_id;
  if (!isExecutionStatus(value.execution_status)) throw new Error(`eval_token_usage invalid execution status: ${value.case_id}`);
  if (!Array.isArray(value.attempts)) throw new Error(`eval_token_usage attempts invalid: ${value.case_id}`);
  const attempts = value.attempts.map(parseAttempt);
  attempts.forEach((attempt, index) => {
    if (attempt.attempt !== index + 1) throw new Error(`eval_token_usage attempt order invalid: ${caseId}`);
  });
  const finalOutcome = attempts.at(-1)?.outcome;
  if (value.execution_status === "blocked_no_key" && attempts.length !== 0) throw new Error(`eval_token_usage blocked case has attempts: ${value.case_id}`);
  if (value.execution_status === "completed" && finalOutcome !== "completed") throw new Error(`eval_token_usage completed case outcome mismatch: ${value.case_id}`);
  if (value.execution_status === "failed" && (!finalOutcome || finalOutcome === "completed")) throw new Error(`eval_token_usage failed case outcome mismatch: ${value.case_id}`);

  const expected = buildCase({ case_id: value.case_id, execution_status: value.execution_status }, attempts);
  assertCaseSummary(value, expected);
  return expected;
}

function parseAttempt(value: unknown): EvalTokenUsageAttempt {
  if (!isRecord(value)) throw new Error("eval_token_usage invalid attempt");
  if (!Number.isInteger(value.attempt) || (value.attempt as number) < 1) throw new Error("eval_token_usage invalid attempt number");
  if (typeof value.provider !== "string" || !value.provider || typeof value.model_identifier !== "string" || !value.model_identifier) {
    throw new Error("eval_token_usage invalid provider identity");
  }
  if (!isOutcome(value.outcome) || !isAttemptFailureCategory(value.failure_category)) throw new Error("eval_token_usage invalid attempt outcome");
  const expectedCategory = value.outcome === "completed" ? "none" : value.outcome;
  if (value.failure_category !== expectedCategory) throw new Error("eval_token_usage outcome category mismatch");
  const usage = parseUsage(value.usage);
  return {
    attempt: value.attempt as number,
    provider: value.provider,
    model_identifier: value.model_identifier,
    outcome: value.outcome,
    failure_category: value.failure_category,
    usage,
  };
}

function parseUsage(value: unknown): NormalizedProviderUsage {
  if (!isRecord(value) || (value.status !== "reported" && value.status !== "unavailable")) throw new Error("eval_token_usage invalid usage");
  if (value.status === "reported") {
    if (![value.input_tokens, value.output_tokens, value.total_tokens].every(isTokenCount)) throw new Error("eval_token_usage invalid reported usage");
    if (value.cached_input_tokens !== null && !isTokenCount(value.cached_input_tokens)) throw new Error("eval_token_usage invalid cached usage");
    return {
      status: "reported",
      input_tokens: value.input_tokens as number,
      cached_input_tokens: value.cached_input_tokens,
      output_tokens: value.output_tokens as number,
      total_tokens: value.total_tokens as number,
    };
  }
  if (value.input_tokens !== null || value.cached_input_tokens !== null || value.output_tokens !== null || value.total_tokens !== null) {
    throw new Error("eval_token_usage unavailable usage must contain null token values");
  }
  if (!isUnavailableReason(value.unavailable_reason)) throw new Error("eval_token_usage invalid unavailable reason");
  return {
    status: "unavailable",
    input_tokens: null,
    cached_input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    unavailable_reason: value.unavailable_reason,
  };
}

function buildCase(result: EvalTokenUsageCaseResult, attempts: EvalTokenUsageAttempt[]): EvalTokenUsageCase {
  const reported = attempts.filter(({ usage }) => usage.status === "reported");
  return {
    case_id: result.case_id,
    execution_status: result.execution_status,
    request_attempts: attempts.length,
    reported_attempts: reported.length,
    unavailable_attempts: attempts.length - reported.length,
    retry_count: Math.max(0, attempts.length - 1),
    input_tokens: sum(reported.map(({ usage }) => usage.input_tokens!)),
    cached_input_tokens: sum(reported.flatMap(({ usage }) => usage.cached_input_tokens === null ? [] : [usage.cached_input_tokens])),
    output_tokens: sum(reported.map(({ usage }) => usage.output_tokens!)),
    total_tokens: sum(reported.map(({ usage }) => usage.total_tokens!)),
    attempts,
  };
}

function summarizeCases(cases: EvalTokenUsageCase[]): EvalTokenUsageSummary {
  const attempts = cases.flatMap(({ attempts }) => attempts);
  const reported = attempts.filter(({ usage }) => usage.status === "reported");
  const totalTokens = sum(reported.map(({ usage }) => usage.total_tokens!));
  return {
    case_count: cases.length,
    request_attempts: attempts.length,
    reported_attempts: reported.length,
    unavailable_attempts: attempts.length - reported.length,
    retry_count: sum(cases.map(({ retry_count }) => retry_count)),
    input_tokens: sum(reported.map(({ usage }) => usage.input_tokens!)),
    cached_input_tokens: sum(reported.flatMap(({ usage }) => usage.cached_input_tokens === null ? [] : [usage.cached_input_tokens])),
    cached_usage_available_attempts: reported.filter(({ usage }) => usage.cached_input_tokens !== null).length,
    output_tokens: sum(reported.map(({ usage }) => usage.output_tokens!)),
    total_tokens: totalTokens,
    average_total_tokens_per_reported_attempt: reported.length === 0 ? null : totalTokens / reported.length,
  };
}

function assertCaseSummary(actual: Record<string, unknown>, expected: EvalTokenUsageCase): void {
  for (const key of ["request_attempts", "reported_attempts", "unavailable_attempts", "retry_count", "input_tokens", "cached_input_tokens", "output_tokens", "total_tokens"] as const) {
    if (actual[key] !== expected[key]) throw new Error(`eval_token_usage case ${key} mismatch: ${expected.case_id}`);
  }
}

function assertSummary(actual: Record<string, unknown>, expected: EvalTokenUsageSummary, label: string): void {
  for (const key of Object.keys(expected) as Array<keyof EvalTokenUsageSummary>) {
    if (actual[key] !== expected[key]) throw new Error(`eval_token_usage ${label} ${key} mismatch`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRelease(value: unknown): value is { release_id: string; commit_sha: string } {
  return isRecord(value) && typeof value.release_id === "string" && Boolean(value.release_id) && typeof value.commit_sha === "string" && Boolean(value.commit_sha);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}

function isExecutionStatus(value: unknown): value is EvalCaseExecutionStatus {
  return value === "completed" || value === "failed" || value === "blocked_no_key";
}

function isOutcome(value: unknown): value is EvalAttemptOutcome {
  return value === "completed" || value === "provider_error" || value === "schema_error";
}

function isAttemptFailureCategory(value: unknown): value is EvalAttemptFailureCategory {
  return value === "none" || value === "provider_error" || value === "schema_error";
}

function isUnavailableReason(value: unknown): value is NonNullable<NormalizedProviderUsage["unavailable_reason"]> {
  return value === "missing_provider_usage" || value === "invalid_provider_usage" || value === "request_failed";
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
