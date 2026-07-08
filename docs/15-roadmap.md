# 15 路线图

## 文档用途

本文件定义 Agent Radar 的阶段性目标和优先级，避免项目过早变成大而全平台。

路线图服务一个核心假设：当用户提出开发需求时，Agent Radar 能比普通搜索或链接列表更稳定地推荐合适 AI 工具，并解释风险和证据。

## 路线图原则

- 先验证推荐质量，再扩大覆盖规模。
- 先做静态、可回放、可评测，再做实时平台。
- 先保障安全边界，再优化便利性。
- 每个阶段都要有可演示、可评测的结果。
- 明确不做复杂账号系统、在线安装市场和企业权限治理。

## 阶段总览

| 阶段 | 目标 | 核心交付 |
| --- | --- | --- |
| MVP | 验证结构化推荐主路径 | 文档、MCP/Skill/Agent Tool Card、Cloudflare 免费栈、基础推荐 |
| v0.2 | 扩展数据和基础体验 | 更多来源、Web UI、MCP 查询、golden queries |
| v0.3 | 强化安全和自迭代 | 风险评分、反馈闭环、eval diff、自迭代任务 |
| v1.0 | 稳定公开数据和接口 | 稳定 API/MCP、可复现评测、插件化扩展 |

## 当前进度快照

截至当前分支，Agent Radar 已完成 MVP baseline：

- 文档体系、Tool Card schema、Rating Result、Recommendation Result 和 golden queries 已建立。
- 首批 20 张人工审核 Tool Cards 已进入 JSON artifacts、评分、搜索索引和 D1 seed。
- React/Vite Web UI 已包含 `Tools` 和 `Recommend` 两个主页面，支持工具浏览、详情、评分解释、风险展示、推荐结果列表和 eval 状态弹层。
- Web UI 已增加 `Compare` 页面，支持最多 4 个 Tool Cards 横向比较评分、风险、证据、权限和适用/不适用场景。
- Workers 风格只读 API 已实现 `search_tools`、`get_tool_card`、`recommend_tools`、`explain_rating`。
- 本地 Vite dev server 已挂载 `/api/*`，避免本地开发时前端请求 API 404。
- 推荐路径已从本地关键词/规则排序改为 BYOK LLM-backed 推荐；本地代码负责组装 Tool Card/Rating 上下文、调用 provider、校验已知 `tool_id`、保留风险边界并归一化输出。
- 当前支持的 LLM provider/model 选项：
  - OpenAI：`OpenAI GPT-4.1`、`OpenAI GPT-4.1 mini`
  - MiniMax：`MiniMax M3`
  - DeepSeek：`DeepSeek V4 Pro`、`DeepSeek V4 Flash`
- 推荐 provider endpoint、model label、API model 和 instruction role 已集中到 provider registry，避免推荐引擎内散落常量。
- Recommend UI 的模型下拉选项已从同一份 provider registry 派生，避免前后端 provider label 分叉。
- Provider registry 已增加 `provider_registry.v0.2` 版本号，并由发布流水线输出 `provider_registry.json` runtime config artifact，记录默认模型、BYOK key handling 和可选 provider/model。
- LLM provider 请求会记录 provider、endpoint、model、状态码和脱敏错误体，不记录 API key。
- Provider 401/403、429、模型不可用和 JSON 输出异常已映射为稳定 API error code，并在 Recommend UI 中展示 provider/status 上下文。
- Eval summary 和 markdown eval report 已输出 `failure_category`，可区分 `blocked_no_key`、`provider_error`、`schema_error` 和 `quality_failure`。
- Preview artifact manifest 已汇总 eval failure categories，便于发布审核快速判断失败类型。
- GitHub Actions preview summary 已展示 eval failure categories，便于 reviewer 不打开 JSON 也能看到失败类型分布。
- Preview artifact manifest 已汇总 ingestion approval summary，便于发布审核快速确认 draft 审核状态。
- Preview artifact manifest 已汇总 approval requests summary，便于维护者确认还有多少 draft 缺真实 approval、多少需要重复项审核或 validation 修复。
- Preview artifact manifest 和 ingestion review 已汇总 release admission summary，便于发布审核快速确认草稿发布准入状态。
- 无 `AGENT_RADAR_LLM_API_KEY` 时，pipeline/eval 会生成 blocked eval summary，而不是运行旧本地推荐引擎。
- 已用真实 provider key 跑通 5 个 MVP golden queries，并通过 release gate。
- `npm run ingest` 已提供 v0.2 最小采集草稿链路：读取 enabled Source Registry、保存 Raw Snapshot、输出 Source Records，并为完整且无 parser warnings 的 manual 记录经 normalizer 生成待审核 Tool Card drafts 和 review queue。
- 采集草稿链路已支持最小 Override Record artifact，可对待审核 draft 应用有证据的人工修正，同时保留 override 审计记录。
- 采集草稿链路已支持最小 Approval Record artifact，可记录 draft 的 `approved`、`rejected` 和 `needs_changes` 审核决定，但不会自动发布。
- 采集草稿链路已支持 Approval Request artifact，为缺少 approval 的 draft 输出 approval record template、decision options、duplicate review 背景和 validation 背景，但模板本身不会解除发布阻断。
- 采集草稿链路已输出最小 dedup report，按 draft id 和 canonical URL 标注对已发布 Tool Cards 以及同批 incoming drafts 的可能重复项，供人工审核参考。
- review queue 已包含最小重复信号和 approval decision，可标注 draft 可能对应的已发布 `tool_id`、同批重复 draft id 及人工审核决定，但不会自动合并或发布。
- 采集草稿链路已输出 release admission artifact，只有 ready、approved 且无已发布/同批 draft 重复信号的 draft 会标为 `eligible_for_publish`，但不会自动发布。
- 采集草稿链路已输出 promotion candidates artifact，把 eligible drafts 和 approval evidence 汇总为待人工提升候选，并输出 promotion plan artifact 标注目标文件、候选 artifact 路径、推荐人工动作和发布前检查项；仍不会自动发布到可靠 Tool Cards。
- 发布流水线已输出 `source_registry.json` artifact，并包含基础 Source Registry validator 结果。
- 发布流水线已输出 `source_registry_diff.json` artifact，记录 Source Registry 来源配置 added、removed 和 changed 摘要，并为高影响 changed fields 输出 review requirements；摘要已同步到 preview artifact manifest。
- Preview ingestion review 已展示 Source Registry 字段级 review requirements，便于 reviewer 在 Actions Summary 中看到高影响来源变更的确认原因。
- 发布流水线已输出 `source_registry_review.json` artifact，记录 Source Registry review requirements 的 `pending`、`confirmed`、`rejected` 和 `needs_changes` 状态；summary 已同步到 preview artifact manifest。
- Source Registry validator 已检查 enabled source 是否声明已实现 parser，避免 registry 启用未接入解析器的来源。
- Source Registry validator 已检查 enabled source 是否包含审核 owner 和合法 `last_reviewed_at`。
- Source Registry validator 已检查 enabled source 是否包含 robots/terms 审核记录。
- 发布流水线已输出 `tool_card_validation.json` artifact，并在 Tool Card validator 失败时阻断可靠 artifacts 生成。
- Tool Card validator 已支持 override evidence ref 审计：引用 `override-*` 时必须提供对应 Override Record 上下文。
- Tool Card validator 已支持最小 URL 字段 evidence coverage：关键 URL 字段必须被 `source_urls` 覆盖，并在 validation artifact 中输出 error/warning summary。
- Tool Card validator 已对非人工审核来源的 `permissions`、`security` 和 `maintenance` 缺少字段级 evidence refs 输出 warning，先建立关键字段 provenance coverage 信号。
- 发布流水线已输出 `tool_card_field_provenance.json` schema-level artifact，按 `permissions`、`security` 和 `maintenance` 汇总字段级证据、人工审核覆盖和缺失项，并同步到 preview artifact manifest 与 GitHub Actions preview summary。
- 发布流水线已输出 `tool_card_url_validation.json` artifact；默认跳过外网可达性检查，设置 `AGENT_RADAR_CHECK_URLS=true` 时可执行 Tool Card URL HEAD/GET 检查，并把 summary 同步到 preview artifact manifest。
- 发布流水线已输出 `mcp_tools.json`、`mcp_examples.json` 和 `mcp_smoke_checklist.json`，Workers API 提供 `/api/mcp_manifest` 返回只读工具定义，并提供 `/api/mcp` 最小 MCP JSON-RPC endpoint，支持 `initialize`、`tools/list` 和只读 `tools/call`。
- Golden queries 已扩展到 v0.2 下限 10 条，覆盖 coding agent、agent framework、数据库 MCP、GitHub 和监控调试场景。
- Tag 触发的 Cloudflare Pages preview workflow 已建立，会生成网站、本体数据、eval report、artifact manifest 和 ingestion review，并把审核材料写入 GitHub Actions Summary。
- `npm run ingest` 已输出最小 crawl plan artifact，记录 Source Registry sources 的抓取方法、频率、parser 和 ready/disabled/blocked 状态。
- `npm run ingest` 已输出最小 crawl audit artifact，记录本轮 Raw Snapshot 的来源、抓取状态、HTTP 状态、内容 hash、保存路径和 request metadata。

当前主要缺口：

- Tool Card 覆盖已达到 v0.2 下限 20 张，但仍需继续提升覆盖广度和更细字段级证据质量。
- Golden queries 已达到 v0.2 下限 10 条，并已用 DeepSeek provider key 跑通 10/10；后续仍需持续审查新增 case 的推荐质量。
- 当前 `npm run pipeline` 仍从人工维护的 `src/data/seed-tool-cards.ts` 生成可靠发布 artifacts；`npm run ingest` 生成的 promotion candidates 只进入人工 promotion plan，尚未自动进入可靠发布数据。
- 更细的 Tool Card 字段 provenance 已开始绑定具体 Source Record 字段和值；最小 incoming draft duplicate gates 已接入 dedup report、review queue、approval requests 和 release admission，但完整跨来源 normalizer、完整跨来源 deduper 和人工 override 审核 UI 尚未完成；Source Registry 仍需把 review confirmation artifact 接入可操作审核 UI。
- Workers API 已提供 HTTP/JSON 路由、只读 MCP tool manifest、最小 MCP JSON-RPC endpoint、agent-facing JSON-RPC examples artifact、MCP deployment smoke checklist 和可配置的部署后 smoke 命令；后续仍需配置真实 MCP/Workers base URL 并把 Worker 部署证据纳入发布审核。
- BYOK 模式已经可用，provider registry 已版本化并输出 runtime config artifact；还缺更完整的 provider 配置 UI 和 direct-to-provider/proxy 模式决策。

## MVP

### 目标

证明 Agent Radar 能把分散工具信息转化为可被人和 agent 使用的推荐依据。

### 交付物

- 完整文档体系：
  - 产品简报。
  - 需求。
  - 用户流程。
  - 架构。
  - 数据模型。
  - 分类。
  - 评分。
  - 来源。
  - 采集。
  - 推荐。
  - 评测。
  - 安全。
  - 部署。
  - 自迭代。
  - Web UI。
  - 路线图。
- Tool Card schema v1。
- 初始分类体系。
- `rating_rules.v0.1-draft` 初始评分规则。
- 初始安全风险模型。
- 只覆盖 MCP、Skill 和 Agent 三类首批工具。
- 少量高质量官方或人工审核来源注册。
- 手动触发 Tool Card 生成流程。
- JSON 数据 artifacts。
- Cloudflare D1 SQLite 查询存储。
- 基于 D1 的基础搜索和推荐输出。
- Cloudflare Workers 标准轻量 MCP API 设计。
- Cloudflare Pages 公开站点。
- 5-10 个 golden queries。

### 验收标准

- 至少能回答 5 个典型开发任务推荐问题。
- 每个推荐包含理由、风险、来源和不适用条件。
- 没有可靠候选时能返回 `no_reliable_match`。
- 高风险权限场景要求人工确认。
- 文档之间术语和字段一致。
- 不引入任何付费服务，全部运行在免费额度内。

### 不做

- 全网自动爬虫。
- 自动定时采集。
- 社区目录、awesome list 和新闻来源采集。
- 在线安装市场。
- 账号系统。
- 企业权限治理。
- 大规模实时搜索。
- 用户反馈闭环。

### 主要风险

- Tool Card 字段过多导致早期维护成本高。
- 来源少导致推荐覆盖不足。
- 评分规则过早复杂化。

### 应对

- MVP 允许人工审核和手动触发更新。
- 优先维护高价值工具。
- 用 golden queries 驱动字段和评分迭代。

### 当前完成度

MVP baseline 已完成。当前完成标准为：

- 使用真实 LLM provider key 跑通 5 个 golden queries，并记录 eval summary。
- Critical cases 不出现高风险误推荐，release gate 要求 golden eval 全部通过。
- Cloudflare Pages preview build 可生成网站、本体数据、eval report、ingestion review 和 artifact manifest。
- 生产发布遵循 build once、review preview、promote same deployment，不在 main release 重新运行 pipeline/eval。
- 当前 20 张 Tool Cards 的字段完整、评分解释和 UI 展示一致。

## v0.2

### 目标

扩展数据覆盖，提供可用 Web UI 和 agent 查询能力。

### 交付物

- Source Registry 可执行配置。
- 官方文档、官方仓库、包管理源的基础 parser。
- Tool Card validator。
- Rating Engine v1。
- Search Index Builder。
- 推荐引擎 v1。
- Workers MCP API 只读查询：
  - `search_tools`
  - `get_tool_card`
  - `recommend_tools`
  - `explain_rating`
- Web UI：
  - 工具列表。
  - 工具详情。
  - 推荐查询页。
  - 比较页。
- 20-50 张高质量 Tool Cards。
- 10-20 个 golden queries。
- 评估是否启用社区目录和 GitHub topics 作为发现信号。

### 验收标准

- 发布流水线能生成数据、评分、索引和 eval report。
- Web UI 能展示评分解释和安全风险。
- Workers MCP API 返回稳定 JSON。
- golden queries critical cases 通过。
- 新增来源不会破坏已有推荐。

### 不做

- 复杂用户登录。
- 写操作 API。
- 自动安装第三方工具。
- 商业化 marketplace。

### 主要风险

- parser 维护成本上升。
- GitHub topic 噪声导致低质量候选变多。
- UI 过早消耗精力。

### 应对

- 控制来源数量。
- 社区来源如启用，只作为发现信号。
- UI 只服务浏览、比较和审核。

### 建议拆分

v0.2 建议拆成 4 条并行但有优先级的工作线：

1. 推荐质量线：真实 LLM golden eval、prompt 版本化、provider 错误分类、`no_reliable_match` 和 `ask_human` 质量抽查。
2. 数据覆盖线：把首批 6 张扩到 20-50 张，优先覆盖 OpenAI/Codex、Claude Code、Cursor、OpenCode、Gemini CLI、常见 MCP server、测试/浏览器/支付/邮件/数据库类工具。
3. API/MCP 线：把 HTTP JSON API 包装为 agent 可调用的 MCP 工具定义，补充 contract tests 和示例请求。
4. 本地/部署线：完善 BYOK dev/prod 配置、Cloudflare Worker 部署说明、provider key 不落盘检查和日志脱敏。

## v0.3

### 目标

强化安全、评测和反馈闭环，让推荐结果更可信。

### 交付物

- 安全风险评分 v1。
- Human Approval 规则接入推荐输出。
- Eval Diff 报告。
- 用户反馈记录格式。
- 人工 override 机制。
- 数据质量 dashboard 或报告。
- 自迭代任务生成：
  - parser failure task。
  - data quality task。
  - recommendation misrank task。
  - safety eval failure task。
- 50-150 张高质量 Tool Cards。
- 20-40 个 golden queries。

### 验收标准

- 高风险安全评测阻止发布。
- 评分或推荐规则变化能显示前后差异。
- 用户反馈可以转化为 eval case 或数据修正。
- 自迭代只处理低风险任务，高风险任务进入审批。
- 权限未知率和重复率持续下降。

### 不做

- 完全自动修复所有误判。
- 自动信任新来源。
- 自动执行推荐工具。
- 企业级审批流。

### 主要风险

- 安全规则过严导致推荐过少。
- 反馈系统引入噪声。
- 自迭代边界不清。

### 应对

- 用 `consider` 和 `ask_human` 表达中间状态。
- 用户反馈必须有证据或人工审核。
- 自迭代文档明确允许和禁止范围。

## v1.0

### 目标

形成稳定、公开、可复现的 AI 工具评级与推荐数据层。

### 交付物

- 稳定 Tool Card schema。
- 稳定 Rating Result 和 Recommendation Result schema。
- 稳定只读 API/MCP。
- 可复现数据构建流水线。
- 可公开引用的数据版本。
- 可扩展来源 parser 规范。
- 可配置评分策略。
- 完整评测套件。
- 公开数据发布说明。
- 生态报告生成能力。

### 验收标准

- 数据版本、规则版本和索引版本可追溯。
- 任一推荐结果可解释到字段和来源。
- 关键评测长期稳定。
- 新增工具类型有明确扩展流程。
- 外部 agent 能可靠消费 JSON/MCP 输出。

### 不做

- 不成为通用新闻站。
- 不成为未验证的一键安装市场。
- 不承诺完整安全审计。
- 不默认处理用户私密数据。

### 主要风险

- 公开数据被误解为安全背书。
- 覆盖扩大后质量下降。
- 多生态分类和评分争议增加。

### 应对

- 明确风险和置信度。
- 坚持来源证据和评测门槛。
- 对争议工具提供解释而非绝对排名。

## 跨阶段里程碑

### 数据覆盖

- MVP：少量高质量人工审核、手动触发更新的 Tool Cards。
- v0.2：20-50 张高质量 Tool Cards。
- v0.3：50-150 张高质量 Tool Cards。
- v1.0：公开稳定数据集，覆盖核心生态。

### 推荐质量

- MVP：5 个核心 golden queries。
- v0.2：10-20 个 golden queries；真实 LLM provider 下关键任务 Top 3 可用，critical safety cases 不出现高风险误推荐。
- v0.3：安全和无结果场景稳定。
- v1.0：可复现 ranking eval 和 explain eval。

### 安全

- MVP：风险字段和人工确认规则。
- v0.2：推荐输出暴露风险。
- v0.3：安全评测阻断发布。
- v1.0：稳定安全策略和审计记录。

### Agent 可用性

- MVP：JSON 输出设计。
- v0.2：Workers HTTP API + MCP tool manifest 只读查询。
- v0.3：自迭代任务生成。
- v1.0：稳定 agent 决策上下文。

## 下一步计划

### P0：v0.2 数据接入

- 继续增加高价值 Tool Cards，从当前 20 张扩展到更稳健的 30-50 张覆盖。
- 把 `npm run ingest` 输出的 approval requests 和 promotion candidates 接入人工审核 UI 或可靠发布提升流程；当前 preview review markdown 已展示 approval record 模板、release admission blocked reasons，以及候选 tool id、Source Record id、reviewer、review time 和 approval reason，可靠发布提升仍待做。
- 将 Source Registry review confirmation artifact 接入可操作审核 UI；当前 preview markdown 已展示 requirements，artifact manifest 已汇总确认状态。
- 将 Tool Card 字段 provenance 继续细化到 Source Record 字段和值，并决定是否在 CI 默认启用 URL 可达性检查；schema-level `tool_card_field_provenance.json` 和 ingest-time `tool_card_field_value_provenance.v1` artifact 已实现。
- 补齐跨来源 deduper、跨来源 normalizer 和 Tool Card drafts 发布准入。
- 使用真实 provider key 重跑 10 条 golden queries，并审查新增 case 的推荐质量。

### P1：v0.2 基础

- 将 Cloudflare Pages preview 审核流程补齐到生产 promote 自动化：
  - Reviewer 审核 preview URL、Actions Summary、artifact manifest 和 ingestion review。
  - Production 只 promote 已审核的 preview deployment 或同一个 immutable bundle，不重新运行 pipeline/eval。
  - 记录 production deployment id、manifest checksum 和 D1 seed checksum。
- 增加 1-2 个官方来源的 crawler/parser，保持 GitHub topics disabled 直到噪声评估完成。
- 将 `provider_registry.json` 接入更完整的 provider 配置 UI；provider registry 版本号和 runtime config artifact 已实现。
- 配置真实 MCP/Workers base URL，并把 `npm run mcp:smoke` 结果和 Worker deployment id 纳入发布审核；最小 MCP JSON-RPC endpoint、agent-facing examples artifact、deployment checklist 和可配置 smoke 命令已实现。
- 继续扩展 GitHub Actions 审核摘要中的发布证据；eval failure category 汇总已展示。

### P2：可信度增强

- 为 LLM prompt 和 provider routing 增加版本号。
- 增加 eval diff，比较同一 golden query 在不同 prompt/provider 下的动作、候选和风险提示变化。
- 设计人工 override record 的最小格式。
- 评估是否支持 browser direct provider mode；若支持，必须把前端 schema 校验和安全归一化同步搬到浏览器端。

## 明确不做清单

早期不做：

- 账号系统。
- 企业 SSO。
- 付费 marketplace。
- 任何付费基础设施。
- 自动安装和执行第三方工具。
- 私有代码扫描。
- 浏览器或邮件数据采集。
- 复杂权限治理。
- 大规模实时新闻聚合。

除非产品简报更新，否则这些不应进入 MVP 或 v0.2。

## 优先级判断

遇到新想法时，按以下问题判断：

1. 是否帮助用户或 agent 更可靠地选择工具？
2. 是否提升数据可信度、推荐解释或安全边界？
3. 是否能被评测验证？
4. 是否会显著增加运维或安全负担？
5. 是否可以用更小的静态或人工流程先验证？

只有前 3 个问题为“是”，且第 4 个风险可控时，才考虑进入近期路线图。

## 维护规则

- 路线图必须服务产品目标，不按技术兴趣扩张。
- 每个阶段都应有可演示、可评测的结果。
- 阶段范围变化必须同步更新需求和评测计划。
- 把新能力加入路线图前，先确认它不违反产品边界。
