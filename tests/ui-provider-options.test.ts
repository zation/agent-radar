import assert from "node:assert/strict";
import test from "node:test";
import { listRecommendationProviderModels } from "../src/recommendation/provider-registry.js";
import { listUiRecommendationModelOptions } from "../src/ui/provider-options.js";

test("UI recommendation model options come from the provider registry", () => {
  assert.deepEqual(
    listUiRecommendationModelOptions(),
    listRecommendationProviderModels().map((model) => model.label)
  );
});
