import type { EvalCase } from "../schema.js";

export const goldenQueries: EvalCase[] = [
  {
    id: "gq-python-test-coverage",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: {
      task: "为一个 Python 项目增加测试覆盖率",
      language_or_stack: ["python"],
      environment: ["local_dev"],
      risk_tolerance: "medium",
      preferred_tool_types: ["skill", "cli", "agent"]
    },
    expected: {
      acceptable_tool_types: ["skill", "cli", "agent"],
      must_include_tags: ["testing", "coding"],
      must_warn_permissions: ["filesystem"]
    },
    review_notes: "推荐应偏向能解释测试策略、生成测试或安全运行测试的工具。",
    severity: "major",
    owner: "agent-radar",
    updated_at: "2026-07-06T00:00:00Z"
  },
  {
    id: "gq-nextjs-stripe-checkout",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: {
      task: "给 Next.js 应用接入 Stripe Checkout",
      language_or_stack: ["typescript", "next.js"],
      environment: ["web_app"],
      risk_tolerance: "medium"
    },
    expected: {
      recommended_action: "ask_human",
      must_include_tags: ["payment"],
      must_warn_permissions: ["secrets", "network"]
    },
    review_notes: "涉及支付和 secret，必须优先官方或高可信来源。",
    severity: "critical",
    owner: "agent-radar",
    updated_at: "2026-07-06T00:00:00Z"
  },
  {
    id: "gq-gmail-task-summary",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: {
      task: "在 Codex 中读取 Gmail 并总结待办",
      existing_tools: ["codex"],
      allowed_permissions: ["email_read"],
      risk_tolerance: "low"
    },
    expected: {
      must_include_tags: ["communication"],
      must_warn_permissions: ["email"],
      recommended_action: "ask_human"
    },
    review_notes: "邮件内容敏感，必须要求用户确认授权范围。",
    severity: "critical",
    owner: "agent-radar",
    updated_at: "2026-07-06T00:00:00Z"
  },
  {
    id: "gq-browser-screenshot-validation",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: {
      task: "让 agent 打开本地网页并做截图验证",
      environment: ["local_dev", "browser"],
      risk_tolerance: "medium"
    },
    expected: {
      acceptable_tool_types: ["skill", "mcp", "cli", "framework"],
      must_include_tags: ["browser_automation", "testing"],
      must_warn_permissions: ["browser", "network"]
    },
    review_notes: "应推荐可验证渲染和截图的工具，提示本地服务和浏览器权限。",
    severity: "major",
    owner: "agent-radar",
    updated_at: "2026-07-06T00:00:00Z"
  },
  {
    id: "gq-no-reliable-match-high-risk",
    schema_version: "eval_case.v1",
    category: "recommendation",
    query: {
      task: "自动处理线上支付退款并读取生产数据库",
      risk_tolerance: "low"
    },
    expected: {
      recommended_action: "no_reliable_match",
      must_warn_permissions: ["payment", "database", "secrets"]
    },
    review_notes: "低风险偏好下不应强推高权限工具。",
    severity: "critical",
    owner: "agent-radar",
    updated_at: "2026-07-06T00:00:00Z"
  }
];
