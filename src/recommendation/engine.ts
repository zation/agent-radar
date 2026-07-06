import type {
  QueryUnderstanding,
  RatingResult,
  RecommendationCandidate,
  RecommendationQuery,
  RecommendationResult,
  RecommendedAction,
  RejectedCandidate,
  RiskLevel,
  SearchIndex,
  ToolCard
} from "../schema.js";

const riskRank: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
  unknown: 5
};

const toleranceRank = {
  low: 1,
  medium: 2,
  high: 3
};

export function recommendTools(
  query: RecommendationQuery,
  cards: ToolCard[],
  ratings: RatingResult[],
  index: SearchIndex
): RecommendationResult {
  const understanding = understandQuery(query);
  const ratingByTool = new Map(ratings.map((rating) => [rating.tool_id, rating]));
  const cardByTool = new Map(cards.map((card) => [card.id, card]));
  const rejected: RejectedCandidate[] = [];

  const scored = index.documents
    .map((document) => {
      const card = cardByTool.get(document.tool_id)!;
      const rating = ratingByTool.get(document.tool_id)!;
      const taskMatch = scoreTaskMatch(query, understanding, document.text, card.tags);
      const typeFit = query.preferred_tool_types?.includes(card.type) ? 10 : 0;
      const stackFit = (query.language_or_stack ?? []).some((stack) => document.text.includes(stack.toLowerCase())) ? 8 : 0;
      const safetyFit = scoreSafetyFit(rating.risk_level, query.risk_tolerance ?? "medium");
      const fitScore = Math.round(taskMatch * 0.45 + rating.overall_score * 0.2 + confidenceScore(card.confidence) * 0.15 + safetyFit * 0.2 + typeFit + stackFit);
      return { card, rating, fitScore, taskMatch };
    })
    .filter((entry) => {
      if (entry.rating.recommendation_level === "avoid" || entry.rating.recommendation_level === "insufficient_evidence") {
        rejected.push({ tool_id: entry.card.id, reason: "rating_not_reliable" });
        return false;
      }
      if (entry.taskMatch < 20) return false;
      if (entry.card.maturity === "deprecated") {
        rejected.push({ tool_id: entry.card.id, reason: "deprecated" });
        return false;
      }
      return true;
    })
    .sort((a, b) => b.fitScore - a.fitScore);

  const tolerance = query.risk_tolerance ?? "medium";
  const usable = scored.filter((entry) => {
    if (riskExceedsTolerance(entry.rating.risk_level, tolerance)) {
      rejected.push({
        tool_id: entry.card.id,
        reason: `risk_level_${entry.rating.risk_level}_exceeds_${tolerance}_tolerance`
      });
      return false;
    }
    return true;
  });

  const candidatesSource = usable.length > 0 ? usable : scored.filter((entry) => entry.rating.risk_level === "high" || entry.rating.risk_level === "critical");
  const candidates = candidatesSource.slice(0, query.top_k ?? 5).map<RecommendationCandidate>((entry, indexNumber) => ({
    tool_id: entry.card.id,
    name: entry.card.name,
    rank: indexNumber + 1,
    recommendation_level: entry.rating.recommendation_level,
    fit_score: entry.fitScore,
    risk_level: entry.rating.risk_level,
    tags: entry.card.tags,
    why: buildWhy(entry.card, understanding),
    risks: buildRisks(entry.card),
    not_for: entry.card.not_for,
    next_steps: buildNextSteps(entry.card, entry.rating.risk_level),
    evidence_refs: [...entry.card.evidence_refs, entry.rating.id]
  }));

  const action = chooseAction(candidates, query, understanding, usable.length);
  return {
    id: `rec-${Date.now().toString(36)}`,
    schema_version: "recommendation_result.v1",
    query,
    query_understanding: understanding,
    recommended_action: action,
    candidates: action === "no_reliable_match" ? [] : candidates,
    rejected_candidates: rejected,
    no_match_reason:
      action === "no_reliable_match"
        ? "No reliable candidate fits the task and risk tolerance. High-risk payment, database, secret, or production actions require human review."
        : undefined
  };
}

export function understandQuery(query: RecommendationQuery): QueryUnderstanding {
  const text = query.task.toLowerCase();
  const domains: string[] = [];
  const capabilities: string[] = [];
  const permissions: string[] = [];
  const riskFlags: string[] = [];

  addIf(text, ["python", "测试", "test", "coverage", "覆盖率"], domains, "testing");
  addIf(text, ["gmail", "email", "邮件", "待办"], domains, "communication");
  addIf(text, ["browser", "浏览器", "截图", "screenshot", "网页"], domains, "browser_automation");
  addIf(text, ["stripe", "checkout", "payment", "支付", "退款"], domains, "payment");
  addIf(text, ["database", "数据库", "生产"], domains, "database");
  addIf(text, ["next.js", "nextjs"], domains, "web_app");

  if (domains.includes("testing")) capabilities.push("test_generation", "test_strategy");
  if (domains.includes("communication")) capabilities.push("email_summary");
  if (domains.includes("browser_automation")) capabilities.push("browser_screenshot");
  if (domains.includes("payment")) capabilities.push("payment_integration");

  if (domains.includes("testing")) permissions.push("filesystem");
  if (domains.includes("communication")) permissions.push("email");
  if (domains.includes("browser_automation")) permissions.push("browser", "network");
  if (domains.includes("payment")) permissions.push("payment", "secrets", "network");
  if (domains.includes("database")) permissions.push("database");

  for (const permission of permissions) {
    if (["email", "payment", "secrets", "database"].includes(permission)) riskFlags.push(permission);
  }

  return {
    intent: domains[0] ?? "general_tool_selection",
    task_domains: unique(domains),
    required_capabilities: unique(capabilities),
    likely_permissions: unique(permissions),
    tool_type_hints: query.preferred_tool_types ?? ["skill", "mcp", "agent"],
    risk_flags: unique(riskFlags),
    confidence: domains.length > 0 ? "medium" : "low"
  };
}

function scoreTaskMatch(query: RecommendationQuery, understanding: QueryUnderstanding, text: string, tags: string[]): number {
  const words = tokenize(query.task);
  const keywordHits = words.filter((word) => word.length > 1 && text.includes(word)).length;
  const domainHits = understanding.task_domains.filter((domain) => tags.includes(domain) || text.includes(domain)).length;
  const capabilityHits = understanding.required_capabilities.filter((capability) => text.includes(capability.replace("_", " "))).length;
  return Math.min(100, keywordHits * 10 + domainHits * 35 + capabilityHits * 10);
}

function scoreSafetyFit(risk: RiskLevel, tolerance: "low" | "medium" | "high"): number {
  if (risk === "unknown") return 20;
  if (riskExceedsTolerance(risk, tolerance)) return 25;
  return 100 - (riskRank[risk] - 1) * 15;
}

function riskExceedsTolerance(risk: RiskLevel, tolerance: "low" | "medium" | "high"): boolean {
  if (risk === "unknown") return true;
  return riskRank[risk] > toleranceRank[tolerance] + 1;
}

function chooseAction(
  candidates: RecommendationCandidate[],
  query: RecommendationQuery,
  understanding: QueryUnderstanding,
  usableCount: number
): RecommendedAction {
  const hasCriticalDomain = understanding.risk_flags.some((flag) => flag === "payment" || flag === "database" || flag === "secrets");
  const productionLike = /生产|线上|refund|退款|production/i.test(query.task);
  if (hasCriticalDomain && productionLike && (query.risk_tolerance ?? "medium") === "low") return "no_reliable_match";
  if (candidates.length === 0) return "no_reliable_match";
  if (usableCount === 0 && understanding.risk_flags.includes("email")) return "ask_human";
  if (usableCount === 0 && hasCriticalDomain) return "ask_human";
  if (usableCount === 0) return "no_reliable_match";
  if (candidates.some((candidate) => candidate.risk_level === "high" || candidate.risk_level === "critical")) return "ask_human";
  if (candidates.length === 1) return "use";
  return "compare";
}

function buildWhy(card: ToolCard, understanding: QueryUnderstanding): string[] {
  const matchedTags = card.tags.filter((tag) => understanding.task_domains.includes(tag));
  return [
    matchedTags.length > 0
      ? `匹配任务标签 ${matchedTags.join("、")}，并覆盖 ${card.use_cases[0]}。`
      : `覆盖 ${card.primary_purpose}，可作为该任务的候选。`
  ];
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

function confidenceScore(confidence: string): number {
  if (confidence === "high") return 95;
  if (confidence === "medium") return 75;
  if (confidence === "low") return 45;
  return 20;
}

function addIf(text: string, needles: string[], target: string[], value: string): void {
  if (needles.some((needle) => text.includes(needle))) target.push(value);
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}.+#-]+/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function unique<T>(items: T[]): T[] {
  return [...new Set(items)];
}
