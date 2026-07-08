# 08 采集与入库

## 文档用途

本文件定义数据采集、解析、去重、标准化、校验和入库流程。它用于指导 crawler、parser、normalizer、deduper、validator 和发布流水线的实现。

采集与入库的目标是可回放、可解释、可审计，而不是最大化抓取量。

## 当前实现状态

截至当前分支，采集与入库模块已具备 v0.2 的最小草稿链路，但尚未接入可靠推荐发布数据。

当前发布流水线仍使用手工 seed 数据到发布 artifacts：

```text
src/data/seed-tool-cards.ts
  -> Rating Engine
  -> Search Index Builder
  -> Eval Runner
  -> public/data/*.json|jsonl
  -> public/data/d1_seed.sql
```

也就是说，`npm run pipeline` 当前读取的是人工维护的 `seedToolCards`，不会读取 Source Registry，也不会执行 normalizer、deduper 或把采集草稿发布为可靠 Tool Cards。

新增的本地草稿链路是：

```text
npm run ingest
  -> src/ingestion/source-registry.ts
  -> data/crawl_plan/source_crawl_plan.json
  -> crawl enabled source
  -> data/crawl_audit/crawl_audit.json
  -> data/raw/<source_id>/<YYYY-MM-DD>/<hash>.json
  -> parse Source Records
  -> data/source_records/<source_id>.jsonl
  -> data/discovery_candidates/tool_repositories.json
  -> data/tool_card_drafts/<source_id>.jsonl
  -> data/approvals/approval_records.json
  -> data/approval_requests/tool_card_drafts.json
  -> data/approval_requests/approval_record_templates.jsonl
  -> data/field_provenance/tool_card_fields.json
  -> data/dedup/tool_card_duplicates.json
  -> data/review_queue/tool_card_drafts.json
  -> data/release_admission/tool_card_drafts.json
  -> data/promotion_candidates/tool_cards.json
  -> data/promotion_candidates/seed_tool_card_candidates.ts
  -> data/promotion_candidates/promotion_plan.json
  -> data/promotion_candidates/promotion_check.json
```

当前 enabled source 包括 `manual-agent-radar-seed` 和受控的 `github-topic-mcp`。`manual-agent-radar-seed` 用于验证 Crawl Plan、Crawl Audit、Raw Snapshot、Source Record、Tool Card draft、dedup report、approval record、approval request、field value provenance、review queue、auto review、release admission、promotion candidates 和 promotion plan 契约。完整且无 parser warnings 的 manual Source Records 会经过 normalizer 生成待审核 Tool Card drafts。`github-topic-mcp` 使用 GitHub 公共 Search API 抓取 topic repository metadata，不发送 Authorization header、cookie 或私人 token；`github_topic_parser` 会把 API payload 解析为 repository Source Records，并记录 rate-limit response metadata。

repository Source Records 会进入 `tool_discovery_candidates.v1`，也会生成保守的 Tool Card drafts：这些 draft 只基于公开仓库 metadata 填充 repo、license、stars、last commit、topic、维护状态和中等风险安全说明，不把社区仓库自动升级为官方或高信任工具。review queue 会标注与已发布 Tool Cards 以及同批 incoming drafts 的重复信号和已记录的 approval decision。approval requests 会为尚未审核的 draft 输出 approval record 模板、decision options、重复信号和 validation 背景，并在 preview markdown 中区分 `published_duplicates` 和 `draft_duplicates`。

自动审核会输出 `tool_card_auto_review.v1`，为每个 draft 生成建议动作、证据 URL、主要风险、缺失字段、人工复核原因和发布准入评分卡。release admission 现在接受两类 gate：人工 `approved`，或自动审核建议 `promote` 且无高风险、重复、parser warning、缺字段等人工复核原因。promotion candidates 会把 eligible drafts 连同 `manual_approval` 或 `auto_review` evidence 复制到独立候选 artifact，并额外输出可人工合并到 `seedToolCards` 的 TypeScript snippet；promotion plan 会为这些候选输出目标文件、候选 artifact 路径、seed candidate artifact 路径、推荐人工动作和发布前检查项；promotion check 会 dry-run 校验候选是否与现有 seed 重复、是否仍通过 Tool Card validator。该步骤仍不会自动合并或发布，候选必须经过发布 gate 和后续人工 merge 才能进入可靠发布 artifacts。

`npm run ingest` 已支持最小 Override Record artifact：人工修正只作用于待审核 draft normalization，不覆盖 Raw Snapshot 或 Source Record，也不会自动发布到可靠 Tool Cards。Override Record 必须包含 `reason`、`created_by` 和至少一个 `evidence_urls`；被应用的 override id 会写入 draft `evidence_refs`，让后续 Tool Card validator 能审计 override record 上下文。

`npm run ingest` 也已支持最小 Approval Record artifact：人工审核决定会记录为 `approved`、`rejected` 或 `needs_changes`，并要求 `reviewer`、`reason`、`source_record_id` 和 `reviewed_at`。Approval Record 只作为审核证据和发布准入输入，不会自动把 draft 发布为可靠 Tool Card。

`npm run ingest` 会为缺少 approval 的 draft 输出 `tool_card_approval_requests.v1`，包含 `pending_approval`、`duplicate_review_required` 和 `blocked_validation` summary。每个 item 包含 approval record template、decision options、已发布 Tool Card duplicate ids、同批 draft duplicate ids、validation errors/warnings 和 Source Record id，帮助维护者生成真实 Approval Record；同时会输出 `data/approval_requests/approval_record_templates.jsonl`，把每个待处理模板和审核背景拆成一行，方便 reviewer 逐条填充真实 approval record。模板本身不是 approval，不会解除发布阻断。

`npm run ingest` 会输出 `tool_card_field_value_provenance.v1`，包含 `tool_cards` 和 `field_values` summary。每个 item 包含 Tool Card field、Source Record id、`source_field_path`、`source_value_preview`、`normalized_value_preview` 和 `provenance_type`。默认 `source_record` item 映射到 `raw_fields.<field>`；被应用的人工修正会额外输出 `override_record` item，并附带 `override_record_id` 与 `override_records.<id>.new_value` source path。该 artifact 用于审查字段和值来源，不替代发布前的人工 approval。

`npm run ingest` 的终端 JSON summary 会包含 snapshots、source records、source ids、discovery candidates、approval requests、field value provenance、auto review、release admission、promotion candidates 和 promotion plan 摘要，便于本地或 CI 快速判断采集审核状态。`npm run preview:build` 会把 discovery candidates 和 auto review summary 同步进 artifact manifest，并把 pending manual review 候选明细写入 preview review markdown。

`npm run ingest` 会为通过 release admission 的 promotion candidates 输出 `data/promotion_candidates/seed_tool_card_candidates.ts`，内容是 `promotionSeedToolCardCandidates: ToolCard[]`。该文件用于人工 review 和手动复制到 `src/data/seed-tool-cards.ts`，不会被 `npm run pipeline` 自动读取，也不会自动发布。

`npm run ingest` 也会输出 `data/promotion_candidates/promotion_check.json`，记录 promotion candidates 对现有 `seedToolCards` 的重复 id 检查和 Tool Card validator dry-run。`npm run promotion:check` 会读取该 artifact；如果存在 blocked candidate，会以非零退出码失败。该命令只检查，不修改任何发布数据。

发布流水线会输出 `data/source_registry.json`，包含 `source_registry.v1`、当前 Source Registry 内容和基础 validator 结果，供 preview/release 审核源配置；同时输出 `data/source_registry_diff.json`，记录来源配置 added、removed 和 changed 摘要。changed source 会附带字段级 `review_requirements`，标出启用状态、访问边界、parser、频率、可信度等变更为何需要维护者确认。发布流水线也会输出 `data/source_registry_review.json`，记录这些 requirements 的 pending、confirmed、rejected 和 needs_changes 状态；没有确认记录时保持 pending。`data/source_registry_review_requests.json` 会为 pending requirement 输出 confirmation record 模板、decision options 和 required fields，方便 reviewer 生成真实确认记录。上述 artifacts 不会自动启用来源或提升可信度。

发布流水线也会输出 `data/tool_card_validation.json` 和 `data/tool_card_field_provenance.json`，并在 Tool Card validation 失败时阻断 artifacts 生成，避免低置信、缺证据或风险未知的 Tool Card 进入可靠发布数据。字段 provenance artifact 会按 `permissions`、`security` 和 `maintenance` 统计字段级证据、人工审核覆盖和缺失项。

尚未实现的采集能力包括：

- 更完整的 Crawl Plan 生成；当前已输出 Source Registry sources 的最小 crawl plan artifact，并标注 ready、disabled 或 blocked。
- 通用外部 HTTP/API crawler 的限流和重试；当前已输出最小 crawl audit log，并对显式 GitHub topic API 抓取记录 rate-limit metadata。
- 更多来源专属 parser；当前已有 `manual_seed_parser` 和基础 `github_topic_parser`，GitHub topic source 已启用为受控公共 metadata 来源。
- 完整跨来源 deduper、跨来源 normalizer 和人工 override 审核 UI；当前只实现 draft id、canonical URL 对已发布 Tool Cards 和同批 incoming drafts 的最小重复信号与发布阻断。
- 更完整的 Source Registry validator；当前已检查 enabled source 的 parser 覆盖、owner、`last_reviewed_at` 和 robots/terms 审核记录，并输出带字段级 review requirements、确认状态 summary 和 pending confirmation 模板的来源变更审核 artifacts。
- 完整的人工审核 UI，以及 promotion candidates 到可靠发布 artifacts 的人工提升流程；当前 preview review markdown 已展示 discovery candidates、approval request、auto review summary、release admission blocked reasons、promotion candidate 明细、seed candidate snippet 路径、promotion plan 人工合并提示和 promotion check dry-run 结果。
- 更完整的 Tool Card validator 字段 provenance；当前已输出 schema 级 `tool_card_field_provenance.json` 和 ingest-time `tool_card_field_value_provenance.v1`，支持 source record 与已应用 override record 的字段值 provenance，也支持 override evidence ref 对应 Override Record 的审计检查，要求 `docs_url`、`repo_url`、`homepage_url`、`package_urls` 和 `install_methods.docs_url` 被 `source_urls` 覆盖，并对非人工审核来源缺少 `permissions`、`security`、`maintenance` 字段级 evidence refs 的 Tool Card 输出 warning。可通过 `AGENT_RADAR_CHECK_URLS=true` 运行 URL 可达性检查。

因此，下面的流程描述是目标实现契约，不代表当前代码已经具备完整采集能力。

## 目标审核闭环

当前 `draft -> approval -> promotion candidates` 链路提供了可审计的发布护栏，但如果每张 Tool Card 都依赖维护者手动填写 JSON、判断字段、再复制到 seed 数据，会限制覆盖规模。因此后续审核流程应从“人工逐条批准”调整为“自动证据审核 + 用户反馈闭环 + 人工异常处理”。

目标流程：

```text
Source Records
  -> 自动证据汇总
  -> 规则审核和 LLM 审核摘要
  -> Tool Card drafts
  -> 用户反馈与推荐反馈汇总
  -> 发布准入评分卡
  -> promotion candidates
  -> 人工只处理高风险、争议或低置信候选
```

### 自动证据审核

系统应尽量用代码和 LLM 先完成初评，人工只复核结论和异常。

自动证据包括：

- 官方文档、README、registry entry、package metadata 和 release 信息。
- GitHub stars、recent commits、release frequency、issue activity、license、topics。
- 包管理源下载量、版本更新时间、维护信号。
- 社区评价和引用，例如 issue、discussion、论坛或文章；这些只能作为弱信号，不能单独提升信任等级。
- 已知风险信号，例如需要 token、文件写入、shell、邮箱、数据库、支付、云账号或生产环境权限。

自动审核输出应生成 `review_summary`，至少包含：

- 建议动作：`promote`、`keep_draft`、`needs_review`、`reject`、`retire`。
- 主要证据和来源 URL。
- 主要风险和缺失字段。
- 重复项、parser warnings、validator warnings。
- 置信度和需要人工处理的原因。

LLM 审核只能基于已采集 Source Records、Tool Card draft、评分结果和反馈摘要生成判断，不得把未引用的外部知识写成事实。LLM 结论不得直接解除高风险发布阻断。

### 用户反馈闭环

推荐质量应从使用端持续回流，而不是只靠维护者一次性审核。Web UI 和 MCP/API 后续应支持反馈入口：

- 对推荐结果点赞、点踩或标记“不适合”。
- 对单个 Tool Card 反馈字段错误、安装失败、文档过期、权限超出预期。
- 对实际使用结果标记 `worked`、`failed`、`partial`、`unsafe`。
- 让 agent 在使用推荐后提交结构化 outcome，例如推荐是否有用、风险提示是否准确、实际遇到的权限或安装问题。

反馈数据默认不直接修改 Tool Card、评分或推荐规则。它应先进入点评材料和 eval/report，用于发现误判、生成待审核任务、调整字段或新增 golden query。

### 发布准入评分卡

promotion candidates 不应只依赖人工 approval。后续应为每个候选生成发布准入评分卡，综合：

- 证据质量和字段完整率。
- 维护健康度和新鲜度。
- 安全风险和权限明确度。
- 用户反馈有用率、失败率、投诉原因。
- 推荐命中/误判记录。
- 重复项和来源冲突。

建议动作：

| 动作 | 含义 | 是否可自动进入可靠发布 |
| --- | --- | --- |
| `promote` | 证据充分、风险可解释、反馈健康 | 低/中风险可进入候选，但仍走发布 gate |
| `keep_draft` | 信息基本可用但证据不足 | 否 |
| `needs_review` | 风险、重复、反馈或来源存在争议 | 否，进入人工异常队列 |
| `reject` | 不符合范围或风险不可接受 | 否 |
| `retire` | 已发布工具失效或长期负反馈 | 否，需人工确认下线 |

人工审核重点应改为：

- 高风险权限或风险等级降低。
- 来源 trust level 提升。
- 负反馈明显上升。
- LLM 审核和规则审核结论冲突。
- 社区信号与官方来源冲突。
- 大规模自动 promotion 或 retire。

## 流程总览

```text
Source Registry
  -> Crawl Plan
  -> Crawler
  -> Raw Snapshot Store
  -> Parser
  -> Source Record Store
  -> Deduper
  -> Normalizer
  -> Tool Card Validator
  -> Rating Engine
  -> Search Index
  -> Eval Runner
  -> Publish
```

## 运行模式

### 每日增量

用途：

- 检查高优先级官方来源。
- 更新已知工具的 release、维护状态和失效链接。

MVP 状态：不启用。MVP 只使用手动触发更新。

范围：

- 官方 registry。
- 已收录工具的 repo 和 package metadata。
- 最近失败后需要重试的来源。

### 每周全量

用途：

- 扫描官方来源、人工确认来源和已启用包管理源；GitHub topics 与社区目录留到 v0.2 后评估。
- 发现新增工具。
- 重新构建索引和评分。

MVP 状态：不启用自动定时。需要时由维护者手动触发。

### 每月审核

用途：

- 抽样人工审核。
- 清理过期来源。
- 生成数据质量报告。

### 手动运行

用途：

- 新增来源。
- 修复 parser。
- 处理推荐误判。
- 发布前验证。

MVP 默认更新方式：所有采集、导入、评分、索引和发布流程均手动触发。

## Crawl Plan

Crawl Plan 是每次运行的采集计划。

字段：

```yaml
id:
run_type: daily_incremental | weekly_full | monthly_review | manual
source_ids:
started_at:
rules:
  respect_rate_limits: true
  max_failures_per_source:
  retry_policy:
```

要求：

- 每次运行记录数据版本。
- 可以只跑部分来源。
- 计划中不得包含禁用来源。

## Crawler

职责：从公开来源抓取原始内容并保存 Raw Snapshot。

要求：

- 遵守 Source Registry 中的频率和限制。
- 不携带用户 secret、cookie 或私人 token。
- 失败也要记录错误快照。
- 不在 crawler 阶段做字段推断。

失败处理：

| 错误 | 处理 |
| --- | --- |
| 网络超时 | 指数退避重试 |
| 429 限流 | 停止该来源本轮采集，记录 rate_limited |
| 404 | 标记来源或工具可能失效 |
| 5xx | 重试后保留旧数据 |
| 内容类型变化 | 保存快照，交给 parser 报错 |

## Raw Snapshot 保存

要求：

- 原始内容不可变。
- 文件名包含 source_id、日期和 hash。
- 内容 hash 写入 metadata。
- 请求 metadata 不包含敏感信息。

建议路径：

```text
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.json
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.html
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.meta.json
```

## Parser

职责：将 Raw Snapshot 转换为 Source Record。

原则：

- parser 是来源专属的。
- 尽量保留原始字段。
- 不做跨来源合并。
- 不做评分。
- 不把 parser 猜测当作事实。

Parser 输出：

- Source Record。
- parse warnings。
- parse errors。

质量要求：

- 每个 parser 有 fixture 测试。
- 结构变化应导致清晰错误，而不是生成错误字段。
- parser 版本写入 Source Record。

## Deduper

职责：识别来自不同来源的同一工具。

匹配信号优先级：

1. 相同 canonical repo URL。
2. 相同 package name + registry。
3. 相同 homepage URL。
4. 官方文档互相链接。
5. 名称相似 + 维护者相同。
6. 名称相似 + 描述相似。

去重规则：

- 强匹配可自动合并。
- 弱匹配生成 `possible_duplicates`，需要人工审核。
- 不确定时保留独立 Tool Card 草案，避免误合并。

Canonical URL 规则：

- 去掉 trailing slash。
- 统一 GitHub URL 大小写和 `.git` 后缀。
- 解析 redirect 后保留 canonical。

## Normalizer

职责：将一个或多个 Source Record 合并为 Tool Card。

字段合成规则：

| 字段 | 合成方式 |
| --- | --- |
| `name` | 优先官方名称，保留 aliases |
| `summary` | 优先官方文档，必要时人工改写并留证据 |
| `type` | 按分类体系判断 |
| `source_urls` | 合并所有支撑来源 |
| `license` | 优先官方仓库 LICENSE |
| `install_methods` | 优先官方文档和包管理源 |
| `permissions` | 采用保守合并，未知不降风险 |
| `maintenance` | 来自 repo、release、package metadata |
| `security` | 来自权限、来源可信度和安全规则 |
| `confidence` | 综合字段完整性和来源质量 |

冲突处理：

- 事实字段冲突：记录所有来源，选择最高优先级并写 warnings。
- 风险字段冲突：采用更保守结论。
- 分类冲突：标记 `needs_review`。

## Tool Card Validator

校验类型：

### Schema 校验

- 必填字段存在。
- 枚举值合法。
- URL 格式合法。
- 时间戳合法。

### 质量校验

- `source_urls` 非空。
- `use_cases` 和 `not_for` 非空。
- `install_methods` 至少有一种，或明确 `unknown`。
- `permissions` 不为空；无权限也要写空数组并说明。
- `last_checked_at` 不超过新鲜度阈值。

### 推荐资格校验

进入可靠推荐前必须满足：

- 整体置信度至少 `medium`。
- 关键字段齐全。
- 风险等级不是 `unknown`。
- 至少一个可信来源。
- 未标记 `deprecated` 或 `needs_review`，除非查询明确要求。

## 入库策略

MVP 使用 JSON 文件和 Cloudflare D1 SQLite：

```text
data/source_records/*.jsonl
data/tool_cards/*.jsonl
data/ratings/*.jsonl
data/index/*.json
data/evals/*.json
migrations/*.sql
```

入库要求：

- JSON/JSONL 作为源数据和发布 artifacts。
- Cloudflare D1 SQLite 作为公开站点和 Workers MCP API 的查询存储。
- 每次运行生成新版本，不直接覆盖已发布版本。
- 发布指针指向当前稳定版本。
- 支持回滚到上一版本。

## 增量更新

增量更新触发：

- 来源内容 hash 变化。
- repo release 或 commit 更新。
- package version 更新。
- 人工 override 新增。
- parser 或 normalizer 版本变化。

增量策略：

- 未变化快照不重复解析。
- parser 版本变化可触发回放。
- rating rules 变化只需重跑评分和索引。
- recommendation rules 变化只需重跑推荐评测。

## 数据质量检查

核心指标：

| 指标 | 说明 | MVP 阈值 |
| --- | --- | --- |
| 字段完整率 | 必填字段完整的 Tool Card 占比 | >= 90% |
| 来源覆盖率 | 至少两个来源或官方来源占比 | 持续跟踪 |
| 重复率 | possible duplicate 占比 | 持续下降 |
| 过期率 | 超过新鲜度阈值记录占比 | <= 20% |
| 解析失败率 | parser failed snapshots 占比 | <= 10% |
| 低置信占比 | confidence low/unknown 占比 | 持续跟踪 |

失败处理：

- 关键字段完整率低于阈值：阻止发布可靠推荐索引。
- 解析失败率升高：保留旧索引并生成告警。
- 高风险字段缺失：相关工具不进入推荐。

## 日志要求

每次 pipeline 运行记录：

- run id。
- 数据版本。
- 来源列表。
- 成功/失败数量。
- 新增、更新、删除候选数量。
- parser warnings。
- validator failures。
- eval summary。

日志不能包含：

- token。
- cookie。
- 私有 URL。
- 用户私密数据。

## 手动触发 MVP 流程

### 工作流

```text
steps:
  - checkout
  - install dependencies
  - validate source registry
  - crawl enabled sources
  - parse snapshots
  - normalize tool cards
  - validate data
  - run ratings
  - build index
  - run eval
  - upload artifacts
  - publish if main branch and eval passes
```

要求：

- MVP 不配置自动 schedule。
- 维护者通过手动命令或 `workflow_dispatch` 触发。
- 不引入付费 runner、付费数据库或闭源数据源。

### 成本控制

- 限制每次运行来源数量。
- 使用 ETag 或 content hash。
- 对低优先级来源降频。
- 优先重新解析已有快照，而不是重复抓取。

## 失败不应阻断全部 pipeline 的情况

- 单个非 MVP 候选来源解析失败。
- 单个工具页面 404。
- 低优先级来源限流。
- 个别 Tool Card 缺少非关键字段。

## 必须阻断发布的情况

- schema 校验器失败。
- 大量 Tool Card ID 变化。
- 核心官方来源全部不可用且无旧版本。
- 安全风险字段批量缺失。
- golden queries 出现严重回归。
- 索引版本和数据版本不一致。

## 人工审核队列

以下记录进入审核队列：

- possible duplicate。
- 分类冲突。
- 权限未知但工具能力强。
- 评分变化超过阈值。
- 推荐等级从 avoid/consider 升为 recommended。
- 工具被标记为 deprecated。

## 与其他文档的关系

- SourceDefinition 来自 `docs/07-source-registry.md`。
- 数据结构来自 `docs/04-data-model.md`。
- 分类规则来自 `docs/05-taxonomy.md`。
- 评分规则来自 `docs/06-rating-rules.md`。
- 安全风险来自 `docs/11-security-and-trust.md`。
- 评测阈值来自 `docs/10-evaluation-plan.md`。

## 维护规则

- 所有 parser 应尽量保留原始字段，避免不可逆丢失。
- 采集失败不应阻断全部 pipeline，除非核心来源全部不可用。
- 修改入库规则必须说明对已有 Tool Card、评分和索引的影响。
- 涉及来源合法性或高风险权限的数据必须保守处理。
