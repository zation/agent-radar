import type { RecommendationCandidate, RecommendationResult } from "../schema.js";
import type { ToolViewModel } from "./data.js";

export interface RecommendationItem {
  candidate: RecommendationCandidate;
  tool: ToolViewModel;
}

export interface RankedToolRow {
  tool: ToolViewModel;
  rank: number;
  recommendationLevel: RecommendationCandidate["recommendation_level"];
  fitScore: number;
  taskReason?: string;
}

export interface RecommendationSafetyView {
  releaseLabel: string;
  riskLevel: RecommendationResult["safety_assessment"]["risk_level"];
  requiresHumanApproval: boolean;
  approvalReason?: string;
  confirmationItems: string[];
  safeDefaults: string[];
}

export function createRecommendationSafetyView(result: RecommendationResult): RecommendationSafetyView {
  return {
    releaseLabel: `${result.release.release_id} · ${result.release.commit_sha.slice(0, 7)}`,
    riskLevel: result.safety_assessment.risk_level,
    requiresHumanApproval: result.safety_assessment.requires_human_approval,
    approvalReason: result.safety_assessment.approval_reason,
    confirmationItems: result.safety_assessment.confirmation_questions,
    safeDefaults: result.safety_assessment.safe_defaults
  };
}

export interface RecommendationApiErrorBody {
  error?: string;
  message?: string;
  provider?: string;
  provider_status?: number;
}

export function createRecommendationItems(result: RecommendationResult, tools: ToolViewModel[]): RecommendationItem[] {
  const toolsById = new Map(tools.map((tool) => [tool.card.id, tool]));
  return result.candidates
    .map((candidate) => {
      const tool = toolsById.get(candidate.tool_id);
      return tool ? { candidate, tool } : undefined;
    })
    .filter((item): item is RecommendationItem => Boolean(item));
}

export function createRankedToolRows(result: RecommendationResult, tools: ToolViewModel[]): RankedToolRow[] {
  const toolsById = new Map(tools.map((tool) => [tool.card.id, tool]));
  return result.candidates.flatMap((candidate) => {
    const tool = toolsById.get(candidate.tool_id);
    if (!tool) return [];
    const taskReason = candidate.why.join(" ").trim() || undefined;
    return [{
      tool,
      rank: candidate.rank,
      recommendationLevel: candidate.recommendation_level,
      fitScore: candidate.fit_score,
      taskReason
    }];
  });
}

export function getTaskReason(toolId: string, result: RecommendationResult): string | undefined {
  const reason = result.candidates.find((candidate) => candidate.tool_id === toolId)?.why.join(" ").trim();
  return reason || undefined;
}

export function formatRecommendationApiError(body: RecommendationApiErrorBody): string {
  const message = body.message?.trim() || "Recommendation request failed.";
  const details = [body.error, body.provider, typeof body.provider_status === "number" ? `HTTP ${body.provider_status}` : undefined].filter(Boolean);
  return details.length > 0 ? `${message} [${details.join(" · ")}]` : message;
}

export async function parseRecommendationApiResponse(response: Response): Promise<RecommendationResult | RecommendationApiErrorBody> {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error(`Recommendation API returned an empty response. [HTTP ${response.status}]`);
  }

  try {
    return JSON.parse(text) as RecommendationResult | RecommendationApiErrorBody;
  } catch {
    throw new Error(`Recommendation API returned a non-JSON response. [HTTP ${response.status}]`);
  }
}
