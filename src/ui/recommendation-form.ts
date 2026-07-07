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
