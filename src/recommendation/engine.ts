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
import { resolveRecommendationProviderModel, type RecommendationProvider } from "./provider-registry.js";
import { assessRecommendationSafety } from "./safety.js";

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

export type RecommendationProviderErrorCode =
  | "provider_auth_failed"
  | "provider_rate_limited"
  | "provider_model_unavailable"
  | "provider_schema_error"
  | "provider_request_failed";

export interface RecommendationProviderErrorInput {
  code: RecommendationProviderErrorCode;
  message: string;
  provider: RecommendationProvider;
  status?: number;
}

export class RecommendationProviderError extends Error {
  code: RecommendationProviderErrorCode;
  provider: RecommendationProvider;
  status?: number;

  constructor(input: RecommendationProviderErrorInput) {
    super(input.message);
    this.name = "RecommendationProviderError";
    this.code = input.code;
    this.provider = input.provider;
    this.status = input.status;
  }
}

export interface RecommendToolsRuntime {
  apiKey: string;
  model: string;
  release?: { release_id: string; commit_sha: string };
  client?: RecommendationLlmClient;
}

const allowedActions: RecommendedAction[] = ["use", "compare", "ask_human", "avoid", "no_reliable_match"];
const allowedConfidences: Confidence[] = ["high", "medium", "low", "unknown"];
const DEFAULT_PROVIDER_TIMEOUT_MS = 60_000;

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
    model: runtime.model.trim(),
    prompt: buildRecommendationPrompt(query, cards, ratings)
  });

  const rejectedCandidates = [...(llmOutput.rejected_candidates ?? [])];
  let candidates = (llmOutput.candidates ?? [])
    .map((candidate) => normalizeCandidate(candidate, cardByTool, ratingByTool, rejectedCandidates))
    .filter((candidate): candidate is RecommendationCandidate => Boolean(candidate))
    .slice(0, query.top_k ?? 5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));

  let queryUnderstanding = normalizeQueryUnderstanding(llmOutput.query_understanding, query, candidates);
  const forcedNoMatchReason = getForcedNoMatchReason(query, queryUnderstanding);
  let recoveredCatalogCandidates = false;
  if (!forcedNoMatchReason && shouldRecoverCatalogCandidates(llmOutput.recommended_action, candidates, queryUnderstanding)) {
    candidates = recoverCatalogCandidates(query, cards, ratingByTool, queryUnderstanding, rejectedCandidates);
    recoveredCatalogCandidates = candidates.length > 0;
    queryUnderstanding = normalizeQueryUnderstanding(llmOutput.query_understanding, query, candidates);
  }
  const safetyAssessment = assessRecommendationSafety({ query, candidates, cards, ratings });
  const recommendedAction = forcedNoMatchReason
    ? "no_reliable_match"
    : chooseSafeAction(llmOutput.recommended_action, candidates, safetyAssessment.maximum_allowed_action, recoveredCatalogCandidates);

  return {
    id: `rec-${Date.now().toString(36)}`,
    schema_version: "recommendation_result.v2",
    release: runtime.release ?? { release_id: "dev", commit_sha: "dev" },
    query,
    query_understanding: queryUnderstanding,
    recommended_action: recommendedAction,
    safety_assessment: safetyAssessment,
    candidates: recommendedAction === "no_reliable_match" ? [] : candidates,
    rejected_candidates: rejectedCandidates,
    no_match_reason:
      recommendedAction === "no_reliable_match"
        ? forcedNoMatchReason ?? llmOutput.no_match_reason ?? "The LLM response did not include any known tool candidate."
        : llmOutput.no_match_reason
  };
}

export function createOpenAiRecommendationClient(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_PROVIDER_TIMEOUT_MS
): RecommendationLlmClient {
  return {
    async recommend(input) {
      const modelRequest = resolveModelRequest(input.model);
      console.warn("recommendation_llm_request", {
        provider: modelRequest.provider,
        endpoint: modelRequest.endpoint,
        model: modelRequest.model,
        instructionRole: modelRequest.instructionRole
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(modelRequest.endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${normalizeApiKey(input.apiKey)}`,
            "content-type": "application/json"
          },
          body: JSON.stringify(buildProviderRequestBody(modelRequest, input.prompt)),
          signal: controller.signal
        });
      } catch (error) {
        throw new RecommendationProviderError({
          code: "provider_request_failed",
          message: controller.signal.aborted
            ? `Provider request timed out after ${timeoutMs} ms.`
            : `Provider request failed: ${error instanceof Error ? error.message : String(error)}`,
          provider: modelRequest.provider
        });
      } finally {
        clearTimeout(timeout);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        const sanitizedErrorBody = sanitizeProviderErrorBody(errorBody);
        console.error("recommendation_llm_request_failed", {
          provider: modelRequest.provider,
          endpoint: modelRequest.endpoint,
          model: modelRequest.model,
          status: response.status,
          statusText: response.statusText,
          body: sanitizedErrorBody
        });
        throw new RecommendationProviderError({
          code: classifyProviderStatus(response.status, sanitizedErrorBody),
          message: buildProviderErrorMessage(response.status, response.statusText),
          provider: modelRequest.provider,
          status: response.status
        });
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = body.choices?.[0]?.message?.content;
      if (!content) {
        throw new RecommendationProviderError({
          code: "provider_schema_error",
          message: "Provider response did not include recommendation JSON content.",
          provider: modelRequest.provider
        });
      }
      try {
        return JSON.parse(normalizeProviderJsonContent(content)) as RecommendationLlmOutput;
      } catch {
        throw new RecommendationProviderError({
          code: "provider_schema_error",
          message: "Provider response content was not valid recommendation JSON.",
          provider: modelRequest.provider
        });
      }
    }
  };
}

function normalizeProviderJsonContent(content: string): string {
  const trimmed = content.trim();
  const fencedJson = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i);
  const candidate = fencedJson ? fencedJson[1].trim() : trimmed;
  if (candidate.startsWith("{")) return candidate;
  return extractFirstJsonObject(candidate) ?? candidate;
}

function extractFirstJsonObject(content: string): string | undefined {
  const start = content.indexOf("{");
  if (start < 0) return undefined;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < content.length; index += 1) {
    const char = content[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) return content.slice(start, index + 1).trim();
    }
  }

  return undefined;
}

function buildProviderRequestBody(modelRequest: ModelRequest, prompt: string): Record<string, unknown> {
  return {
    model: modelRequest.model,
    messages: [
      {
        role: modelRequest.instructionRole,
        content:
          "You are Agent Radar's recommendation engine. Return only JSON. Recommend only tool_id values present in the supplied catalog. Preserve safety concerns, evidence limits, and high-risk human approval boundaries."
      },
      {
        role: "user",
        content: prompt
      }
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    ...(modelRequest.provider === "minimax" ? { thinking: { type: "disabled" } } : {})
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
  provider: RecommendationProvider;
}

export function resolveModelRequest(model: string): ModelRequest {
  const providerModel = resolveRecommendationProviderModel(model, { baseUrl: readEnv("AGENT_RADAR_LLM_BASE_URL") });
  return {
    endpoint: providerModel.endpoint,
    instructionRole: providerModel.instructionRole,
    model: providerModel.apiModel,
    provider: providerModel.provider
  };
}

function readEnv(name: string): string | undefined {
  return typeof process === "undefined" ? undefined : process.env[name];
}

function sanitizeProviderErrorBody(body: string): string {
  return body
    .replace(/sk-[A-Za-z0-9_-]+/g, "sk-***")
    .replace(/Bearer\\s+[A-Za-z0-9._-]+/gi, "Bearer ***")
    .slice(0, 1000);
}

function classifyProviderStatus(status: number, body: string): RecommendationProviderErrorCode {
  if (status === 401 || status === 403) return "provider_auth_failed";
  if (status === 429) return "provider_rate_limited";
  if (status === 404 || /model/i.test(body)) return "provider_model_unavailable";
  return "provider_request_failed";
}

function buildProviderErrorMessage(status: number, statusText: string): string {
  if (status === 401 || status === 403) return "Provider rejected the API key or authorization scope.";
  if (status === 429) return "Provider rate limit was reached. Try again later or use another model.";
  if (status === 404) return "Provider model or endpoint was not available.";
  return `Provider request failed with status ${status}${statusText ? ` ${statusText}` : ""}.`;
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
    risks: mergeStrings(nonEmptyStrings(candidate.risks, []), buildRisks(card)),
    not_for: card.not_for,
    next_steps: nonEmptyStrings(candidate.next_steps, buildNextSteps(card, rating.risk_level)),
    evidence_refs: [...card.evidence_refs, rating.id]
  };
}

function shouldRecoverCatalogCandidates(action: RecommendedAction, candidates: RecommendationCandidate[], understanding: QueryUnderstanding): boolean {
  if (candidates.length > 0) return false;
  if (action === "no_reliable_match" || action === "avoid") return true;
  return action === "ask_human" && understanding.likely_permissions.length > 0;
}

function recoverCatalogCandidates(
  query: RecommendationQuery,
  cards: ToolCard[],
  ratingByTool: Map<string, RatingResult>,
  understanding: QueryUnderstanding,
  rejectedCandidates: RejectedCandidate[]
): RecommendationCandidate[] {
  const preferredTypes = new Set(query.preferred_tool_types ?? []);
  const cardByTool = new Map(cards.map((card) => [card.id, card]));
  const scored = cards
    .filter((card) => (preferredTypes.size === 0 ? true : preferredTypes.has(card.type)))
    .map((card) => ({ card, score: scoreCatalogCard(query, card, understanding) }))
    .filter((item) => item.score >= 6)
    .sort((a, b) => b.score - a.score || (ratingByTool.get(b.card.id)?.overall_score ?? 0) - (ratingByTool.get(a.card.id)?.overall_score ?? 0));

  return scored
    .map(({ card, score }) =>
      normalizeCandidate(
        {
          tool_id: card.id,
          fit_score: Math.min(100, Math.max(score * 8, ratingByTool.get(card.id)?.overall_score ?? 0)),
          why: [`Catalog fallback matched ${card.name} to source-backed tags, permissions, and type hints after the LLM over-rejected a covered task.`],
          risks: [],
          next_steps: buildNextSteps(card, card.security.risk_level)
        },
        cardByTool,
        ratingByTool,
        rejectedCandidates
      )
    )
    .filter((candidate): candidate is RecommendationCandidate => Boolean(candidate))
    .sort((a, b) => b.fit_score - a.fit_score)
    .slice(0, query.top_k ?? 5)
    .map((candidate, index) => ({ ...candidate, rank: index + 1 }));
}

function scoreCatalogCard(query: RecommendationQuery, card: ToolCard, understanding: QueryUnderstanding): number {
  const text = normalizeSearchText([
    query.task,
    ...(query.language_or_stack ?? []),
    ...(query.environment ?? []),
    ...(query.allowed_permissions ?? []),
    ...(query.existing_tools ?? []),
    ...understanding.task_domains,
    ...understanding.required_capabilities
  ]);
  const cardText = normalizeSearchText([card.id, card.name, card.type, card.summary, card.primary_purpose, ...card.tags, ...card.use_cases]);
  const permissions = new Set(understanding.likely_permissions);
  const preferredTypes = new Set(query.preferred_tool_types ?? []);
  let score = 0;

  if (preferredTypes.has(card.type)) score += 3;
  for (const permission of card.permissions) {
    if (permissions.has(permission.scope)) score += permission.required ? 3 : 2;
  }
  for (const tag of card.tags) {
    if (text.includes(tag.toLowerCase().replaceAll("_", " "))) score += 3;
    if (text.includes(tag.toLowerCase())) score += 2;
  }
  for (const token of tokenize(text)) {
    if (token.length >= 4 && cardText.includes(token)) score += 1;
  }
  if (card.security.requires_human_approval && [...permissions].some((permission) => ["payment", "email", "database", "cloud", "secrets"].includes(permission))) score += 2;
  return score;
}

function normalizeSearchText(values: string[]): string {
  return values.join(" ").toLowerCase().replace(/[_-]+/g, " ");
}

function tokenize(value: string): string[] {
  return [...new Set(value.split(/[^a-z0-9]+/i).filter(Boolean))];
}

function normalizeQueryUnderstanding(
  input: Partial<QueryUnderstanding> | undefined,
  query: RecommendationQuery,
  candidates: RecommendationCandidate[]
): QueryUnderstanding {
  const candidatePermissions = candidates.flatMap((candidate) => extractPermissionScopes(candidate.risks));
  const inferredPermissions = inferQueryPermissions(query);
  return {
    intent: readString(input?.intent, "llm_tool_recommendation"),
    task_domains: readStringArray(input?.task_domains),
    required_capabilities: readStringArray(input?.required_capabilities),
    likely_permissions: mergeStrings(readStringArray(input?.likely_permissions), candidatePermissions, inferredPermissions),
    tool_type_hints: readToolTypes(input?.tool_type_hints, query.preferred_tool_types ?? ["skill", "mcp", "agent"]),
    risk_flags: mergeStrings(readStringArray(input?.risk_flags), inferredPermissions),
    confidence: allowedConfidences.includes(input?.confidence as Confidence) ? (input?.confidence as Confidence) : "low"
  };
}

function chooseSafeAction(action: RecommendedAction, candidates: RecommendationCandidate[], maximumAllowedAction: RecommendedAction, recoveredCatalogCandidates: boolean): RecommendedAction {
  if (maximumAllowedAction === "avoid") return "avoid";
  if (candidates.length === 0) return "no_reliable_match";
  const normalizedAction = allowedActions.includes(action) ? action : "compare";
  const actionRank: Record<RecommendedAction, number> = { use: 1, compare: 2, ask_human: 3, avoid: 4, no_reliable_match: 5 };
  if (recoveredCatalogCandidates) return maximumAllowedAction === "use" ? (candidates.length === 1 ? "use" : "compare") : maximumAllowedAction;
  if (normalizedAction === "no_reliable_match" && candidates.length > 0) return maximumAllowedAction === "use" ? (candidates.length === 1 ? "use" : "compare") : maximumAllowedAction;
  return actionRank[normalizedAction] >= actionRank[maximumAllowedAction] ? normalizedAction : maximumAllowedAction;
}

function getForcedNoMatchReason(query: RecommendationQuery, understanding: QueryUnderstanding): string | undefined {
  const permissions = new Set(understanding.likely_permissions);
  if (query.risk_tolerance === "low" && permissions.has("payment") && permissions.has("database")) {
    return "No reliable match: low risk tolerance is incompatible with combined payment and database permissions.";
  }
  return undefined;
}

function buildRisks(card: ToolCard): string[] {
  if (card.permissions.length === 0) return ["No elevated runtime permission is required by the card."];
  return card.permissions.map((permission) => `${permission.scope}:${permission.access} - ${permission.notes}`);
}

function extractPermissionScopes(risks: string[]): string[] {
  const scopes = ["filesystem", "network", "browser", "email", "database", "cloud", "payment", "shell", "code_execution", "secrets", "unknown"];
  return scopes.filter((scope) => risks.some((risk) => risk.includes(scope)));
}

function inferQueryPermissions(query: RecommendationQuery): string[] {
  const text = [
    query.task,
    ...(query.language_or_stack ?? []),
    ...(query.environment ?? []),
    ...(query.allowed_permissions ?? []),
    ...(query.existing_tools ?? [])
  ]
    .join(" ")
    .toLowerCase();

  const permissions: string[] = [];
  if (/(file|filesystem|文件|项目|代码|仓库|repo|repository)/i.test(text)) permissions.push("filesystem");
  if (/(browser|screenshot|网页|浏览器|截图|本地网页)/i.test(text)) permissions.push("browser", "network");
  if (/(gmail|mail|email|邮件|邮箱)/i.test(text)) permissions.push("email");
  if (/(database|db|数据库|生产库)/i.test(text)) permissions.push("database", "secrets");
  if (/(github|pull request|\\bpr\\b|issue|code review|monitoring|sentry|production|线上|cloud|云平台|云资源|postgres|neon)/i.test(text)) permissions.push("cloud");
  if (/(stripe|payment|refund|checkout|支付|退款|收款)/i.test(text)) permissions.push("payment", "network", "secrets");
  if (/(api key|apikey|token|secret|密钥|凭证|生产|线上)/i.test(text)) permissions.push("secrets");
  if (/(shell|command|script|execute code|run .*code|命令|执行脚本|代码执行|运行.*代码|远程代码)/i.test(text)) permissions.push("shell", "code_execution");
  return mergeStrings(permissions);
}

function buildNextSteps(card: ToolCard, risk: RiskLevel): string[] {
  if (risk === "critical" || risk === "high" || card.security.requires_human_approval) {
    return ["先确认权限范围和数据流。", "使用最小权限、测试模式或只读范围。"];
  }
  return ["阅读来源文档。", "按最小权限配置后再执行。"];
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

function mergeStrings(...groups: string[][]): string[] {
  return [...new Set(groups.flat().map((item) => item.trim()).filter(Boolean))];
}

function readToolTypes(value: unknown, fallback: ToolType[]): ToolType[] {
  const allowed: ToolType[] = ["mcp", "skill", "agent", "framework", "cli", "prompt", "rules", "dataset", "service"];
  const values = Array.isArray(value) ? value.filter((item): item is ToolType => allowed.includes(item as ToolType)) : [];
  return values.length > 0 ? values : fallback;
}
