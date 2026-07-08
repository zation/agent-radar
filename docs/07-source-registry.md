# 07 采集源注册表

## 文档用途

本文件记录 Agent Radar 的数据来源、采集方式、可信度、频率和限制。它用于管理来源扩展、采集优先级和数据质量。

来源注册表的目标不是“能抓就抓”，而是用合法、低成本、可解释的方式发现和验证 AI 工具。

## 来源原则

- 优先官方来源和可验证公开来源。
- MVP 只启用官方来源和人工审核来源。
- 不采集需要绕过登录、验证码、付费墙或服务条款的数据。
- 来源可信度影响字段置信度和评分，不等于工具质量。
- 社区列表、awesome list、新闻、博客和发布帖不进入 MVP 自动采集范围，可作为 v0.2 之后的候选方向。
- 所有来源都必须记录频率、限制和失败处理。

## SourceDefinition Schema

```yaml
id:
name:
url:
source_type:
covered_tool_types:
collection_method:
recommended_frequency:
trust_level:
field_coverage:
rate_limits:
terms_notes:
access_review:
  robots_txt:
  terms:
  reviewed_by:
  reviewed_at:
  notes:
parser:
failure_policy:
enabled:
owner:
last_reviewed_at:
```

字段说明：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | string | 是 | 来源稳定 ID |
| `name` | string | 是 | 来源名称 |
| `url` | string | 是 | 来源入口 |
| `source_type` | enum | 是 | `official_registry`、`official_docs`、`github`、`package_registry`、`community_list`、`news`、`manual` |
| `covered_tool_types` | array | 是 | 覆盖的工具类型 |
| `collection_method` | enum | 是 | `api`、`http`、`git_clone`、`manual`、`rss` |
| `recommended_frequency` | enum | 是 | `daily`、`weekly`、`monthly`、`manual` |
| `trust_level` | enum | 是 | 与安全文档一致 |
| `field_coverage` | array | 是 | 可获得字段 |
| `rate_limits` | string | 否 | 速率限制说明 |
| `terms_notes` | string | 是 | 使用条款和限制 |
| `access_review` | object | enabled source 必填 | robots/terms 审核记录 |
| `parser` | string | 否 | parser 名称 |
| `failure_policy` | string | 是 | 失败处理 |
| `enabled` | boolean | 是 | 是否启用自动采集 |
| `owner` | string | 否 | 维护人或模块 |
| `last_reviewed_at` | datetime | 是 | 来源审核时间 |

## Source Registry Diff

`source_registry_diff.json` 用于 preview/release 审核来源配置变更。每个 changed source 必须列出 `changed_fields`；对会影响采集范围、访问边界、parser 行为或下游可信度的字段，还会输出 `review_requirements`：

```yaml
changed:
  - id:
    changed_fields:
    review_requirements:
      - field:
        reason:
        confirmation_required: true
```

当前会生成 review requirement 的字段包括：`enabled`、`url`、`source_type`、`collection_method`、`recommended_frequency`、`trust_level`、`field_coverage`、`rate_limits`、`terms_notes`、`access_review` 和 `parser`。Cloudflare Pages preview 的 ingestion review markdown 会展示这些字段级审核提示，便于 reviewer 在 Actions Summary 中确认高影响来源变更。该 artifact 只提供审核提示，不自动信任新来源，也不替代人工确认。

`source_registry_review.json` 记录这些 requirements 的人工确认状态：

```yaml
schema_version: source_registry_review.v1
summary:
  total_requirements:
  confirmed:
  rejected:
  needs_changes:
  pending:
items:
  - source_id:
    field:
    reason:
    status: pending | confirmed | rejected | needs_changes
    confirmation:
      record_id:
      reviewer:
      reviewed_at:
      reason:
```

没有匹配 confirmation record 的 requirement 默认为 `pending`。该 artifact 只表达审核状态，不会自动启用来源或提升来源可信度。

`source_registry_review_requests.json` 会为仍处于 `pending` 的 requirement 输出可操作确认模板：

```yaml
schema_version: source_registry_review_requests.v1
summary:
  pending_review:
  confirmation_required:
items:
  - source_id:
    field:
    reason:
    confirmation_required:
    decision_options: [confirmed, rejected, needs_changes]
    review_record_template:
      id:
      schema_version: source_registry_review_record.v1
      source_id:
      field:
      required_fields: [decision, reason, reviewer, reviewed_at]
```

该 artifact 用于让 reviewer 在 preview summary 中看到可填写的 confirmation record 模板；模板本身不是确认记录，不会自动启用来源或改变来源可信度。

## 来源类型

### 官方 Registry

定义：由协议、平台或工具生态官方维护的 registry、目录或 marketplace。

用途：

- 获取高可信工具列表。
- 验证工具名称、文档、安装方式和维护者。

可信度：通常为 `official`。

限制：

- 覆盖范围可能只限单一生态。
- 官方收录不代表安全审计通过。

### 官方文档和仓库

定义：工具作者或维护组织发布的文档站、README、release 和 repo metadata。

用途：

- 验证安装方式、权限、适用场景、许可证和维护状态。

可信度：`official` 或 `well_known_org`。

限制：

- 作者描述可能偏营销，需要结合实际字段判断。

### GitHub

定义：GitHub repositories、organizations、releases 和 README。MVP 只采集官方仓库或人工确认的仓库，不扫描 GitHub topics。

用途：

- 发现开源工具。
- 获取维护、社区和 license 信号。

可信度：取决于组织、项目活跃度和证据完整性。

限制：

- star 不等于质量。
- topic 噪声大，需要去重和分类。

### 包管理源

定义：npm、PyPI、Docker Hub、Homebrew 等。

用途：

- 验证安装方式、版本、发布时间和包名。

可信度：`active_open_source`、`commercial` 或 `unknown`。

限制：

- 包存在不代表项目可信。
- 供应链风险需要单独建模。

### 社区目录和 Awesome List

定义：社区维护的工具列表、awesome repositories、curated lists。

MVP 状态：不启用。

用途：

- 发现新工具。
- 建立同类候选集合。

可信度：通常为 `active_open_source`、`individual` 或 `unknown`。

限制：

- 字段不完整。
- 更新频率不稳定。
- 不能单独作为高置信推荐证据。

### 新闻、博客和发布帖

定义：Hacker News、Product Hunt、博客、发布公告等。

MVP 状态：不启用。

用途：

- 发现新工具和生态变化。

可信度：低到中。

限制：

- 新闻性强，长期可用性弱。
- 仅作为发现信号，不直接支撑评分。

### 人工来源

定义：维护者手动添加的工具、字段修正或审核结果。

用途：

- 补齐关键字段。
- 修正 parser 无法可靠判断的信息。

可信度：取决于证据 URL 和审核记录。

限制：

- 必须保留来源和修改原因。

## 初始来源清单

### Model Context Protocol 官方资源

```yaml
id: mcp-official-resources
name: Model Context Protocol official resources
url: https://modelcontextprotocol.io/
source_type: official_docs
covered_tool_types: [mcp]
collection_method: http
recommended_frequency: weekly
trust_level: official
field_coverage: [name, docs_url, usage, protocol_context]
rate_limits: "遵守站点 robots 和合理请求频率"
terms_notes: "只采集公开文档和链接"
access_review:
  robots_txt: reviewed
  terms: reviewed
  reviewed_by: agent-radar
  reviewed_at: 2026-07-06T00:00:00Z
  notes: "只采集公开文档和链接"
parser: mcp_docs_parser
failure_policy: "失败时保留上一版本并标记 stale"
enabled: true
last_reviewed_at: 2026-07-06T00:00:00Z
```

用途：验证 MCP 概念、官方 server 和协议相关字段。

### GitHub Topics: MCP

```yaml
id: github-topic-mcp
name: GitHub topic mcp
url: https://github.com/topics/mcp
source_type: github
covered_tool_types: [mcp, cli, framework]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [name, description, repo_url, stars, license, last_commit_at]
rate_limits: "GitHub API rate limits"
terms_notes: "使用公开 API，不采集私有仓库；结果进入自动审核和发布 gate"
access_review:
  robots_txt: reviewed
  terms: reviewed
  reviewed_by: agent-radar
  reviewed_at: 2026-07-08T00:00:00Z
  notes: "仅使用公开 topic/API surfaces；不发送 Authorization header、cookie 或私人 token"
parser: github_topic_parser
failure_policy: "限流时跳过本次并保留上次结果"
enabled: true
last_reviewed_at: 2026-07-08T00:00:00Z
```

用途：用于发现开源 MCP 工具。crawler 会把 `https://github.com/topics/<topic>` 映射到 GitHub Search API，并保留 rate-limit response metadata 供审核。该来源生成的 repository drafts 只能进入自动审核和 promotion candidate，不会直接进入可靠发布数据。

### GitHub Topics: AI Agent

```yaml
id: github-topic-ai-agent
name: GitHub topic ai-agent
url: https://github.com/topics/ai-agent
source_type: github
covered_tool_types: [agent, framework, cli]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [name, description, repo_url, stars, license, last_commit_at]
rate_limits: "GitHub API rate limits"
terms_notes: "topic 噪声较大，只作为发现来源"
parser: github_topic_parser
failure_policy: "解析失败不阻断其他来源"
enabled: false
last_reviewed_at: 2026-07-06T00:00:00Z
```

### npm Registry

```yaml
id: npm-ai-tools
name: npm packages for AI tools
url: https://registry.npmjs.org/
source_type: package_registry
covered_tool_types: [cli, framework, mcp]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [package_name, version, release_time, install_method, repo_url, license]
rate_limits: "遵守 npm registry 公共 API 限制"
terms_notes: "只查询已发现包名，不做高频全量扫描"
parser: npm_package_parser
failure_policy: "包查询失败时保留旧版本并标记 stale"
enabled: false
last_reviewed_at: 2026-07-06T00:00:00Z
```

### PyPI

```yaml
id: pypi-ai-tools
name: PyPI packages for AI tools
url: https://pypi.org/
source_type: package_registry
covered_tool_types: [cli, framework, agent]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [package_name, version, release_time, install_method, repo_url, license]
rate_limits: "遵守 PyPI API 使用限制"
terms_notes: "只查询已发现包名"
parser: pypi_package_parser
failure_policy: "包查询失败时保留旧版本并标记 stale"
enabled: false
last_reviewed_at: 2026-07-06T00:00:00Z
```

### Awesome Lists

```yaml
id: awesome-ai-agents
name: Curated awesome AI agent lists
url: https://github.com/topics/awesome-ai-agents
source_type: community_list
covered_tool_types: [agent, framework, mcp, cli, prompt, rules]
collection_method: api
recommended_frequency: monthly
trust_level: unknown
field_coverage: [name, repo_url, description]
rate_limits: "GitHub API rate limits"
terms_notes: "只作为发现信号，不直接支撑高置信评分"
parser: awesome_list_parser
failure_policy: "解析失败时跳过该列表"
enabled: false
last_reviewed_at: 2026-07-06T00:00:00Z
```

### 手动审核来源

```yaml
id: manual-review
name: Manual review records
url: internal://manual-review
source_type: manual
covered_tool_types: [mcp, skill, agent, framework, cli, prompt, rules, service]
collection_method: manual
recommended_frequency: manual
trust_level: well_known_org
field_coverage: [all_reviewed_fields]
rate_limits: "不适用"
terms_notes: "必须附公开证据 URL"
parser: manual_record_parser
failure_policy: "缺证据时拒绝入库"
enabled: true
last_reviewed_at: 2026-07-06T00:00:00Z
```

## 来源优先级

字段冲突时按以下优先级处理：

1. 官方文档或官方仓库。
2. 包管理源的版本和安装信息。
3. 可信组织文档。
4. 活跃开源仓库元数据。
5. 人工审核记录。
6. 社区目录。
7. 新闻、博客和发布帖。

说明：

- 人工审核记录不是无条件最高优先级，必须引用公开证据。
- 对版本、安装命令等事实字段，包管理源可能比 README 更及时。
- 对“适用场景”等解释字段，应结合文档和实际示例。

## 冲突解决规则

| 冲突类型 | 处理 |
| --- | --- |
| 名称不同 | 保留 canonical name 和 aliases |
| license 冲突 | 优先官方仓库 LICENSE，其次包管理元数据 |
| 安装命令冲突 | 优先最新官方文档和包管理源 |
| 维护状态冲突 | 用最近 release、commit、issue 活动综合判断 |
| 工具类型冲突 | 按分类文档主入口规则判断 |
| 权限描述冲突 | 采用更保守风险解释，并标记需要审核 |

## 采集频率

| 来源类型 | 建议频率 |
| --- | --- |
| 官方 registry | weekly |
| 官方文档 | weekly 或 monthly |
| GitHub topics | MVP 不启用，v0.2 后评估 |
| 包管理源 | weekly |
| 社区目录 | MVP 不启用 |
| 新闻和发布帖 | MVP 不启用 |
| 手动审核 | manual |

高频采集只有在来源稳定、合法且成本低时才启用。

## 来源准入检查

新增来源前必须回答：

- 这个来源服务哪个工具类型或字段。
- 是否公开可访问。
- 是否允许自动采集。
- 是否需要登录、cookie、token 或付费。
- 字段质量如何。
- 噪声和重复率预期如何。
- 失败时是否影响主 pipeline。
- 是否有 parser 维护成本。

## 禁止来源

- 需要绕过登录、验证码或访问控制的页面。
- 明确禁止自动抓取的来源。
- 泄露 token、私钥、内部文档或用户数据的来源。
- 需要付费授权但项目未确认的来源。
- 无法保存来源证据的口头信息。

## 与后续流程的关系

- Source Registry 决定 crawler 输入。
- SourceDefinition 的 `trust_level` 进入 Tool Card 和评分。
- `field_coverage` 决定 parser 和 normalizer 的字段期待。
- 来源失败策略影响采集与入库文档。
- 来源质量影响评测中的数据覆盖和新鲜度指标。

## 维护规则

- 新增来源必须说明用途、可信度和速率限制。
- 不采集需要绕过登录、付费墙或违反服务条款的数据。
- 来源变更必须记录审核日期。
- 删除来源前应评估受影响 Tool Card 和字段。
