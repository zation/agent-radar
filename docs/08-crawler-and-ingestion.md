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
  -> crawl enabled source
  -> data/raw/<source_id>/<YYYY-MM-DD>/<hash>.json
  -> parse Source Records
  -> data/source_records/<source_id>.jsonl
  -> data/tool_card_drafts/<source_id>.jsonl
  -> data/approvals/approval_records.json
  -> data/dedup/tool_card_duplicates.json
  -> data/review_queue/tool_card_drafts.json
```

当前 enabled source 只有 `manual-agent-radar-seed`，用于验证 Raw Snapshot、Source Record、Tool Card draft、dedup report 和 review queue 契约。完整且无 parser warnings 的 manual Source Records 会经过最小 normalizer 生成待审核 Tool Card drafts，并输出最小 duplicate report；review queue 也会标注与已发布 Tool Cards 的最小重复信号，但不会自动合并。这些草稿仍不进入可靠发布 artifacts。`github-topic-mcp` 已登记但保持 disabled，避免 MVP 后立即引入社区来源噪声。

`npm run ingest` 已支持最小 Override Record artifact：人工修正只作用于待审核 draft normalization，不覆盖 Raw Snapshot 或 Source Record，也不会自动发布到可靠 Tool Cards。Override Record 必须包含 `reason`、`created_by` 和至少一个 `evidence_urls`。

`npm run ingest` 也已支持最小 Approval Record artifact：人工审核决定会记录为 `approved`、`rejected` 或 `needs_changes`，并要求 `reviewer`、`reason`、`source_record_id` 和 `reviewed_at`。Approval Record 只作为审核证据和发布准入输入，不会自动把 draft 发布为可靠 Tool Card。

发布流水线会输出 `data/source_registry.json`，包含 `source_registry.v1`、当前 Source Registry 内容和基础 validator 结果，供 preview/release 审核源配置。

发布流水线也会输出 `data/tool_card_validation.json`，并在 Tool Card validation 失败时阻断 artifacts 生成，避免低置信、缺证据或风险未知的 Tool Card 进入可靠发布数据。

尚未实现的采集能力包括：

- Crawl Plan 生成。
- 通用外部 HTTP/API crawler 的限流、重试和审计日志。
- 更多来源专属 parser。
- 完整跨来源 deduper、跨来源 normalizer 和人工 override 审核 UI。
- 完整 Source Registry validator，包括来源变更 diff、robots/terms 审核记录和 parser 覆盖检查。
- 完整的人工审核 UI 和 Tool Card drafts 发布准入流程。
- 更完整的 Tool Card validator，包括 URL 可达性、字段级 evidence coverage 和 override 审计。

因此，下面的流程描述是目标实现契约，不代表当前代码已经具备完整采集能力。

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
