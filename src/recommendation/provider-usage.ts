import type { RecommendationProvider } from "./provider-registry.js";

export type ProviderUsageUnavailableReason =
  | "missing_provider_usage"
  | "invalid_provider_usage"
  | "request_failed";

export interface NormalizedProviderUsage {
  status: "reported" | "unavailable";
  input_tokens: number | null;
  cached_input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  unavailable_reason?: ProviderUsageUnavailableReason;
}

export interface ProviderUsageObservation {
  provider: RecommendationProvider;
  model_identifier: string;
  usage: NormalizedProviderUsage;
}

export function normalizeProviderUsage(value: unknown): NormalizedProviderUsage {
  if (value === undefined || value === null) return unavailableProviderUsage("missing_provider_usage");
  if (!isRecord(value)) return unavailableProviderUsage("invalid_provider_usage");

  const input = value.prompt_tokens ?? value.input_tokens;
  const output = value.completion_tokens ?? value.output_tokens;
  const total = value.total_tokens;
  const details = value.prompt_tokens_details ?? value.input_tokens_details;
  const cached = details === undefined
    ? undefined
    : isRecord(details)
      ? details.cached_tokens
      : null;

  if (!isTokenCount(input) || !isTokenCount(output) || !isTokenCount(total)) {
    return unavailableProviderUsage("invalid_provider_usage");
  }
  if (cached !== undefined && !isTokenCount(cached)) {
    return unavailableProviderUsage("invalid_provider_usage");
  }

  return {
    status: "reported",
    input_tokens: input,
    cached_input_tokens: cached ?? null,
    output_tokens: output,
    total_tokens: total,
  };
}

export function unavailableProviderUsage(reason: ProviderUsageUnavailableReason): NormalizedProviderUsage {
  return {
    status: "unavailable",
    input_tokens: null,
    cached_input_tokens: null,
    output_tokens: null,
    total_tokens: null,
    unavailable_reason: reason,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTokenCount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && Number.isInteger(value) && value >= 0;
}
