# 09 推荐引擎

## 文档用途

本文件定义 Agent Radar 如何根据用户需求或 coding agent 任务推荐工具。推荐必须可解释、可审计，并能说明不推荐的理由。

推荐引擎的目标不是输出最热工具，而是在任务、环境、风险和证据约束下给出可执行选择。

## 推荐原则

- 任务匹配优先于热度。
- 安全边界优先于排序优化。
- 证据不足时保持保守。
- 推荐理由必须引用 Tool Card 字段、评分结果或来源证据。
- 没有可靠候选时返回 `no_reliable_match`。
- 输出应同时适合人类阅读和 agent 决策。

## 输入 Schema

推荐输入为 `Recommendation Query`。

```json
{
  "task": "给 Next.js 应用接入 Stripe Checkout",
  "language_or_stack": ["typescript", "next.js"],
  "environment": ["local_dev", "web_app"],
  "preferred_tool_types": ["skill", "framework", "docs"],
  "allowed_permissions": ["network", "filesystem_read"],
  "risk_tolerance": "medium",
  "existing_tools": ["codex"],
  "budget": "free_or_low_cost",
  "output_format": "json",
  "top_k": 5,
  "api_key": "sk-...",
  "model": "gpt-4.1"
}
```

字段说明：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `task` | 是 | 自然语言任务 |
| `language_or_stack` | 否 | 技术栈、语言、框架 |
| `environment` | 否 | 本地、CI、浏览器、云、IDE 等 |
| `preferred_tool_types` | 否 | 候选工具类型 |
| `allowed_permissions` | 否 | 用户允许的权限范围 |
| `risk_tolerance` | 否 | `low`、`medium`、`high` |
| `existing_tools` | 否 | 当前 agent 或项目已有工具 |
| `budget` | 否 | 成本偏好 |
| `output_format` | 否 | `json`、`markdown` |
| `top_k` | 否 | 返回数量 |
| `api_key` | API 调用必填 | BYOK LLM API key，只用于当前请求 |
| `model` | API 调用必填 | LLM 模型名称 |

## LLM 推荐流程

当前实现已移除本地关键词打分推荐逻辑。`recommend_tools` 使用用户提供的 API key 调用 LLM，由 LLM 完成查询理解、候选选择、排序解释和反推荐说明。

本地代码只保留以下边界：

- 组装 Tool Card、Rating Result、风险和证据上下文。
- 要求 LLM 只返回已知 `tool_id`，不得发明工具。
- 校验并归一化 LLM 输出为 `Recommendation Result`。
- 对 unknown `tool_id` 返回 `no_reliable_match` 或加入 `rejected_candidates`。
- 对 `high`、`critical`、`unknown` 风险候选保持保守，不能把高风险结果降级成可直接 `use`。
- API key 只用于当前请求，不写入 artifacts、日志或响应体。

## 查询理解

推荐前先将任务解析为结构化意图。

输出字段：

```json
{
  "intent": "payment_integration",
  "task_domains": ["payments", "web_app"],
  "required_capabilities": ["stripe_checkout", "nextjs_integration"],
  "likely_permissions": ["network", "secrets"],
  "tool_type_hints": ["skill", "framework", "docs"],
  "risk_flags": ["payment", "api_keys"],
  "confidence": "medium"
}
```

要求：

- 不确定时标记低置信，不强行推断。
- 如果任务涉及支付、邮件、数据库、云账号、secret 或 shell，必须生成风险标记。
- 查询理解结果应进入最终推荐解释。

## 候选召回

候选上下文来源：

- Tool Card `name`、`summary`、`primary_purpose`、`use_cases`、`tags`。
- Rating Result 分项分。
- 分类标签。
- 适用 agent。
- 来源可信度。

召回和排序由 LLM 在给定候选上下文内完成。LLM 必须保留匹配原因，例如命中的能力、标签、评分、风险或证据字段。

## 硬过滤

以下情况应直接排除或降级：

| 条件 | 行为 |
| --- | --- |
| 工具已 deprecated | 默认排除 |
| 风险等级超过用户偏好 | 降级或要求人工确认 |
| 关键字段缺失 | 不进入可靠推荐 |
| 证据质量 unknown | 标记 `insufficient_evidence` |
| 任务明确要求本地但工具仅 hosted | 降级 |
| 需要未允许权限 | `ask_human` 或排除 |
| 与技术栈不兼容 | 排除或降级 |

硬过滤不能删除所有上下文；被排除的关键候选应进入 `rejected_candidates` 并说明原因。

## 排序规则

排序由 LLM 生成 `fit_score`，范围 0-100。LLM 应综合任务匹配、Rating Result、证据质量、维护状态、集成适配和安全适配。

本地实现不维护固定排序公式，避免产生与 LLM 推荐相冲突的第二套推荐系统。若 LLM 未返回合法 `fit_score`，本地仅使用 Rating Result 总分作为展示兜底。

### 风险调整

- 风险超过偏好：最高推荐动作变为 `ask_human`。
- `critical` 风险：默认不输出 `use`。
- 权限未知：安全分不超过 40。
- 来源 unknown：证据分不超过 30。

### 多样性规则

Top 结果应避免全是同一类型，除非任务明确要求。

示例：

- 一个 task 可以返回官方文档/skill、MCP server、CLI 三类候选。
- 如果首选是高权限 MCP，应同时给出低权限文档或手写方案。

## 输出 Schema

推荐输出为 `Recommendation Result`。

```json
{
  "schema_version": "recommendation_result.v1",
  "recommended_action": "compare",
  "query_understanding": {
    "intent": "payment_integration",
    "risk_flags": ["payment", "secrets"],
    "confidence": "medium"
  },
  "candidates": [
    {
      "tool_id": "stripe-official-docs",
      "rank": 1,
      "recommendation_level": "recommended",
      "fit_score": 88,
      "risk_level": "medium",
      "why": [
        "官方来源，覆盖 Next.js 和 Stripe Checkout 集成。"
      ],
      "risks": [
        "需要处理支付密钥，不能把 live secret 放入 agent 上下文。"
      ],
      "not_for": [
        "不适合需要完全自定义支付编排的场景。"
      ],
      "next_steps": [
        "阅读官方测试模式文档，先使用 test key。"
      ],
      "evidence_refs": ["source-record-stripe-docs", "rating:stripe-official-docs"]
    }
  ],
  "rejected_candidates": [
    {
      "tool_id": "unknown-payment-cli",
      "reason": "来源未知且涉及支付 secret。"
    }
  ]
}
```

## 推荐动作

| `recommended_action` | 使用条件 | Agent 行为 |
| --- | --- | --- |
| `use` | 单一候选明显最优且低/中风险可控 | 可纳入执行计划 |
| `compare` | 多个候选接近或权衡明显 | 展示差异并选择 |
| `ask_human` | 涉及高风险权限、账号或不确定性 | 先请求确认 |
| `avoid` | 任务相关但风险或质量不可接受 | 不使用 |
| `no_reliable_match` | 没有可靠候选 | 不强行推荐 |

## 反推荐规则

工具应被标记为不推荐的情况：

- 与任务核心能力不匹配。
- 维护状态为 `deprecated`。
- 来源证据不足。
- 需要超过任务必要范围的权限。
- 安装方式不透明。
- 涉及 secret、支付、云 admin、邮件或数据库写入但无官方证据。
- 文档缺失或示例不可复现。

反推荐输出必须包含原因，不只隐藏候选。

## 示例查询

### 查询一：为 Python 项目补测试

输入：

```json
{
  "task": "为一个 Python 项目增加测试覆盖率",
  "language_or_stack": ["python"],
  "environment": ["local_dev"],
  "risk_tolerance": "medium",
  "preferred_tool_types": ["cli", "agent", "skill"]
}
```

期望：

- 推荐能读取项目文件、生成测试或指导测试策略的工具。
- 风险提示文件系统写入。
- 不推荐来源不明且会自动执行代码的工具。

### 查询二：在 Codex 中总结 Gmail 待办

输入：

```json
{
  "task": "在 Codex 中读取 Gmail 并总结待办",
  "existing_tools": ["codex"],
  "allowed_permissions": ["email_read"],
  "risk_tolerance": "low"
}
```

期望：

- 候选必须明确支持 Gmail 或邮件读取。
- 因涉及邮件内容，应输出 `ask_human`。
- 推荐解释必须包含数据隐私风险。

### 查询三：找浏览器自动化工具

输入：

```json
{
  "task": "让 agent 打开本地网页并做截图验证",
  "environment": ["local_dev", "browser"],
  "risk_tolerance": "medium"
}
```

期望：

- 推荐 browser automation、Playwright、MCP 或 skill。
- 提示浏览器权限和本地服务访问范围。

### 查询四：未知高风险支付工具

输入：

```json
{
  "task": "自动处理线上支付退款",
  "risk_tolerance": "low"
}
```

期望：

- 不推荐未知来源工具。
- 输出人工确认和官方文档优先。
- 风险等级至少 high 或 critical。

## Markdown 输出模板

```markdown
推荐动作：ask_human

首选候选：<工具名>
理由：<基于任务、分类、评分的解释>
主要风险：<权限、secret、数据外传>
适用条件：<什么时候可以用>
不适用：<什么时候不要用>
来源：<来源链接或引用 ID>
下一步：<agent 或用户应做什么>
```

## Workers MCP API 工具

Workers API 同时提供两种 agent-facing 入口：

- `/api/mcp_manifest`：返回只读工具定义，供简单 HTTP JSON client 消费。
- `/api/mcp`：最小 MCP JSON-RPC endpoint，支持 `initialize`、`tools/list` 和 `tools/call`。`tools/call` 只包装下列只读工具，返回 text content 中的 JSON 字符串。
- `data/provider_registry.json`：发布流水线输出的版本化 provider runtime config，包含可选 model、provider、endpoint、API model、instruction role 和 BYOK key handling，不包含 API key。
- `data/mcp_examples.json`：发布流水线输出的 agent-facing JSON-RPC 示例，覆盖 initialize、tools/list、get_tool_card 和 search_tools。
- `data/mcp_smoke_checklist.json`：发布流水线输出的部署验收清单，覆盖 initialize、tools/list、只读 tools/call 和只读边界。
- `npm run mcp:smoke`：读取 `AGENT_RADAR_MCP_BASE_URL`，对已部署 `/api/mcp` 执行同一组只读 smoke checks。

### `search_tools`

输入：

- `query`
- `filters`
- `top_k`

输出：

- 工具摘要列表。
- 匹配字段。
- 风险和置信度。

### `get_tool_card`

输入：

- `tool_id`

输出：

- Tool Card。
- Rating Result。
- 来源证据。

### `recommend_tools`

输入：

- Recommendation Query。

输出：

- Recommendation Result。

### `explain_rating`

输入：

- `tool_id`
- 可选 `task`

输出：

- 分项评分解释。
- 主要扣分和加分。
- 安全风险解释。

## 评测要求

推荐引擎必须通过：

- golden queries。
- no reliable match cases。
- high-risk permission cases。
- 同类工具排序 cases。
- 推荐解释质量抽查。

由于推荐依赖 LLM，离线构建没有 `AGENT_RADAR_LLM_API_KEY` 时应输出 blocked eval summary，而不是运行旧本地规则引擎。

失败时必须输出：

- 哪些 query 失败。
- 排名或推荐动作如何变化。
- 失败是数据问题、评分问题、LLM 输出问题还是安全归一化问题。

## 维护规则

- 推荐理由必须引用具体字段或评分依据。
- 当没有合适工具时，应明确返回“暂无可靠推荐”，而不是强行推荐。
- 修改 LLM prompt、输出归一化或安全闸门必须运行推荐评测。
- 新增推荐输出字段必须同步更新数据模型和 Workers MCP API contract。
