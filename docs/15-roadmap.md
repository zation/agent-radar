# 15 路线图

## 文档用途

本文件定义 Agent Radar 的阶段性目标和优先级，避免项目过早变成大而全平台。

本文件是当前开发阶段、优先级、里程碑和完成状态的唯一事实源。产品与技术事实由 `README.md` 和对应的 `docs/00-14` 维护；Spec 记录设计决策，Plan 记录实施过程，二者完成后冻结并链接回本文件。

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
| v0.3 | 提升数据可信度与推荐安全 | P1 数据与可信度、P2 推荐安全与评测 |
| v0.4 | 优化界面并建立反馈闭环 | P1 界面与反馈采集、P2 反馈处理与评级接入 |
| v1.0 | 稳定公开数据和接口 | 稳定 API/MCP、可复现评测、插件化扩展 |

## 当前进度快照

~~截至当前分支，Agent Radar 已完成 MVP baseline 和 v0.2 功能 baseline，当前处于 v0.2 收口阶段。~~

实际情况：MVP 和 v0.2 已完成，`all-v0.2.5` 已通过生产发布与线上核验；当前开发阶段为 v0.3 P1 数据与可信度，完成后进入 P2 推荐安全与评测。

- 文档体系、Tool Card schema、Rating Result、Recommendation Result 和 golden queries 已建立。
- 默认发布数据已从 seed Tool Cards 切换为采集候选：`npm run pipeline` 读取 enabled Source Registry，经 release admission 和 promotion check 后生成 JSON artifacts、评分、搜索索引和 D1 seed。
- React/Vite Web UI 已包含 `Tools` 和 `Recommend` 两个主页面，支持工具浏览、详情、评分解释、风险展示、推荐结果列表和 eval 状态弹层。
- Web UI 已增加 `Compare` 页面，支持最多 4 个 Tool Cards 横向比较评分、风险、证据、权限和适用/不适用场景。
- Web UI 已增加 `Review` 页面，读取 `source_registry_review_requests.json`，展示 Source Registry production gate review request 的审核原因和 suggested action。
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
- Preview artifact manifest 已汇总 approval override 使用情况，便于发布审核确认是否存在 break-glass evidence；它不表示默认逐条审核 draft。
- Preview artifact manifest 已汇总 intervention requests summary，便于维护者确认还有多少 draft 需要在发布前处理重复项或 validation 修复。
- Preview artifact manifest 和 ingestion review 已汇总 auto review 与 release admission summary，便于发布审核快速确认草稿自动审核建议、发布 gate 和阻断原因。
- Preview artifact manifest、GitHub Actions preview summary 和 ingestion review 已汇总 discovery candidates summary，便于维护者审核发现候选而不自动生成 Tool Card draft。
- 无 `AGENT_RADAR_LLM_API_KEY` 时，pipeline/eval 会生成 blocked eval summary，而不是运行旧本地推荐引擎。
- 已用真实 provider key 跑通 5 个 MVP golden queries，并通过 release gate。
- `npm run ingest` 已提供 v0.2 最小采集草稿链路：读取 enabled Source Registry、保存 Raw Snapshot、输出 Source Records，并为完整且无 parser warnings 的 manual 记录经 normalizer 生成待审核 Tool Card drafts 和 review queue。
- 采集草稿链路已支持最小 Override Record artifact，可对待审核 draft 应用有证据的人工修正，同时保留 override 审计记录。
- 采集草稿链路保留最小 Approval Record artifact 作为 break-glass override，但默认审核路径由 auto review、release admission、promotion check 和 GitHub production approval 完成。
- 采集草稿链路已支持 Intervention Request artifact，为自动审核无法闭合的 draft 输出 `resolve_before_release` action、duplicate review 背景和 validation 背景，并额外生成逐行可处理的 `tool_card_drafts.jsonl`；它不要求维护者逐条填写 approval record。
- 采集草稿链路已输出最小 dedup report，按 draft id 和 canonical URL 标注对已发布 Tool Cards 以及同批 incoming drafts 的可能重复项，供人工审核参考。
- review queue 已包含最小重复信号，可标注 draft 可能对应的已发布 `tool_id` 和同批重复 draft id，但不会自动合并或发布。
- 采集草稿链路已输出 auto review 和 release admission artifact；ready 且无重复信号的 draft 可通过自动审核 `promote` gate 标为 `eligible_for_publish`；少数 Approval Record 只作为 `approval_override` break-glass gate。
- 采集草稿链路已输出 promotion candidates artifact，把 eligible drafts 和 auto review / approval override evidence 汇总为发布候选，并输出 promotion plan artifact 和 promotion check dry-run，标注目标 artifact、候选 artifact 路径、推荐发布动作、发布前检查项和阻断原因；`npm run pipeline` 默认消费通过 gate 的候选生成可靠 Tool Cards。
- 发布流水线已输出 `source_registry.json` artifact，并包含基础 Source Registry validator 结果。
- 发布流水线已输出 `source_registry_diff.json` artifact，记录 Source Registry 来源配置 added、removed 和 changed 摘要，并为高影响 changed fields 输出 review requirements；摘要已同步到 preview artifact manifest。
- Preview ingestion review artifact 已展示 Source Registry 字段级 review requirements；Actions compact summary 只展示 pending/confirmation 数量，便于 reviewer 判断是否需要打开完整明细。
- 发布流水线已输出 `source_registry_review.json` artifact，记录 Source Registry review requirements 的 pending production gate 关注项；summary 已同步到 preview artifact manifest。
- 发布流水线已输出 `source_registry_review_requests.json` artifact，为 pending Source Registry requirements 生成 `suggested_action`；summary 已同步到 preview/Actions review 材料，并已接入 Web UI 的 Review 页面只读展示。
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
- Web、数据 artifacts、HTTP API 和 MCP JSON-RPC endpoint 已统一由一个启用 Static Assets 的 Cloudflare Worker 承载；`preview:build` 只是 reviewed bundle 的历史命令名，不代表独立预览部署。
- `Release All` production workflow 已实现静态 assets/data build once、reviewed bundle 上传、GitHub `production` environment 人工确认、从同一不可变 tag/SHA 构建 Worker 并原样恢复 reviewed `dist-pages`、从 Wrangler deploy output 提取 Worker URL，以及部署后 MCP smoke。
- Production evidence builder 已实现：workflow 在 smoke 后解析匹配的 GitHub production deployment，生成并上传 `production-release-evidence.json`，关联 run、SHA、tag、reviewed bundle、manifest checksum、D1 seed checksum、Worker/MCP endpoint 和 smoke 结果。
- ~~`all-v0.2.4` 是当前已验证 production baseline：29 张 Tool Cards、真实 provider golden eval 10/10、production promotion 通过、已部署 MCP smoke 4/4。~~ 实际情况：`all-v0.2.4` 是上一版已验证 production baseline。
- `all-v0.2.5` 已完成本地质量门禁、GitHub `production` approval、部署、production evidence 和线上核验；29 张 Tool Cards、真实 provider golden eval 10/10、production promotion 29/29 和 MCP smoke 4/4 均通过。
- `npm run ingest` 已输出最小 crawl plan artifact，记录 Source Registry sources 的抓取方法、频率、parser 和 ready/disabled/blocked 状态。
- `npm run ingest` 已输出最小 crawl audit artifact，记录本轮 Raw Snapshot 的来源、抓取状态、HTTP 状态、内容 hash、保存路径和 request metadata。
- 已实现基础 `github_topic_parser` fixture、GitHub topic crawler 映射、基础 `npm_package_parser` 和 discovery candidates artifact，可把 GitHub topic/Search API repository payload 与 npm package metadata 解析成 Source Records，并记录 rate-limit/package metadata；`github-topic-mcp` 与 `npm-modelcontextprotocol-sdk` 已作为默认受控公共 metadata sources 启用，repository/package 记录会生成保守 Tool Card drafts 并进入 auto review、release admission、promotion candidates 和可靠发布 artifacts；discovery candidates 与 auto review summary 已同步到 preview/Actions review 材料。

v0.3 kickoff 基线与后续缺口：

- Tool Card 默认覆盖现在取决于 enabled Source Registry 的采集结果；仍需继续提升来源数量、覆盖广度和更细字段级证据质量。
- Golden queries 已达到 v0.2 下限 10 条，并已用 DeepSeek provider key 跑通 10/10；后续仍需持续审查新增 case 的推荐质量。
- 当前 `npm run pipeline` 已从 enabled Source Registry 生成可靠发布 artifacts；下一步重点是扩展更多高质量来源、完善跨来源冲突处理，并继续增强 reviewed bundle 中审核结果的持久化摘要。
- 更细的 Tool Card 字段 provenance 已绑定具体 Source Record 字段和值，并会为已应用的 Override Record 输出 `override_record` 字段值 provenance；最小 incoming draft duplicate gates 已接入 dedup report、review queue、intervention requests、auto review 和 release admission；GitHub topic 与 npm package sources 已启用为受控公共 metadata 来源，repo/package drafts 会经过最小跨来源 normalizer、preview 审核材料和 promotion candidate gate；仍缺更完整的字段冲突合并策略和跨生态 package parser。
- v0.2 收口发布已经完成；后续工作进入 v0.3 P1 数据与可信度。
- ~~BYOK 模式已经可用，provider registry 已版本化并输出 runtime config artifact；更完整的 Provider 配置 UI、浏览器运行时读取 `provider_registry.json`，以及 direct-to-provider/proxy 模式决策已移到 v0.3/P2，不阻塞 v0.2。~~ 实际情况：现有 BYOK proxy 已满足近期需求，更完整的 Provider 能力移入 Backlog，不占用 v0.3 或 v0.4 交付范围。

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
- Cloudflare Worker Static Assets 公开站点。
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
- Reviewed bundle build 可生成网站、本体数据、eval report、ingestion review 和 artifact manifest。
- 生产发布对静态 assets/data 遵循 build once、review once、原样部署 reviewed `dist-pages`；Worker 从同一不可变 ref 构建，production job 不重新运行 pipeline/eval。
- `all-v0.2.4` 已验证 29 张 Tool Cards 的字段、评分解释和 UI 展示一致。

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

### ~~建议拆分~~ 实际完成结果

~~v0.2 建议拆成 5 条并行但有优先级的工作线：~~

1. ~~推荐质量线：真实 LLM golden eval、prompt 版本化、provider 错误分类、`no_reliable_match` 和 `ask_human` 质量抽查。~~ 实际完成：真实 provider golden eval 10/10、provider 错误分类、`no_reliable_match` 和 `ask_human` 安全边界已通过 v0.2 发布；prompt 版本化进入 v0.3。
2. ~~审核自动化线：把 `draft -> auto review -> release admission -> promotion candidates` 的自动证据汇总、规则/LLM Review Summary、发布准入评分卡和 intervention requests 继续打磨成稳定 reviewed bundle 证据。~~ 实际完成：自动审核、发布准入、promotion check、intervention requests 和 immutable reviewed bundle 已投入生产；更完整的 Review Summary 进入 v0.3 P1。
3. ~~数据覆盖线：把首批 20 张扩到 20-50 张，优先覆盖 OpenAI/Codex、Claude Code、Cursor、OpenCode、Gemini CLI、常见 MCP server、测试/浏览器/支付/邮件/数据库类工具。~~ 实际完成：v0.2 发布 29 张 Tool Cards，达到 20-50 张验收范围；v0.3 目标扩大到 50-150 张。
4. ~~API/MCP 线：把 HTTP JSON API 包装为 agent 可调用的 MCP 工具定义，补充 contract tests 和示例请求，并预留只写反馈接口设计。~~ 实际完成：只读 MCP JSON-RPC endpoint、manifest、示例和 contract/smoke tests 已部署并通过 4/4 smoke；~~反馈写接口留在 v0.3。~~ 实际情况：GitHub 身份投票写接口进入 v0.4 P1。
5. ~~本地/部署线：完善 BYOK dev/prod 配置、Cloudflare Worker 部署说明、provider key 不落盘检查和日志脱敏。~~ 实际完成：BYOK provider routing、日志脱敏、单 Worker 发布和 production evidence 已通过 `all-v0.2.5` 验证。

## v0.3

### Kickoff 状态

v0.3 已启动。P1 数据与可信度已完成本地阶段验收；当前阶段切换为 P2 推荐安全与评测 kickoff，P2 Spec/Plan 尚未创建。

### 目标

提升 Tool Card 数据可信度、推荐安全边界和评测可解释性。

### P1：数据与可信度

阶段 Spec：[`v0.3 P1：数据与可信度`](superpowers/specs/2026-07-10-v0.3-p1-数据与可信度-设计.md)（已完成并冻结）。

阶段 Plan：[`v0.3 P1：数据与可信度实施计划`](superpowers/plans/2026-07-10-v0.3-p1-数据与可信度-计划.md)（已完成并冻结）。

- Field provenance v2、冲突报告、URL checker v2、Review Summary v2 和数据质量报告已接入 reviewed bundle 及确定性发布门禁。
- 25 个精确官方 GitHub 来源已加入受控 Source Registry；真实构建产出 53 张可靠 Tool Cards。
- 阶段验收结果：关键 provenance 100%，未解决关键冲突、重复、blocking URL、intervention 和 promotion blocked 均为 0，真实 provider golden queries 10/10。

### P2：推荐安全与评测

- 安全风险评分 v1。
- ~~Human Approval 规则接入推荐输出。~~ 实际情况：v0.2 已实现高风险推荐强制 `ask_human`；P2 补充结构化 `requires_human_approval`、`approval_reason`、确认问题和安全默认值。
- Eval Diff 报告。
- Prompt、provider routing 和推荐规则版本化。
- 20-40 个 golden queries。
- Critical safety regression 阻断发布。

### 验收标准

- 高风险安全评测阻止发布。
- 评分或推荐规则变化能显示前后差异。
- 关键字段 provenance 覆盖率达到 100%，发布候选不存在未解决数据质量阻断项。
- 关键 URL 有近期可达性或可解释状态。
- 权限未知率和重复率持续下降。

### 不做

- 完全自动修复所有误判。
- 自动信任新来源。
- 自动执行推荐工具。
- 企业级审批流。

### 主要风险

- 数据覆盖扩张导致字段证据质量下降。
- 安全规则过严导致可靠候选过少。

### 应对

- 先通过 P1 建立可回放数据证据，再扩大 Tool Card 数量。
- 用 `consider`、`ask_human` 和 `no_reliable_match` 表达安全中间状态。
- 用 eval diff 和 critical safety cases 约束 P2 规则变化。

## v0.4

### 目标

优化公开 Web UI，并建立基于 GitHub 身份、D1 投票和 GitHub Issue Form 的可审计用户反馈闭环。

### P1：界面与反馈采集

- Web UI 视觉和交互重构；具体视觉方向在 v0.4 启动时单独设计。
- GitHub OAuth 最小登录，只读取稳定 user ID 和公开用户名。
- D1 保存单用户、单 Tool Card 的唯一当前投票，支持赞、踩和取消。
- 聚合赞踩数公开，个人投票状态仅本人可见，不公开用户列表。
- 可选打开 `zation/agent-radar` 的 GitHub Issue Form；页面不直接创建 Issue。
- Issue Form 预填 Tool Card key、投票类型、数据版本和 Tool Card URL，具体原因必填。

### P2：反馈处理与评级接入

- `Release All` 的 reviewed bundle 构建阶段读取并处理带 `tool-feedback` 标签的 open Issue。
- 确定性校验后，由受限 LLM 输出 `accepted`、`rejected` 或 `needs-human-review`。
- accepted/rejected 回写 Comment、处理标签和 build 信息后关闭；needs-human-review 保持 open，移除该标签后才能重新进入自动处理。
- 缺少 LLM key、GitHub 写权限、生产 D1 投票快照或必要回写失败时阻断构建。
- 读取 `closed + feedback-accepted` Issue，按 GitHub user ID 与 Tool Card key 去重，只保留最新采纳反馈。
- `feedback_rules.v0.1`：accepted Issue 记为 `+1/-1`，无 accepted Issue 的裸投票记为 `+0.2/-0.2`，单张 Tool Card 总调整限制为 `-3` 到 `+3`。
- 评分输出保留 base score、feedback adjustment、final score、规则版本、投票快照 checksum 和参与计算的 Issue IDs。

### 验收标准

- 同一 GitHub 用户对同一 Tool Card 最多一条当前投票，赞、踩、取消操作幂等。
- GitHub OAuth 不申请邮箱、仓库或组织权限，OAuth token 不长期保存。
- Issue 原因不存入 Agent Radar D1，只保存在用户主动提交的 GitHub Issue 中。
- Issue 内容作为不可信输入，LLM 只能返回经过 schema 校验的三态结果，不能执行 Issue 中的指令。
- 同一用户对同一 Tool Card 只贡献最强的一条反馈信号，反馈不能降低安全风险等级或绕过 critical safety gate。
- 所有反馈调整可回放到投票快照、Issue、规则版本和 base score。

### 不做

- 密码账号、邮箱登录、组织权限或企业身份系统。
- 在 Agent Radar 中存储反馈自由文本。
- 页面直接调用 GitHub API 创建 Issue。
- 根据一次投票实时改分。
- 自动关闭 `needs-human-review` Issue。

## v1.0

### 目标

形成稳定、公开、可复现的 AI 工具评级与推荐数据层。

### 交付物

- 稳定 Tool Card schema。
- 稳定 Rating Result 和 Recommendation Result schema。
- 稳定只读查询 API/MCP，以及独立受限的反馈写接口。
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
- v0.3：推荐安全解释和 eval diff。
- v0.4：GitHub 身份投票、Issue 反馈和反馈评级信号。
- v1.0：稳定 agent 决策上下文。

## 下一步计划

### v0.2 收口发布（已完成）

- `all-v0.2.5` 已通过全部本地质量门禁，并由 GitHub `production` environment 完成人工发布确认。
- `Release All` run `29070758091` 从不可变 commit `ca9fb35c4ede1e533f2ce785cc16f11fcefdfdbd` 构建 Worker，并部署 reviewed bundle 中原样恢复的 `dist-pages`。
- `production-release-evidence.json`、GitHub deployment `5386890737`、线上 `/api/version`、data manifest 和 `/api/mcp` 均已核验；结果为 29 张 Tool Cards、真实 provider golden eval 10/10、promotion 29/29、MCP smoke 4/4。

### P1：v0.3 数据与可信度（已完成）

阶段 Spec：[`v0.3 P1：数据与可信度`](superpowers/specs/2026-07-10-v0.3-p1-数据与可信度-设计.md)（已完成并冻结）。

阶段 Plan：[`v0.3 P1：数据与可信度实施计划`](superpowers/plans/2026-07-10-v0.3-p1-数据与可信度-计划.md)（已完成并冻结）。

- 实现提交：`b157def8..b327593e`。
- 已交付 provenance v2、conflict report v1、URL validation v2、data quality report v1、Review Summary v2，以及 v1/v2 一个迁移周期的并行 artifacts。
- 真实构建结果：53 张可靠 Tool Cards；243 个 URL 字段结果 reachable、7 个 auth-required、6 个 transient warning、0 个 permanent failure/blocking；关键 provenance 100%；0 个未解决关键冲突、重复、intervention 和 promotion blocked。
- 真实 provider golden queries 10/10；全量 232 tests、lint 和 stylelint 通过。

### P2：v0.3 推荐安全与评测

- 实现安全风险评分 v1 和结构化 Human Approval 输出。
- 增加 eval diff，比较同一 golden query 在不同 prompt、provider 和规则版本下的动作、候选和风险提示变化。
- 将 golden queries 扩展到 20-40 个，并让 critical safety regression 阻止发布。

### v0.3 Kickoff 验收

- 50-150 张高质量 Tool Cards，关键字段 provenance 覆盖率 100%。
- 20-40 个 golden queries，critical safety cases 全部通过。
- 关键 URL 有近期可达性或可解释状态，不允许未解释的持续 404/410 进入发布。
- 发布候选不存在未解决重复项、validation error 或 intervention request。
- prompt、provider、规则和评测结果版本可追溯，并能生成 eval diff。

### v0.4：界面与用户反馈

- P1 完成 UI 重构、GitHub OAuth、D1 投票和结构化 Issue Form 跳转。
- P2 将三态 Issue 处理、投票快照和 `feedback_rules.v0.1` 接入 `Release All` 的 reviewed bundle 构建。

### Backlog

- 更完整的 Provider 配置 UI。
- 浏览器运行时读取 `provider_registry.json`。
- direct-to-provider 与 proxy 模式选择。

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
- Roadmap 只维护当前阶段、优先级、里程碑、完成状态和相关文档链接，不复制完整设计或逐步实施清单。
- 新能力以 Roadmap 中的 P1/P2 阶段为主要 Spec/Plan 粒度；例如 v0.3 P1“数据与可信度”共用一组 Spec/Plan，阶段内任务不重复建档，除非后续膨胀为可独立验收的项目。
- 功能完成时，同一变更必须更新对应 `docs/00-14` 领域文档和本 Roadmap；完成后的 Spec/Plan 只补状态、实现提交和当前状态来源，随后冻结。
- 若文档冲突，领域事实以 `README.md` 或对应 `docs/00-14` 为准，当前阶段与进度以本文件为准，已完成 Spec/Plan 不作为当前状态依据。
