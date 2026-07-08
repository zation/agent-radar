export type RecommendationProvider = "openai" | "minimax" | "deepseek";

export interface RecommendationProviderModel {
  apiModel: string;
  endpoint: string;
  instructionRole: "developer" | "system";
  label: string;
  provider: RecommendationProvider;
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

export function resolveRecommendationProviderModel(model: string): RecommendationProviderModel {
  const trimmedModel = model.trim();
  const knownModel = providerModels.find((entry) => entry.label === trimmedModel || entry.apiModel === trimmedModel);
  if (knownModel) return { ...knownModel };

  const provider = inferProvider(trimmedModel);
  return {
    apiModel: trimmedModel,
    endpoint: provider === "minimax" ? "https://api.minimax.io/v1/chat/completions" : provider === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions",
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
