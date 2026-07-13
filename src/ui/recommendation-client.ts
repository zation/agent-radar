import type { RecommendationQuery } from "../schema.js";

export interface RecommendationRequestInput extends RecommendationQuery {
  model?: string;
}

export function buildRecommendationRequest(
  endpoint: string,
  input: RecommendationRequestInput,
  apiKey: string
): Request {
  const baseUrl = typeof window === "undefined" ? "http://agent-radar.local" : window.location.origin;
  const headers = new Headers({ "content-type": "application/json" });
  const normalizedKey = apiKey.trim();
  if (normalizedKey) headers.set("X-Agent-Radar-LLM-API-Key", normalizedKey);
  return new Request(new URL(endpoint, baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify(input)
  });
}
