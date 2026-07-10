# 04 数据模型

## 文档用途

本文件定义 Agent Radar 的核心数据结构，尤其是 Raw Source Snapshot、Source Record、Tool Card、Rating Result、Recommendation Result 和 Eval Case。它是采集、评分、搜索、推荐、评测和 agent 查询的共同契约。

字段设计目标是让人类能复核，让 coding agent 能直接用，不依赖隐含上下文做工具选择。

## 数据模型原则

- 所有关键结论必须有来源或规则依据。
- 标准化字段和原始字段分离，避免不可逆丢失。
- 缺失和不确定应显式表达，不能用猜测填补。
- 每条记录都应包含时间戳、schema 版本和置信度。
- 评分和推荐结果引用 Tool Card，不直接改写 Tool Card。
- 人工修正作为 override 记录保存，不覆盖原始快照。

## 通用字段约定

### ID

- 类型：字符串。
- 格式：小写 kebab-case 或带命名空间前缀。
- 示例：`mcp-filesystem-server`、`skill-openai-docs`。
- 要求：稳定、可读、避免用易变标题生成唯一 ID。

### 时间戳

- 类型：ISO 8601 UTC 字符串。
- 示例：`2026-07-06T12:00:00Z`。
- 适用字段：`created_at`、`updated_at`、`last_checked_at`、`fetched_at`、`rated_at`。

### 置信度

- 类型：枚举。
- 可选值：`high`、`medium`、`low`、`unknown`。
- 含义：
  - `high`：来自官方或多来源一致证据。
  - `medium`：来自可信社区或单一可信来源。
  - `low`：来源不完整、间接或存在冲突。
  - `unknown`：无法判断。

### 来源证据

字段级证据使用 `evidence_refs` 引用 Source Record 或人工修正记录。

```json
{
  "field": "install_methods",
  "source_record_ids": ["github-openai-agents-sdk-20260706"],
  "confidence": "high",
  "notes": "来自官方 README installation section"
}
```

## Raw Source Snapshot

Raw Source Snapshot 是采集到的不可变原始数据。

### 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `github-topic-ai-agent-20260706-abc123` | 快照 ID |
| `schema_version` | string | 是 | `raw_snapshot.v1` | schema 版本 |
| `source_id` | string | 是 | `github-topic-ai-agent` | 来源注册表 ID |
| `source_url` | string | 是 | `https://github.com/topics/ai-agent` | 实际请求 URL |
| `fetched_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 采集时间 |
| `fetch_method` | enum | 是 | `http` | `http`、`api`、`manual`、`file_import` |
| `status` | enum | 是 | `success` | `success`、`partial`、`failed` |
| `http_status` | number | 否 | `200` | HTTP 状态码 |
| `content_type` | string | 否 | `application/json` | 响应类型 |
| `content_hash` | string | 是 | `sha256:...` | 原始内容哈希 |
| `content_path` | string | 是 | `data/raw/...json` | 原始内容存储位置 |
| `request_meta` | object | 否 | `{ "etag": "..." }` | 不含 secret 的请求元数据 |
| `error` | object | 否 | `{ "code": "rate_limited" }` | 失败原因 |

### 质量要求

- 不保存 token、cookie、私密 header。
- 不覆盖同一 hash 的原始内容。
- 解析失败也应保存快照和错误。

## Source Record

Source Record 是从 Raw Snapshot 解析出的来源级结构化记录，保留来源语义。

### 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `github-repo-example-agent-20260706` | 来源记录 ID |
| `schema_version` | string | 是 | `source_record.v1` | schema 版本 |
| `snapshot_id` | string | 是 | `github-topic-ai-agent-...` | 对应快照 |
| `source_id` | string | 是 | `github-topic-ai-agent` | 来源注册表 ID |
| `record_type` | enum | 是 | `repository` | `repository`、`package`、`registry_entry`、`doc_page`、`list_item`、`manual` |
| `name` | string | 是 | `Example Agent` | 来源中的名称 |
| `description` | string | 否 | `An agent framework...` | 来源描述 |
| `urls` | array | 是 | `["https://github.com/org/repo"]` | 来源相关 URL |
| `raw_fields` | object | 是 | `{ "stars": 1200 }` | 保留来源原始字段 |
| `parsed_fields` | object | 否 | `{ "license": "MIT" }` | parser 提取字段 |
| `source_confidence` | enum | 是 | `medium` | 来源可信度 |
| `parsed_at` | datetime | 是 | `2026-07-06T12:05:00Z` | 解析时间 |
| `parser_version` | string | 是 | `github_repo_parser.v1` | parser 版本 |
| `warnings` | array | 否 | `["missing_license"]` | 解析警告 |

### 质量要求

- Source Record 不做跨来源合并。
- `raw_fields` 应尽量保留来源字段，但不能包含 secret。
- 解析不确定时写入 warnings，不静默丢弃。

## Tool Card

Tool Card 是 Agent Radar 推荐系统的核心标准化记录。

### 顶层字段

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `model-context-protocol-filesystem` | 稳定工具 ID |
| `schema_version` | string | 是 | `tool_card.v1` | schema 版本 |
| `name` | string | 是 | `Filesystem MCP Server` | 工具名称 |
| `type` | enum | 是 | `mcp` | 主类型 |
| `secondary_types` | array | 否 | `["cli"]` | 次要类型 |
| `summary` | string | 是 | `Provides filesystem tools through MCP.` | 一句话摘要 |
| `source_urls` | array | 是 | `["https://github.com/..."]` | 支撑卡片的来源 |
| `repo_url` | string | 否 | `https://github.com/org/repo` | 仓库 |
| `homepage_url` | string | 否 | `https://example.com` | 官网 |
| `docs_url` | string | 否 | `https://example.com/docs` | 文档 |
| `package_urls` | array | 否 | `["https://www.npmjs.com/package/..."]` | 包地址 |
| `license` | string | 否 | `MIT` | 许可证 |
| `primary_purpose` | string | 是 | `local_file_access` | 主要用途 |
| `use_cases` | array | 是 | `["read project files"]` | 适用场景 |
| `not_for` | array | 是 | `["untrusted repositories"]` | 不适用场景 |
| `tags` | array | 是 | `["filesystem", "local", "mcp-server"]` | 分类标签 |
| `supported_agents` | array | 否 | `["codex", "claude-code"]` | 已知适用 agent |
| `runtime_requirements` | object | 否 | `{ "node": ">=20" }` | 运行要求 |
| `install_methods` | array | 是 | 见下方 | 安装方式 |
| `auth_required` | enum | 是 | `none` | `none`、`api_key`、`oauth`、`account`、`unknown` |
| `permissions` | array | 是 | 见下方 | 权限模型 |
| `maintenance` | object | 是 | 见下方 | 维护状态 |
| `security` | object | 是 | 见下方 | 安全信息 |
| `maturity` | enum | 是 | `stable` | `experimental`、`beta`、`stable`、`deprecated`、`unknown` |
| `evidence_refs` | array | 是 | 见来源证据 | 字段证据 |
| `last_checked_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 最近检查 |
| `confidence` | enum | 是 | `high` | 卡片整体置信度 |
| `created_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 创建时间 |
| `updated_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 更新时间 |

### type 枚举

- `mcp`：MCP Server 或 MCP 工具集合。
- `skill`：面向 agent 的指令、工作流或能力包。
- `agent`：可独立执行任务的 agent 产品或开源项目。
- `framework`：构建 agent 或工具链的框架。
- `cli`：命令行工具。
- `prompt`：可复用 prompt 模板。
- `rules`：agent rules、policy 或项目指令包。
- `dataset`：可用于推荐或评测的数据集。
- `service`：托管服务或 SaaS。

### install_methods

```json
[
  {
    "method": "npm",
    "command": "npm install @example/tool",
    "docs_url": "https://example.com/docs/install",
    "confidence": "high"
  }
]
```

字段：

- `method`：`npm`、`pip`、`brew`、`docker`、`source`、`hosted`、`manual`、`unknown`。
- `command`：安装命令；不确定时为空。
- `docs_url`：安装文档。
- `confidence`：安装方式置信度。

### permissions

```json
[
  {
    "scope": "filesystem",
    "access": "read_write",
    "required": true,
    "notes": "Needs explicit directory allowlist."
  }
]
```

字段：

- `scope`：`filesystem`、`network`、`browser`、`email`、`database`、`cloud`、`payment`、`shell`、`code_execution`、`secrets`、`unknown`。
- `access`：`read`、`write`、`read_write`、`execute`、`admin`、`unknown`。
- `required`：是否完成主要功能必需。
- `notes`：权限解释。

### maintenance

```json
{
  "status": "active",
  "last_release_at": "2026-06-01T00:00:00Z",
  "last_commit_at": "2026-06-20T00:00:00Z",
  "issue_activity": "active",
  "maintainer_type": "official",
  "signals": ["recent_release", "docs_updated"]
}
```

字段：

- `status`：`active`、`slow`、`inactive`、`deprecated`、`unknown`。
- `last_release_at`：最近 release。
- `last_commit_at`：最近 commit。
- `issue_activity`：`active`、`limited`、`inactive`、`unknown`。
- `maintainer_type`：`official`、`company`、`community`、`individual`、`unknown`。
- `signals`：维护证据列表。

### security

```json
{
  "risk_level": "medium",
  "trust_level": "official",
  "known_risks": ["filesystem_write"],
  "requires_human_approval": true,
  "security_notes": "Use directory allowlist and avoid untrusted repos."
}
```

字段：

- `risk_level`：`low`、`medium`、`high`、`critical`、`unknown`。
- `trust_level`：`official`、`well_known_org`、`active_open_source`、`individual`、`commercial`、`unknown`。
- `known_risks`：风险标签。
- `requires_human_approval`：是否需要人工确认。
- `security_notes`：安全解释。

### AI 决策字段

Tool Card 可以包含 `ai_decision_notes`，用于直接进入 agent 上下文。

```json
{
  "when_to_use": ["Need structured access to local project files through MCP."],
  "when_to_avoid": ["Repository is untrusted or user has not approved filesystem access."],
  "questions_to_ask_human": ["Which directories may the tool access?"],
  "safe_defaults": ["read-only access", "directory allowlist"]
}
```

## Rating Result

Rating Result 是评分引擎对 Tool Card 的输出。

### 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `rating:model-context-protocol-filesystem:20260706` | 评分 ID |
| `schema_version` | string | 是 | `rating_result.v1` | schema 版本 |
| `tool_id` | string | 是 | `model-context-protocol-filesystem` | Tool Card ID |
| `tool_type` | enum | 是 | `mcp` | 工具类型 |
| `rules_version` | string | 是 | `rating_rules.v0.1-draft` | 规则版本 |
| `overall_score` | number | 是 | `82` | 0-100 |
| `recommendation_level` | enum | 是 | `recommended` | 推荐等级 |
| `risk_level` | enum | 是 | `medium` | 风险等级 |
| `dimension_scores` | object | 是 | `{ "task_fit": 90 }` | 分项分 |
| `explanations` | array | 是 | 见下方 | 评分解释 |
| `penalties` | array | 否 | `["missing_docs"]` | 扣分项 |
| `boosts` | array | 否 | `["official_source"]` | 加分项 |
| `evidence_quality` | enum | 是 | `high` | 证据质量 |
| `rated_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 评分时间 |

### recommendation_level

- `recommended`：适合常规推荐。
- `consider`：可作为备选，需说明限制。
- `situational`：只适合特定约束。
- `avoid`：不建议使用。
- `insufficient_evidence`：证据不足。

### explanations

```json
[
  {
    "dimension": "documentation_quality",
    "score": 85,
    "reason": "官方文档包含安装、权限和示例。",
    "evidence_refs": ["source-record-1"]
  }
]
```

## Recommendation Query

Recommendation Query 是用户或 agent 输入的任务上下文。

```json
{
  "task": "给 Next.js 应用接入 Stripe Checkout",
  "language_or_stack": ["typescript", "next.js"],
  "environment": ["local_dev", "web_app"],
  "preferred_tool_types": ["skill", "mcp", "framework"],
  "allowed_permissions": ["network", "filesystem_read"],
  "risk_tolerance": "medium",
  "existing_tools": ["codex"],
  "output_format": "json"
}
```

字段要求：

- `task` 必填。
- 其他字段可选，但缺失会降低任务解析置信度。
- `risk_tolerance`：`low`、`medium`、`high`。

## Recommendation Result

Recommendation Result 是推荐引擎输出。

### 字段定义

| 字段 | 类型 | 必填 | 示例 | 说明 |
| --- | --- | --- | --- | --- |
| `id` | string | 是 | `rec-20260706-abc123` | 推荐 ID |
| `schema_version` | string | 是 | `recommendation_result.v1` | schema 版本 |
| `query` | object | 是 | Recommendation Query | 原始或标准化查询 |
| `query_understanding` | object | 是 | `{ "intent": "payment_integration" }` | 任务解析 |
| `recommended_action` | enum | 是 | `compare` | agent 下一步 |
| `candidates` | array | 是 | 见下方 | 候选结果 |
| `rejected_candidates` | array | 否 | 见下方 | 被排除候选 |
| `no_match_reason` | string | 否 | `...` | 无结果原因 |
| `generated_at` | datetime | 是 | `2026-07-06T12:00:00Z` | 生成时间 |
| `data_version` | string | 是 | `data-20260706` | 数据版本 |
| `rules_version` | string | 是 | `recommendation_rules.v1` | 推荐规则版本 |

### candidate

```json
{
  "tool_id": "stripe-checkout-skill",
  "rank": 1,
  "recommendation_level": "recommended",
  "fit_score": 88,
  "risk_level": "medium",
  "why": ["Matches Next.js and Stripe Checkout task."],
  "risks": ["Requires payment provider credentials."],
  "not_for": ["Do not use for custom payment orchestration."],
  "next_steps": ["Read official Stripe docs before handling live keys."],
  "evidence_refs": ["source-record-1", "rating:stripe-checkout-skill"]
}
```

### recommended_action

- `use`：推荐使用。
- `compare`：多个候选接近，需要比较。
- `ask_human`：涉及权限、账号或不确定性，需要确认。
- `avoid`：不建议使用。
- `no_reliable_match`：没有可靠候选。

## Eval Case

Eval Case 用于评估搜索、评分和推荐质量。

```json
{
  "id": "golden-nextjs-stripe-checkout",
  "schema_version": "eval_case.v1",
  "category": "recommendation",
  "query": {
    "task": "给 Next.js 应用接入 Stripe Checkout",
    "language_or_stack": ["typescript", "next.js"],
    "risk_tolerance": "medium"
  },
  "expected": {
    "must_include_tags": ["payment", "next.js"],
    "must_warn_permissions": ["payment", "secrets"],
    "acceptable_tool_types": ["skill", "framework", "docs"],
    "should_not_recommend": ["unknown_payment_agent"]
  },
  "review_notes": "应优先推荐官方或高可信来源，不能推荐来源不明的支付自动化。"
}
```

字段：

- `category`：`search`、`rating`、`recommendation`、`data_quality`。
- `query`：输入。
- `expected`：可测试预期。
- `review_notes`：人工解释。

## Override Record

Override Record 记录人工修正。

```json
{
  "id": "override-tool-x-license-20260706",
  "schema_version": "override_record.v1",
  "target_type": "tool_card",
  "target_id": "tool-x",
  "field": "license",
  "new_value": "Apache-2.0",
  "reason": "官方仓库 LICENSE 文件已更新。",
  "evidence_urls": ["https://github.com/org/tool-x/blob/main/LICENSE"],
  "created_by": "maintainer",
  "created_at": "2026-07-06T12:00:00Z"
}
```

要求：

- 不得无来源覆盖关键字段。
- Override 应可回滚。
- 影响评分或推荐时必须运行相关评测。
- 被应用到 Tool Card draft 时，Override Record id 必须进入 draft `evidence_refs`，以便 validator 校验 `override-*` evidence ref 是否有匹配 Override Record。

## v0.3 P1 数据可信度派生 Artifacts

v0.3 P1 不改变 `tool_card.v1` 字段语义，而是新增可回放的派生证据：

- `tool_card_field_value_provenance.v2`：按 Tool Card 和字段保存全部候选来源、原始值摘要、归一化值、parser/normalizer 版本、选择状态与理由；关键字段覆盖率必须为 100%。迁移期继续输出 v1。
- `tool_card_conflict_report.v1`：保存 canonical identity、候选来源、冲突类型、自动选择规则及未解决关键冲突。未解决关键冲突生成 intervention 并阻断发布。
- `tool_card_url_validation.v2`：按字段路径保存 URL 的 `reachable`、`permanent_failure`、`auth_required`、`rate_limited`、`transient_error` 或 `skipped` 状态，以及请求方法、最终 URL、检查时间和连续失败历史。迁移期继续输出 v1。
- `data_quality_report.v1`：汇总覆盖数量、必填字段、provenance、置信度、未知字段、重复、冲突、URL 与审核状态，并用稳定 reason code 输出硬门禁。
- `review_summary.v2`：发布级摘要，先列阻断项，再列 warning 和变更；每项包含对象 ID、evidence path 和建议动作。摘要引用输入 artifact checksums，最终 manifest 再记录摘要自身 checksum，避免循环依赖。

当前 v1/v2 文件均进入 reviewed bundle 和 artifact manifest；消费者迁移完成前不得删除 v1。

## Review Summary v1（单对象历史模型）

Review Summary v1 是对 Tool Card draft、已发布 Tool Card 或 promotion candidate 的单对象自动审核模型。当前发布链路使用上方的发布级 `review_summary.v2`；v1 仅保留历史语义，不替代安全 gate 或 GitHub production environment approval。

```json
{
  "id": "review-summary:mcp-github:20260708",
  "schema_version": "review_summary.v1",
  "target_type": "tool_card_draft",
  "target_id": "mcp-github",
  "generated_by": "rules+llm",
  "recommended_action": "needs_review",
  "confidence": "medium",
  "evidence": [
    {
      "kind": "official_docs",
      "url": "https://github.com/modelcontextprotocol/servers",
      "summary": "Official repository documents installation and permissions."
    }
  ],
  "risk_findings": [
    {
      "scope": "cloud",
      "severity": "high",
      "reason": "GitHub write scopes may affect repositories."
    }
  ],
  "missing_fields": ["security.data_flow"],
  "duplicate_signals": ["same_repo_url:mcp-github-server"],
  "feedback_summary_ref": "feedback-summary:mcp-github:20260708",
  "review_required_reasons": ["high_risk_permissions", "possible_duplicate"],
  "generated_at": "2026-07-08T00:00:00Z"
}
```

字段说明：

- `target_type`：`tool_card_draft`、`tool_card`、`promotion_candidate`、`source_record`。
- `generated_by`：`rules`、`llm`、`rules+llm`、`human`。
- `recommended_action`：`promote`、`keep_draft`、`needs_review`、`reject`、`retire`。
- `evidence`：必须引用已采集来源或内部 artifact，不能写入无来源事实。
- `feedback_summary_ref`：可选，引用同一工具或推荐场景的反馈汇总。

要求：

- LLM 生成的摘要必须保留输入 artifact id、来源 URL 或 evidence ref。
- `recommended_action: promote` 不能绕过 validator、security gate、eval gate。
- 涉及高风险权限、trust level 提升、风险等级降低或 retire 的结论必须进入人工异常队列。

## Feedback Record

Feedback Record 记录用户或 agent 对 Tool Card、推荐结果或实际使用结果的反馈。反馈是点评和评测输入，不直接改写 Tool Card。

```json
{
  "id": "feedback-rec-20260708-abc123",
  "schema_version": "feedback_record.v1",
  "target_type": "recommendation_result",
  "target_id": "rec-20260708-abc123",
  "tool_id": "mcp-github",
  "source": "web_ui",
  "signal": "down",
  "outcome": "failed",
  "reason_codes": ["permission_too_broad", "install_failed"],
  "notes": "Required broader GitHub token scopes than expected.",
  "created_at": "2026-07-08T00:00:00Z"
}
```

字段说明：

- `target_type`：`tool_card`、`recommendation_result`、`eval_case`。
- `source`：`web_ui`、`mcp_api`、`agent_runtime`、`maintainer`。
- `signal`：`up`、`down`、`correction`、`issue`。
- `outcome`：`worked`、`partial`、`failed`、`unsafe`、`not_tried`。
- `reason_codes`：结构化原因，例如 `wrong_tool`、`permission_too_broad`、`docs_outdated`、`install_failed`、`risk_missing`、`better_alternative`。

隐私要求：

- 不保存用户私有代码、邮件内容、token、secret、完整 prompt 或浏览器内容。
- `notes` 应限制为用户可公开分享的简短说明。
- 反馈可用于聚合统计和待审核任务，不能作为唯一证据提升工具信任等级。

## Feedback Summary

Feedback Summary 是按工具、推荐场景或数据版本聚合后的反馈结果。

```json
{
  "id": "feedback-summary:mcp-github:20260708",
  "schema_version": "feedback_summary.v1",
  "target_type": "tool_card",
  "target_id": "mcp-github",
  "window": {
    "from": "2026-07-01T00:00:00Z",
    "to": "2026-07-08T00:00:00Z"
  },
  "counts": {
    "up": 12,
    "down": 3,
    "worked": 8,
    "failed": 2,
    "unsafe": 1
  },
  "top_reason_codes": ["permission_too_broad", "docs_outdated"],
  "recommended_review_action": "needs_review",
  "generated_at": "2026-07-08T00:00:00Z"
}
```

要求：

- 小样本反馈只能作为弱信号。
- 负反馈或 `unsafe` 反馈可触发人工异常队列或新增 eval case。
- 反馈汇总进入 Review Summary、eval report 和发布审核材料。

## Schema 版本与迁移

### 版本规则

- 小字段新增：保持主版本，更新文档和 schema。
- 字段语义变化：提升主版本，例如 `tool_card.v2`。
- 字段删除：必须先弃用，再迁移。

### 迁移要求

每次 schema 迁移必须包含：

- 变更原因。
- 受影响字段。
- 自动迁移方式。
- 无法自动迁移的人工审核清单。
- 对采集、评分、推荐、评测的影响。

## 最小 MVP Schema

MVP 的 Tool Card 至少要求：

```yaml
id:
schema_version:
name:
type:
summary:
source_urls:
repo_url:
homepage_url:
docs_url:
license:
primary_purpose:
use_cases:
not_for:
tags:
supported_agents:
install_methods:
auth_required:
permissions:
maintenance:
security:
ai_decision_notes:
last_checked_at:
confidence:
created_at:
updated_at:
```

## 维护规则

- 修改字段语义必须同步更新采集、评分、推荐和评测文档。
- 删除字段前必须提供迁移策略。
- 新增字段必须说明生成方式、质量要求和 agent 决策用途。
- 任何包含权限、安全、安装或认证的信息都应能追溯来源。
