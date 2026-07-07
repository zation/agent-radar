import type {
  Confidence,
  QueryUnderstanding,
  RatingResult,
  RecommendationCandidate,
  RecommendationQuery,
  RecommendationResult,
  RecommendedAction,
  RejectedCandidate,
  RiskLevel,
  ToolCard,
  ToolType
} from "../schema.js";

export interface RecommendationLlmInput {
  apiKey: string;
  model: string;
  prompt: string;
}

export interface RecommendationLlmCandidate {
  tool_id: string;
  fit_score?: number;
  why?: string[];
  risks?: string[];
  next_steps?: string[];
}

export interface RecommendationLlmOutput {
  recommended_action: RecommendedAction;
  query_understanding?: Partial<QueryUnderstanding>;
  candidates?: RecommendationLlmCandidate[];
  rejected_candidates?: RejectedCandidate[];
  no_match_reason?: string;
}

export interface RecommendationLlmClient {
  recommend(input: RecommendationLlmInput): Promise<RecommendationLlmOutput>;
}

export interface RecommendToolsRuntime {
  apiKey: string;
  model: string;
  client?: RecommendationLlmClient;
}

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  unknown: 5
};

const allowedActions: RecommendedAction[] = ["use", "compare", "ask_human", "avoid", "no_reliable_match"];
const allowedConfidences: Confidence[] = ["high", "medium", "low", "unknown"];

export async function recommendTools(
  query: RecommendationQuery,
  cards: ToolCard[],
  ratings: RatingResult[],
  runtime: RecommendToolsRuntime
): Promise<RecommendationResult> {
  if (!runtime.apiKey.trim()) throw new Error("recommend_tools requires api_key");
  if (!runtime.model.trim()) throw new Error("recommend_tools requires model");

  const ratingByTool = new Map(ratings.map((rating) => [rating.tool_id, rating]));
  const cardByTool = new Map(cards.map((card) => [card.id, card]));
  const client = runtime.client ?? createOpenAiRecommendationClient();
  const llmOutput = await client.recommend({
    apiKey: runtime.apiKey,
    model: normalizeModelName(runtime.model),
    prompt: buildRecommendationPrompt(query, cards, ratings)
  });

  const rejectedCandidates = [...(llmOutput.rejected_candidates ?? [])];
  const candidates = (llmOutput.candidates ?? [])
    .map((candidate) => normalizeCandidate(candidate, cardByTool, ratingByTool, rejectedCandidates))
    .filter((candidate): candidate is RecommendationCandidate => Boolean(candidate))
    .slice(0, query.top_k ?? 5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  const queryUnderstanding = normalizeQueryUnderstanding(llmOutput.query_understanding, query);
  const recommendedAction = chooseSafeAction(llmOutput.recommended_action, candidates);

  return {
    id: `rec-${Date.now().toString(36)}`,
    schema_version: "recommendation_result.v1",
    query,
    query_understanding: queryUnderstanding,
    recommended_action: recommendedAction,
    candidates: recommendedAction === "no_reliable_match" ? [] : candidates,
    rejected_candidates: rejectedCandidates,
    no_match_reason:
      recommendedAction === "no_reliable_match"
        ? llmOutput.no_match_reason ?? "The LLM response did not include any known tool candidate."
        : llmOutput.no_match_reason
  };
}

export function createOpenAiRecommendationClient(fetchImpl: typeof fetch = fetch): RecommendationLlmClient {
  return {
    async recommend(input) {
      const modelRequest = resolveModelRequest(input.model);
      console.warn("recommendation_llm_request", {
        provider: modelRequest.provider,
        endpoint: modelRequest.endpoint,
        model: modelRequest.model,
        instructionRole: modelRequest.instructionRole
      });
      const response = await fetchImpl(modelRequest.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${normalizeApiKey(input.apiKey)}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model: modelRequest.model,
          messages: [
            {
              role: modelRequest.instructionRole,
              content:
                "You are Agent Radar's recommendation engine. Return only JSON. Recommend only tool_id values present in the supplied catalog. Preserve safety concerns, evidence limits, and high-risk human approval boundaries."
            },
            {
              role: "user",
              content: input.prompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.2
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        console.error("recommendation_llm_request_failed", {
          provider: modelRequest.provider,
          endpoint: modelRequest.endpoint,
          model: modelRequest.model,
          status: response.status,
          statusText: response.statusText,
          body: sanitizeProviderErrorBody(errorBody)
        });
        throw new Error(`llm_request_failed:${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("llm_response_missing_content");
      return JSON.parse(content) as RecommendationLlmOutput;
    }
  };
}

export function buildRecommendationPrompt(query: RecommendationQuery, cards: ToolCard[], ratings: RatingResult[]): string {
  const ratingByTool = new Map(ratings.map((rating) => [rating.tool_id, rating]));
  const catalog = cards.map((card) => {
    const rating = ratingByTool.get(card.id);
    return {
      id: card.id,
      name: card.name,
      type: card.type,
      summary: card.summary,
      primary_purpose: card.primary_purpose,
      use_cases: card.use_cases,
      not_for: card.not_for,
      tags: card.tags,
      auth_required: card.auth_required,
      permissions: card.permissions,
      security: card.security,
      confidence: card.confidence,
      rating: rating
        ? {
            overall_score: rating.overall_score,
            recommendation_level: rating.recommendation_level,
            risk_level: rating.risk_level,
            evidence_quality: rating.evidence_quality
          }
        : undefined,
      evidence_refs: card.evidence_refs
    };
  });

  return JSON.stringify(
    {
      instruction:
        "Recommend tools for the user task. Return JSON with recommended_action, query_understanding, candidates, rejected_candidates, and optional no_match_reason. Candidate tool_id must come from catalog. Do not invent tools.",
      result_shape: {
        recommended_action: "use | compare | ask_human | avoid | no_reliable_match",
        query_understanding: {
          intent: "string",
          task_domains: ["string"],
          required_capabilities: ["string"],
          likely_permissions: ["string"],
          tool_type_hints: ["skill | mcp | agent | framework | cli | prompt | rules | dataset | service"],
          risk_flags: ["string"],
          confidence: "high | medium | low | unknown"
        },
        candidates: [
          {
            tool_id: "known catalog id",
            fit_score: "0-100",
            why: ["short evidence-backed reasons"],
            risks: ["permission and data-flow risks"],
            next_steps: ["safe next step"]
          }
        ],
        rejected_candidates: [{ tool_id: "known catalog id", reason: "short reason" }]
      },
      query,
      catalog
    },
    null,
    2
  );
}

interface ModelRequest {
  endpoint: string;
  instructionRole: "developer" | "system";
  model: string;
  provider: "openai" | "minimax" | "deepseek";
}

export function resolveModelRequest(model: string): ModelRequest {
  const normalizedModel = normalizeModelName(model);
  if (normalizedModel.startsWith("MiniMax-")) {
    return {
      endpoint: "https://api.minimax.io/v1/chat/completions",
      instructionRole: "system",
      model: normalizedModel,
      provider: "minimax"
    };
  }
  if (normalizedModel.startsWith("deepseek-")) {
    return {
      endpoint: "https://api.deepseek.com/chat/completions",
      instructionRole: "system",
      model: normalizedModel,
      provider: "deepseek"
    };
  }

  return {
    endpoint: "https://api.openai.com/v1/chat/completions",
    instructionRole: "developer",
    model: normalizedModel,
    provider: "openai"
  };
}

function sanitizeProviderErrorBody(body: string): string {
  return body
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .slice(0, 1000);
}

export function normalizeApiKey(apiKey: string): string {
  return apiKey.trim().replace(/^Bearer\s+/i, "").trim();
}

function normalizeCandidate(
  candidate: RecommendationLlmCandidate,
  cardByTool: Map<string, ToolCard>,
  ratingByTool: Map<string, RatingResult>,
  rejectedCandidates: RejectedCandidate[]
): RecommendationCandidate | null {
  const card = cardByTool.get(candidate.tool_id);
  const rating = ratingByTool.get(candidate.tool_id);
  if (!card || !rating) {
    rejectedCandidates.push({ tool_id: candidate.tool_id, reason: "llm_returned_unknown_tool_id" });
    return null;
  }

  return {
    tool_id: card.id,
    name: card.name,
    rank: 0,
    recommendation_level: rating.recommendation_level,
    fit_score: clampScore(candidate.fit_score ?? rating.overall_score),
    risk_level: rating.risk_level,
    tags: card.tags,
    why: nonEmptyStrings(candidate.why, [`LLM selected ${card.name} for ${card.primary_purpose}.`]),
    risks: nonEmptyStrings(candidate.risks, buildRisks(card)),
    not_for: card.not_for,
    next_steps: nonEmptyStrings(candidate.next_steps, buildNextSteps(card, rating.risk_level)),
    evidence_refs: [...card.evidence_refs, rating.id]
  };
}

function normalizeQueryUnderstanding(input: Partial<QueryUnderstanding> | undefined, query: RecommendationQuery): QueryUnderstanding {
  return {
    intent: readString(input?.intent, "llm_tool_recommendation"),
    task_domains: readStringArray(input?.task_domains),
    required_capabilities: readStringArray(input?.required_capabilities),
    likely_permissions: readStringArray(input?.likely_permissions),
    tool_type_hints: readToolTypes(input?.tool_type_hints, query.preferred_tool_types ?? ["skill", "mcp", "agent"]),
    risk_flags: readStringArray(input?.risk_flags),
    confidence: allowedConfidences.includes(input?.confidence as Confidence) ? (input?.confidence as Confidence) : "low"
  };
}

function chooseSafeAction(action: RecommendedAction, candidates: RecommendationCandidate[]): RecommendedAction {
  if (candidates.length === 0) return "no_reliable_match";
  const normalizedAction = allowedActions.includes(action) ? action : "compare";
  const highestRisk = Math.max(...candidates.map((candidate) => riskRank[candidate.risk_level]));
  if (highestRisk >= riskRank.high) return "ask_human";
  return normalizedAction;
}

function buildRisks(card: ToolCard): string[] {
  if (card.permissions.length === 0) return ["No elevated runtime permission is required by the card."];
  return card.permissions.map((permission) => `${permission.scope}:${permission.access} - ${permission.notes}`);
}

function buildNextSteps(card: ToolCard, risk: RiskLevel): string[] {
  if (risk === "critical" || risk === "high" || card.security.requires_human_approval) {
    return ["先确认权限范围和数据流。", "使用最小权限、测试模式或只读范围。"];
  }
  return ["阅读来源文档。", "按最小权限配置后再执行。"];
}

function normalizeModelName(model: string): string {
  const knownLabels: Record<string, string> = {
    "OpenAI GPT-4.1": "gpt-4.1",
    "OpenAI GPT-4.1 mini": "gpt-4.1-mini",
    "MiniMax M3": "MiniMax-M3",
    "DeepSeek V4 Pro": "deepseek-v4-pro"
  };
  return knownLabels[model] ?? model;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

function nonEmptyStrings(input: string[] | undefined, fallback: string[]): string[] {
  const values = readStringArray(input);
  return values.length > 0 ? values : fallback;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function readToolTypes(value: unknown, fallback: ToolType[]): ToolType[] {
  const allowed: ToolType[] = ["mcp", "skill", "agent", "framework", "cli", "prompt", "rules", "dataset", "service"];
  const values = Array.isArray(value) ? value.filter((item): item is ToolType => allowed.includes(item as ToolType)) : [];
  return values.length > 0 ? values : fallback;
}
