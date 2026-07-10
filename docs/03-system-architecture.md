# 03 系统架构

## 文档用途

本文件描述 Agent Radar 的系统模块、数据流、接口边界和部署形态。它用于指导代码结构、技术选型和模块演进。

架构目标不是搭建复杂平台，而是用低成本、可回放、可评测的方式维护一个 AI 工具评级与推荐知识库。

## 架构原则

- 数据优先：先保证 Raw Snapshot、Source Record、Tool Card、Rating Result、Recommendation Result 可追溯。
- 模块可替换：采集、解析、评分、推荐和展示应通过文件或清晰接口连接。
- Cloudflare 免费栈优先：MVP 使用 TypeScript、JSON、Cloudflare D1 SQLite，以及启用 Static Assets 的单个 Cloudflare Worker。
- 可回放：任何评分或推荐结果都应能用相同数据版本和规则版本复现。
- 安全默认保守：系统只推荐和解释，不自动安装、执行或授权第三方工具。

## 逻辑架构

```text
Source Registry
  -> Crawler
  -> Raw Snapshot Store
  -> Parser
  -> Source Record Store
  -> Normalizer
  -> Tool Card Store
  -> Taxonomy Classifier
  -> Rating Engine
  -> Search Index Builder
  -> Recommendation Engine
  -> Cloudflare Worker Static Assets + HTTP API + MCP JSON-RPC + Reports
  -> Eval Runner
  -> Feedback / Override Records
```

## 核心模块

### Source Registry

职责：记录可采集来源及其可信度、采集策略和限制。MVP/v0.2 启用官方来源和经过访问边界审核的公开 metadata sources；受控 GitHub topic 与 npm package metadata 仍须通过 validation、auto review 和 promotion gates，社区目录和新闻来源保持禁用。

输入：

- 来源 URL。
- 来源类型。
- 采集频率。
- 使用限制。
- 可信度判断。

输出：

- `SourceDefinition` 配置。

依赖：

- `docs/07-source-registry.md`。
- 安全文档中的来源信任等级。

错误处理：

- 来源缺少合法性说明时拒绝进入自动采集。
- 来源频繁失败时降级为人工检查。

测试方式：

- schema 校验。
- 来源 URL 格式检查。
- 采集频率和可信度枚举检查。

### Crawler

职责：按来源配置抓取公开数据并保存原始快照。

输入：

- `SourceDefinition`。
- 上次抓取状态。

输出：

- `Raw Source Snapshot`。
- 抓取日志。

依赖：

- 网络访问。
- 速率限制配置。
- 快照存储。

错误处理：

- 网络错误重试。
- 限流时退避。
- 结构变化不在 crawler 中修复，交给 parser 处理。

测试方式：

- 使用 fixture 模拟 HTTP 响应。
- 验证失败时仍记录错误快照。

### Raw Snapshot Store

职责：保存不可变原始数据，支持回放解析。

输入：

- crawler 返回的原始内容。
- 请求元数据。

输出：

- 快照文件路径或对象引用。
- 内容哈希。

存储建议：

- MVP：`data/raw/<source_id>/<date>/<hash>.json` 或 `.html`。
- 生产：对象存储或 R2。

错误处理：

- 哈希冲突时拒绝覆盖。
- 写入失败时停止当前来源入库。

测试方式：

- 快照不可变测试。
- hash 与内容一致性测试。

### Parser

职责：把来源特定格式解析为 Source Record。

输入：

- Raw Snapshot。
- parser 版本。

输出：

- `Source Record`。
- parse errors。

依赖：

- 来源专属解析逻辑。
- 数据模型文档。

错误处理：

- 单条解析失败不阻断整个来源。
- 保留无法解析字段到 `raw_fields`。
- 结构变化触发 parser failure 记录。

测试方式：

- fixture 单元测试。
- 来源结构变化回归测试。

### Normalizer

职责：把 Source Record 合并、去重并标准化为 Tool Card。

输入：

- Source Records。
- 人工 override records。
- 去重规则。

输出：

- Tool Card。
- 字段级 provenance。

依赖：

- `docs/04-data-model.md`。
- `docs/05-taxonomy.md`。

错误处理：

- 关键字段冲突时保留多个来源并降低置信度。
- 缺少必填字段时生成草案但不进入可靠推荐。

测试方式：

- 字段映射测试。
- 冲突合并测试。
- 去重测试。

### Taxonomy Classifier

职责：为 Tool Card 添加主类型和多维标签。

输入：

- Tool Card 草案。
- 分类规则。

输出：

- 分类后的 Tool Card。
- 分类置信度和解释。

错误处理：

- 分类冲突时标记 `needs_review`。
- 不能确定主类型时不进入首选推荐。

测试方式：

- 分类 fixture。
- 边界案例测试，例如 CLI + framework 混合工具。

### Rating Engine

职责：根据通用和类型专属规则生成评分与解释。

输入：

- Tool Card。
- 评分规则版本。
- 安全风险规则。

输出：

- `Rating Result`。

依赖：

- `docs/06-rating-rules.md`。
- `docs/11-security-and-trust.md`。

错误处理：

- 缺少评分证据时降低证据质量分。
- 高风险字段缺失时采取保守风险等级。

测试方式：

- 单项评分单元测试。
- 示例工具评分 snapshot。
- 评分回归 eval。

### Search Index Builder

职责：构建支持搜索、过滤和推荐召回的索引。

输入：

- Tool Cards。
- Rating Results。

输出：

- 静态搜索索引。
- Cloudflare D1 SQLite 表和可发布的静态 JSON 索引。

存储建议：

- MVP：Cloudflare D1 SQLite FTS/LIKE 查询 + 构建期生成的静态 JSON 搜索索引。
- 后续：仍优先扩展 D1 索引；只有免费方案不能满足公开站点查询时，再评估其他搜索服务。

错误处理：

- schema 不一致时停止发布新索引。
- 单条索引失败时记录并进入数据质量报告。

测试方式：

- golden search cases。
- 索引字段完整性检查。

### Recommendation Engine

职责：根据任务上下文、Tool Cards、Rating Results 和用户风险偏好调用 LLM 生成推荐，并把 LLM 输出校验、归一化为可审计的 `Recommendation Result`。

输入：

- Recommendation Query。
- Tool Cards。
- Rating Results。
- 用户或 agent 风险偏好。
- 用户提供的 LLM API key 和模型。

输出：

- `Recommendation Result`。

依赖：

- `docs/09-recommendation-engine.md`。

错误处理：

- 缺少 API key 或模型时返回可恢复错误。
- LLM 返回未知 `tool_id` 时拒绝该候选并记录到 `rejected_candidates`。
- 候选不足时返回 `no_reliable_match`。
- 高风险候选不能被本地归一化为直接 `use`。

测试方式：

- 使用 fake LLM client 的 contract tests。
- 带真实 API key 的 golden queries。
- 解释质量检查。

### Cloudflare Worker HTTP/MCP API

职责：在同一个 Cloudflare Worker 中向 coding agent 暴露只读 HTTP API 和 `/api/mcp` MCP JSON-RPC endpoint。

输入：

- HTTP API request 或 MCP JSON-RPC request。

输出：

- JSON 推荐或工具卡片。

MVP 工具：

- `search_tools`
- `get_tool_card`
- `recommend_tools`
- `explain_rating`

运行边界：

- 与 Web UI 和数据 artifacts 部署在同一个启用 Static Assets 的 Cloudflare Worker 上。
- 只读接口，不执行安装。
- 参数不完整时返回可恢复错误。

测试方式：

- schema contract tests。
- 示例请求响应测试。
- 从 Wrangler deploy output 获取 Worker URL 后，对 `initialize`、`tools/list`、只读 `tools/call` 和只读边界运行部署后 smoke。

### Web UI

职责：提供人工浏览、搜索、比较和审核辅助界面。

输入：

- 静态索引。
- Tool Cards。
- Rating Results。

输出：

- 工具列表。
- 工具详情。
- 推荐结果页。
- 比较视图。

错误处理：

- 数据版本不一致时显示发布错误。
- 低置信字段必须可见。

测试方式：

- 页面渲染检查。
- 基础交互测试。

### Eval Runner

职责：运行数据质量、评分、推荐和回归评测。

输入：

- Tool Cards。
- Rating Results。
- Recommendation Results。
- Eval Cases。

输出：

- Eval Report。
- Eval Diff。

依赖：

- `docs/10-evaluation-plan.md`。

错误处理：

- 关键评测失败时阻止发布。
- 非关键评测失败时生成风险报告。

测试方式：

- eval runner 自测。
- fixture 报告 snapshot。

## 数据流

### 采集入库流

```text
source definition
  -> crawl
  -> raw snapshot
  -> parse source record
  -> normalize tool card
  -> classify
  -> validate
  -> store
```

### 评分索引流

```text
tool card
  -> rating engine
  -> rating result
  -> index builder
  -> static index
  -> search/recommendation
```

### 推荐查询流

```text
task query
  -> intent extraction
  -> candidate retrieval
  -> hard filters
  -> score composition
  -> risk adjustment
  -> explanation
  -> recommendation result
```

### 反馈改进流

```text
v0.4 Web UI
  -> GitHub OAuth identity
  -> D1 unique Tool Card vote
  -> optional prefilled GitHub Issue Form
  -> Release All reviewed bundle build
  -> deterministic validation + constrained LLM triage
  -> accepted/rejected/needs-human-review
  -> immutable vote and accepted-Issue snapshot
  -> feedback_rules.v0.1 adjustment
  -> rating/eval/review
  -> production approval and release
```

v0.4 之前，生产 Worker 仍保持当前只读 Tool Card/API/MCP 主路径。v0.4 P1 才新增 GitHub OAuth、会话和投票写接口；自由文本原因只由用户主动提交到 GitHub Issue，不存入 D1。v0.4 P2 在现有 `Release All` 的 reviewed bundle 构建阶段处理反馈，不新增 Data/MCP/Web 独立发布 workflow。

## 存储建议

| 数据 | MVP 存储 | 后续可选 |
| --- | --- | --- |
| Source Registry | JSON | D1 table |
| Raw Snapshot | 文件系统 + Git LFS 或对象存储引用 | R2/S3 |
| Source Record | JSONL + D1 | D1 table |
| Tool Card | JSONL artifact + D1 seed | D1 table |
| Rating Result | JSONL artifact + D1 seed | D1 table |
| Search Index | 同一 Worker deployment 的静态 JSON | D1 优化索引 |
| Eval Case | JSON | D1 table |
| Eval Report | Markdown/JSON | Dashboard |
| GitHub User / Session | v0.4 前不存储 | v0.4 D1 table，只保存最小身份和会话数据 |
| Tool Card Vote | v0.4 前不存储 | v0.4 D1 table，`github_user_id + tool_card_key` 唯一 |
| Feedback Reason | v0.4 前不存储 | GitHub Issue；不复制到 D1 |

## 技术选型建议

### MVP

- 语言：TypeScript。
- 数据：JSON 文件作为源文件和发布 artifacts，Cloudflare D1 SQLite 保留兼容 read model 和 seed；v0.2 线上查询读取同一 Worker deployment 的静态 artifacts。
- 本地开发：SQLite 兼容 D1 的 schema 和迁移。
- 更新方式：手动触发构建/导入流程。
- Web/API/MCP：由单个启用 Static Assets 的 Cloudflare Worker 统一发布。
- 成本：全部使用免费额度，不引入付费服务。

### 生产演进

- API：Cloudflare Workers。
- 对象存储：仅当免费额度足够且确有必要时评估 Cloudflare R2。
- 数据库：Cloudflare D1 SQLite。
- 搜索：优先基于 D1 和静态 JSON 索引演进。

## 模块边界规则

- Crawler 不做推荐判断。
- Parser 不做评分。
- Normalizer 不丢弃原始来源证据。
- Rating Engine 不修改 Tool Card。
- Recommendation Engine 不绕过安全规则；LLM 输出必须经过本地 schema、已知工具 ID 和高风险动作校验。
- Web UI 不生成不同于 API 的推荐逻辑。
- Eval Runner 只评估，不静默修正 expected results。

## 发布流水线

```text
checkout
  -> validate source registry
  -> crawl selected sources
  -> parse snapshots
  -> normalize tool cards
  -> validate schema
  -> classify
  -> rate
  -> build index
  -> run eval
  -> release admission + promotion check
  -> persist auto-review results in immutable reviewed bundle
  -> GitHub production environment approval
  -> deploy the reviewed bundle to one Cloudflare Worker
  -> MCP deploy-output smoke
  -> persist production release evidence
```

正常审核不生成逐条 approval request。脚本、规则、LLM eval、auto review、release admission 和 promotion check 的结果保存在 reviewed bundle 中，GitHub `production` environment gate 是唯一常规人工发布确认。`Approval Record` 只作为有证据的 break-glass override；高风险工具执行、破坏性操作和安全边界变化仍需人工确认。

`all-v0.2.5` 是当前已验证 production baseline：29 张 Tool Cards、真实 provider golden eval 10/10、production promotion 29/29 和已部署 `/api/mcp` 的 4/4 smoke checks 均通过。Production evidence 将 GitHub run `29070758091`、commit `ca9fb35c4ede1e533f2ce785cc16f11fcefdfdbd`、deployment `5386890737`、reviewed bundle checksums 和线上 endpoint 绑定在一起。

## 扩展点

- 新增来源：增加 SourceDefinition 和 parser。
- 新增工具类型：更新 taxonomy、Tool Card 字段约束、评分规则和评测样例。
- 新增评分维度：更新评分规则、Rating Result schema 和 eval。
- 新增推荐策略：更新 recommendation engine 和 golden queries。
- 新增输出渠道：复用同一 Recommendation Result，不另写逻辑。

## 与其他文档的关系

- 数据结构由 `docs/04-data-model.md` 定义。
- 分类体系由 `docs/05-taxonomy.md` 定义。
- 评分规则由 `docs/06-rating-rules.md` 定义。
- 来源和采集由 `docs/07-source-registry.md`、`docs/08-crawler-and-ingestion.md` 定义。
- 推荐逻辑由 `docs/09-recommendation-engine.md` 定义。
- 评测由 `docs/10-evaluation-plan.md` 定义。
- 安全边界由 `docs/11-security-and-trust.md` 定义。

## 维护规则

- 新增模块前必须说明为什么现有模块无法承载。
- 架构文档应反映真实代码结构，不做脱离实现的蓝图。
- 修改模块边界时必须同步更新需求、数据模型和评测文档。
