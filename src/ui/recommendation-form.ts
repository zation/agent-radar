export interface CollapsedRecommendationInput {
  query: string;
  modelName: string;
  riskTolerance: "low" | "medium" | "high";
}

export function buildCollapsedRecommendationSummary(input: CollapsedRecommendationInput): { title: string; meta: string } {
  return {
    title: input.query.trim(),
    meta: `${input.modelName} · ${input.riskTolerance} risk`
  };
}

export function getRecommendationSubmitLabel(isSubmitting: boolean): string {
  return isSubmitting ? "Submitting" : "Submit";
}

export type RecommendationUiKind = "idle" | "loading" | "success" | "ask_human" | "no_reliable_match" | "error";

export interface RecommendationUiState {
  kind: RecommendationUiKind;
  shouldCollapse: boolean;
  inlineMessage?: string;
}

export function getRecommendationUiState(input: {
  isSubmitting: boolean;
  result: RecommendationResult | null;
  error: string;
}): RecommendationUiState {
  if (input.isSubmitting) return { kind: "loading", shouldCollapse: false };
  if (input.error) return { kind: "error", shouldCollapse: false, inlineMessage: input.error };
  if (!input.result) return { kind: "idle", shouldCollapse: false };
  if (input.result.recommended_action === "ask_human") {
    return {
      kind: "ask_human",
      shouldCollapse: false,
      inlineMessage: input.result.safety_assessment.approval_reason ?? "Human confirmation is required for this task."
    };
  }
  if (input.result.recommended_action === "no_reliable_match") {
    return {
      kind: "no_reliable_match",
      shouldCollapse: false,
      inlineMessage: input.result.no_match_reason ?? "No reliable match in the reviewed catalog."
    };
  }
  return { kind: "success", shouldCollapse: true };
}
import type { RecommendationResult } from "../schema.js";
