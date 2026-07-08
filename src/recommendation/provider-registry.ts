export type RecommendationProvider = "openai" | "minimax" | "deepseek";

export const DEFAULT_RECOMMENDATION_MODEL = "deepseek-v4-flash";
export const PROVIDER_REGISTRY_VERSION = "provider_registry.v0.2";

export interface RecommendationProviderModel {
  apiModel: string;
  endpoint: string;
  instructionRole: "developer" | "system";
  label: string;
  provider: RecommendationProvider;
}

export interface ResolveRecommendationProviderModelOptions {
  baseUrl?: string;
}

export interface ProviderRegistryArtifact {
  schema_version: "provider_registry.v1";
  registry_version: typeof PROVIDER_REGISTRY_VERSION;
  default_model: typeof DEFAULT_RECOMMENDATION_MODEL;
  key_handling: "byok_request_only";
  models: Array<{
    label: string;
    provider: RecommendationProvider;
    api_model: string;
    endpoint: string;
    instruction_role: "developer" | "system";
    runtime_selectable: true;
  }>;
}

const providerModels: RecommendationProviderModel[] = [
  {
    apiModel: "gpt-4.1",
    endpoint: "https://api.openai.com/v1/chat/completions",
    instructionRole: "developer",
    label: "OpenAI GPT-4.1",
    provider: "openai"
  },
  {
    apiModel: "gpt-4.1-mini",
    endpoint: "https://api.openai.com/v1/chat/completions",
    instructionRole: "developer",
    label: "OpenAI GPT-4.1 mini",
    provider: "openai"
  },
  {
    apiModel: "MiniMax-M3",
    endpoint: "https://api.minimax.io/v1/chat/completions",
    instructionRole: "system",
    label: "MiniMax M3",
    provider: "minimax"
  },
  {
    apiModel: "deepseek-v4-pro",
    endpoint: "https://api.deepseek.com/chat/completions",
    instructionRole: "system",
    label: "DeepSeek V4 Pro",
    provider: "deepseek"
  },
  {
    apiModel: "deepseek-v4-flash",
    endpoint: "https://api.deepseek.com/chat/completions",
    instructionRole: "system",
    label: "DeepSeek V4 Flash",
    provider: "deepseek"
  }
];

export function listRecommendationProviderModels(): RecommendationProviderModel[] {
  return providerModels.map((model) => ({ ...model }));
}

export function buildProviderRegistryArtifact(): ProviderRegistryArtifact {
  return {
    schema_version: "provider_registry.v1",
    registry_version: PROVIDER_REGISTRY_VERSION,
    default_model: DEFAULT_RECOMMENDATION_MODEL,
    key_handling: "byok_request_only",
    models: providerModels.map((model) => ({
      label: model.label,
      provider: model.provider,
      api_model: model.apiModel,
      endpoint: model.endpoint,
      instruction_role: model.instructionRole,
      runtime_selectable: true
    }))
  };
}

export function resolveRecommendationProviderModel(model: string, options: ResolveRecommendationProviderModelOptions = {}): RecommendationProviderModel {
  const trimmedModel = model.trim();
  const knownModel = providerModels.find((entry) => entry.label === trimmedModel || entry.apiModel === trimmedModel);
  if (knownModel) return { ...knownModel, endpoint: resolveEndpoint(knownModel.provider, knownModel.endpoint, options.baseUrl) };

  const provider = inferProvider(trimmedModel);
  const defaultEndpoint = provider === "minimax" ? "https://api.minimax.io/v1/chat/completions" : provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions";
  return {
    apiModel: trimmedModel,
    endpoint: resolveEndpoint(provider, defaultEndpoint, options.baseUrl),
    instructionRole: provider === "openai" ? "developer" : "system",
    label: trimmedModel,
    provider
  };
}

function inferProvider(model: string): RecommendationProvider {
  if (model.startsWith("MiniMax-")) return "minimax";
  if (model.startsWith("deepseek-")) return "deepseek";
  return "openai";
}

function resolveEndpoint(provider: RecommendationProvider, defaultEndpoint: string, baseUrl?: string): string {
  if (!baseUrl?.trim()) return defaultEndpoint;
  return joinBaseUrl(baseUrl, providerPath(provider));
}

function providerPath(provider: RecommendationProvider): string {
  if (provider === "deepseek") return "/chat/completions";
  return "/v1/chat/completions";
}

function joinBaseUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
