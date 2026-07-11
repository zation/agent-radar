import type {
  Permission, RatingResult, RecommendationCandidate, RecommendationQuery,
  RecommendationSafetyAssessment, RecommendedAction, RiskLevel, SafetyReasonCode, ToolCard
} from "../schema.js";

export interface RecommendationSafetyInput {
  query: RecommendationQuery;
  candidates: RecommendationCandidate[];
  cards: ToolCard[];
  ratings: RatingResult[];
}

const rank: Record<RiskLevel, number> = { low: 1, medium: 2, high: 3, critical: 4, unknown: 5 };

export function assessRecommendationSafety(input: RecommendationSafetyInput): RecommendationSafetyAssessment {
  const cards = new Map(input.cards.map((card) => [card.id, card]));
  const ratings = new Map(input.ratings.map((rating) => [rating.tool_id, rating]));
  const reasons = new Set<SafetyReasonCode>();
  let risk: RiskLevel = "low";

  for (const candidate of input.candidates) {
    const card = cards.get(candidate.tool_id);
    if (!card) continue;
    risk = higherRisk(risk, card.security.risk_level);
    risk = higherRisk(risk, ratings.get(card.id)?.risk_level ?? "unknown");
    if (card.security.trust_level === "unknown") reasons.add("trust_unknown");
    for (const permission of card.permissions) {
      const rule = permissionRule(permission);
      risk = higherRisk(risk, rule.risk);
      reasons.add(rule.reason);
      if (input.query.allowed_permissions?.length && !input.query.allowed_permissions.includes(permission.scope)) reasons.add("permission_not_allowed");
      if (card.security.trust_level === "unknown" && permission.scope === "code_execution") reasons.add("unknown_trust_code_execution");
    }
  }

  const tolerance = input.query.risk_tolerance ?? "medium";
  if ((tolerance === "low" && rank[risk] > rank.low) || (tolerance === "medium" && rank[risk] > rank.medium)) reasons.add("risk_tolerance_exceeded");
  const maximumAllowedAction: RecommendedAction = reasons.has("unknown_trust_code_execution")
    ? "avoid"
    : risk === "high" || risk === "critical" || risk === "unknown" || reasons.has("permission_not_allowed") || reasons.has("risk_tolerance_exceeded")
      ? "ask_human"
      : "use";
  const requiresApproval = maximumAllowedAction === "ask_human";
  const labels = [...reasons].map(reasonLabel);
  return {
    risk_level: risk,
    reason_codes: [...reasons],
    requires_human_approval: requiresApproval,
    approval_reason: requiresApproval ? `需要确认以下安全边界：${labels.join("、")}。` : undefined,
    confirmation_questions: requiresApproval ? labels.map((label) => `是否确认${label}并限制在本次任务所需范围？`) : [],
    safe_defaults: buildSafeDefaults(reasons),
    maximum_allowed_action: maximumAllowedAction
  };
}

function permissionRule(permission: Permission): { risk: RiskLevel; reason: SafetyReasonCode } {
  if (permission.scope === "unknown" || permission.access === "unknown") return { risk: "unknown", reason: "permission_unknown" };
  if (permission.scope === "payment") return { risk: "critical", reason: "payment_access" };
  if (permission.scope === "database") return permission.access === "write" || permission.access === "read_write" || permission.access === "admin"
    ? { risk: "critical", reason: "database_write" } : { risk: "high", reason: "database_read" };
  if (permission.scope === "cloud") return permission.access === "admin" ? { risk: "critical", reason: "cloud_admin" } : { risk: "high", reason: "cloud_access" };
  if (permission.scope === "email") return { risk: "high", reason: "email_access" };
  if (permission.scope === "secrets") return { risk: "high", reason: "secrets_access" };
  if (permission.scope === "shell") return { risk: "high", reason: "shell_execution" };
  if (permission.scope === "code_execution") return { risk: "high", reason: "code_execution" };
  if (permission.scope === "filesystem") return permission.access === "read" ? { risk: "medium", reason: "filesystem_read" } : { risk: "high", reason: "filesystem_write" };
  if (permission.scope === "browser") return { risk: "medium", reason: "browser_control" };
  return { risk: "medium", reason: "network_access" };
}

function higherRisk(left: RiskLevel, right: RiskLevel): RiskLevel { return rank[right] > rank[left] ? right : left; }
function reasonLabel(reason: SafetyReasonCode): string { return reason.replaceAll("_", " "); }
function buildSafeDefaults(reasons: Set<SafetyReasonCode>): string[] {
  const defaults = ["仅授予完成本次任务所需的最小权限"];
  if (reasons.has("email_access") || reasons.has("database_read")) defaults.push("优先使用只读权限并限制数据范围");
  if (reasons.has("payment_access") || reasons.has("database_write") || reasons.has("cloud_admin")) defaults.push("先在测试环境执行并禁止生产写入");
  if (reasons.has("secrets_access")) defaults.push("使用临时、最小权限凭证且不写入日志");
  return defaults;
}
