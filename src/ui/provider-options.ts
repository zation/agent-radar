import { listRecommendationProviderModels } from "../recommendation/provider-registry.js";

export function listUiRecommendationModelOptions(): string[] {
  return listRecommendationProviderModels().map((model) => model.label);
}
