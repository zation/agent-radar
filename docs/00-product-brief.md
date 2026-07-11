# 00 产品简报

## 文档用途

本文件定义 Agent Radar 的产品定位、目标用户、核心价值、产品边界和成功指标。它是所有需求、架构、评分、推荐和路线图决策的上游依据。

当后续文档出现范围冲突时，优先回到本文件判断：这个能力是否帮助人类开发者或 coding agent 更可靠地选择 AI 工具。

## 一句话定位

Agent Radar 是面向人类开发者和 coding agent 的 AI 工具评级与推荐知识库，用结构化数据、可解释评分和面向任务的推荐，帮助用户在 AI Agent、Skill、MCP Server、CLI、Framework 和 Prompt/Rules 中选择合适工具。

## 产品背景

AI 开发工具正在从单一产品扩散为一组可组合生态：模型、agent、MCP server、CLI、编辑器扩展、工作流 skill、规则文件和框架同时存在。开发者面对的问题不再只是“有哪些工具”，而是：

- 哪个工具适合当前任务。
- 工具是否仍然维护、是否安全、是否容易集成。
- coding agent 能否读取这些信息并做出可执行的工具选择。
- 不同来源的推荐是否有证据支持，而不是只靠热度、排名或作者宣传。

Agent Radar 的核心机会是把分散的生态信息整理成 agent 也能使用的决策层，而不是再做一个只给人浏览的链接列表。

## 目标用户

### AI-first 开发者

这类用户日常使用 Codex、Claude Code、Cursor、OpenCode、Gemini CLI 等工具完成开发任务。他们需要快速判断某个任务应该使用已有 agent、MCP、skill、CLI、framework，还是直接写代码。

### Coding agent 使用者

这类用户希望把工具选择交给 agent，但仍然需要透明的推荐理由、风险提示和可追溯来源。Agent Radar 应让 agent 能查询工具能力、适用场景、限制条件和评分解释。

### AI 平台团队

这类团队需要为内部开发者维护一套可靠工具目录，关注覆盖范围、更新频率、安全边界、评分一致性和可治理性。他们不是只要“发现新工具”，而是要能复用一套判断标准。

### 工具维护者

这类用户希望自己的工具被准确理解、分类和推荐。他们关心工具卡片是否表达了真实能力、安装方式、适用场景、限制和维护状态。

## 核心问题

Agent Radar 要解决的核心问题是：给定一个开发需求，如何可靠地找到适合的 AI 工具，并解释为什么推荐它。

这个问题包含几个子问题：

- 生态信息分散在 GitHub、文档站、MCP registry、博客、示例仓库和社区讨论中。
- 工具命名和分类不统一，同一个工具可能被描述为 agent、plugin、skill、server 或 framework。
- 热度不等于可用性，star、转发和榜单不能直接代表集成质量、维护质量或任务适配度。
- 人类读得懂的介绍不一定适合 agent 决策，缺少结构化字段、风险标注和机器可读输出。
- 工具推荐需要可解释，否则用户和 agent 都无法判断是否应该信任推荐结果。

## 主要场景

### 任务驱动推荐

用户或 agent 提供任务描述，例如“为一个 Python 项目增加测试覆盖率”“在 Codex 中读取 Gmail 并总结待办”“给 Next.js 应用接入 Stripe Checkout”。Agent Radar 返回候选工具、适配理由、风险、替代方案和来源证据。

### 工具发现与比较

用户想了解某类工具，例如 MCP Server、coding agent framework、CLI agent 或 prompt/rules 模板。Agent Radar 提供分类检索、工具卡片、评分维度和同类比较。

### Agent 决策上下文

coding agent 在执行任务前查询 Agent Radar，获得可放入上下文的结构化建议，例如可用工具、触发条件、安装或调用限制、安全注意事项和不适用场景。

### 工具生态监测

项目维护者或平台团队定期查看工具新增、失效、维护状态变化、评分变化和风险变化，决定是否引入、保留或下线某类工具。

### 研究与报告

用户需要了解 AI 工具生态趋势时，Agent Radar 可以生成基于结构化数据的报告，但报告是评级与推荐系统的副产品，不是产品的主要形态。

## 产品边界

Agent Radar 是评级与推荐知识库，不是通用新闻站、安装市场或安全扫描平台。

### 要做

- 收集 AI Agent、Skill、MCP Server、CLI、Framework 和 Prompt/Rules 的公开信息。
- 统一生成 Tool Card，描述工具类型、能力、适用任务、使用方式、限制、来源和置信度。
- 建立分类体系，让人和 agent 都能按任务、生态、集成方式和风险查找工具。
- 建立可解释评分规则，覆盖任务适配度、维护状态、文档质量、集成成本、安全风险和证据质量。
- 提供搜索、筛选、比较和推荐能力。
- 提供 agent 友好的查询输出，例如 JSON、Markdown 摘要或 MCP 查询接口。
- 保留来源和更新时间，让推荐结果可追溯、可复查。

### 不做

- 不做只按时间线聚合的 AI 新闻摘要。
- 不做只收集链接、不验证字段、不解释推荐理由的 awesome list。
- 不做未经验证的自动安装平台。
- 不替代安全扫描器，不承诺发现所有漏洞、供应链攻击或恶意行为。
- 不在早期做复杂账号系统、企业权限治理或在线交易市场。
- 不把工具热度直接等同于推荐排名。

## 相邻产品差异

### 与 MCP registry 的差异

MCP registry 主要解决 MCP server 的发现和分发问题。Agent Radar 覆盖范围更广，包括 MCP 之外的 agent、skill、CLI、framework 和 prompt/rules，并强调跨类型推荐、评分解释和任务适配。

### 与 awesome list 的差异

awesome list 适合人工浏览和初步发现，但通常缺少结构化字段、统一评分、更新机制和推荐解释。Agent Radar 的目标是让数据能直接进入 agent 决策流程。

### 与 AI 生态日报的差异

AI 生态日报强调新闻性和时效性。Agent Radar 关注长期可用的工具知识库，新闻和更新只是触发工具卡片变更的信号。

### 与安全扫描器的差异

安全扫描器关注漏洞、依赖风险和运行时安全。Agent Radar 会记录安全相关风险，但目的是辅助工具选择，不提供完整安全审计结论。

### 与企业工具目录的差异

企业工具目录通常服务内部合规、采购和权限管理。Agent Radar 更偏公开生态知识库和 agent 可读推荐层；未来可以支持企业自定义策略，但不是 MVP 的中心。

## 差异化价值

Agent Radar 的差异化不在于“列出更多工具”，而在于把工具信息转化为可执行的选择依据：

- 面向任务，而不是面向榜单。
- 面向 agent 决策，而不只是人类阅读。
- 评分可解释，能说明证据、权衡和不确定性。
- 覆盖多种工具形态，避免 MCP、CLI、skill、framework 各自孤岛化。
- 明确标注来源、更新时间和置信度，降低幻觉式推荐风险。
- 允许同一需求下给出“推荐、可选、不建议”的分层结果。

## MVP 范围

MVP 的目标是验证一个核心假设：当用户提出开发需求时，Agent Radar 能比普通搜索或链接列表更稳定地推荐合适 AI 工具。

MVP 应包含：

- 一套最小 Tool Card schema。
- 初始分类体系，长期覆盖 Agent、Skill、MCP Server、CLI、Framework、Prompt/Rules；MVP 首批只收录 MCP、Skill 和 Agent。
- 少量高质量官方来源和受控公开 metadata sources，以及人工触发、可回放的数据导入流程。
- 基于 JSON 和 Cloudflare D1 SQLite 的基础索引和搜索能力。
- 基础评分规则，优先强调适用场景、维护状态、文档质量、集成成本和证据质量。
- 面向开发任务的推荐输出，包含推荐理由、适用条件、风险和来源。
- 部署在 Cloudflare Workers 上的标准轻量 MCP API，以及面向 agent 的结构化输出。
- 一组 golden queries，用于评估推荐质量。

MVP 不追求覆盖所有工具，也不追求全自动采集。早期宁可数据少但可信，也不要制造大量无法验证的工具卡片。MVP 不采集社区目录或新闻来源，不支持用户反馈闭环，不引入任何付费服务。

## v0.2 交付边界

v0.2 使用单个启用 Static Assets 的 Cloudflare Worker 承载 Web、数据 artifacts、HTTP API 和 MCP JSON-RPC endpoint。受控的 GitHub topic metadata 与 npm package metadata 可以作为 enabled sources，但必须与官方文档、精确 repository metadata 一样经过 validation、auto review、release admission 和 promotion gates，不能仅凭 topic、star 或 package 存在进入可靠推荐。

正常发布审核由脚本、规则、LLM eval、auto review 和 promotion check 生成证据，并持久化到 immutable reviewed bundle；唯一的常规人工发布确认位于 GitHub `production` environment gate。逐条 approval form 或 review record generator 不属于 v0.2，`Approval Record` 只保留为有证据的 break-glass override。高风险工具执行、破坏性操作和安全边界变化仍要求人工确认。

`all-v0.3.3` 是当前已验证 production baseline：53 张可靠 Tool Cards、真实 provider golden eval 24/24、critical safety 4/4 和部署后 MCP 4/4 smoke checks 均通过；GitHub Actions run `29136141415` 已生成 `production-release-evidence.json`，并绑定 production deployment `5400068926` 与 commit `6dcd9c5f`。

v0.3 聚焦 P1 数据与可信度和 P2 推荐安全与评测；v0.4 聚焦界面重构、GitHub OAuth、D1 投票、GitHub Issue Form 反馈和构建期反馈评级接入。更完整的 Provider 运行时配置 UI、浏览器读取 `provider_registry.json`，以及 direct-to-provider 与 proxy 模式决策移入 Backlog，不占用 v0.3 或 v0.4 交付范围。

## 成功指标

### 推荐准确率

对 golden queries 进行人工或脚本辅助评测，观察推荐结果是否真的适合任务。关键不是候选数量，而是前几个结果是否可用、解释是否合理。

### 工具覆盖数

覆盖数用于衡量生态广度，但必须按有效 Tool Card 统计。缺少来源、更新时间、分类或基本能力描述的记录不应计入核心覆盖。

### 数据新鲜度

跟踪工具卡片的更新时间、来源检查时间和失效链接比例。过期数据会直接降低推荐可信度。

### 评分解释质量

评分必须能回答“为什么推荐”“为什么不是第一名”“什么时候不该用”。解释质量可以通过人工抽检、用户反馈和评测样例衡量。

### Agent 决策可用率

衡量 coding agent 在查询 Agent Radar 后，是否能把结果转化为合理的下一步行动，例如选择工具、跳过不适用工具、请求用户确认或改用更低风险方案。

### 风险识别率

衡量系统是否能在推荐中暴露明显风险，例如维护停滞、文档缺失、权限过大、来源不明、安装路径不清晰或与任务不匹配。

## 决策原则

- 优先服务“根据需求选择合适 AI 工具”的主路径。
- 优先提高数据可信度和推荐解释质量，而不是单纯扩大采集规模。
- 所有评分都应能追溯到字段、规则或来源证据。
- 对不确定信息明确标注置信度，不用猜测填补关键字段。
- 早期避免平台化膨胀，不把账号、权限、市场、安装器作为核心能力。
- 产品输出应同时适合人类阅读和 agent 放入上下文使用。

## 维护规则

- 当产品定位变化时，先更新本文件，再更新需求和路线图。
- 新增核心场景时，必须说明目标用户、触发条件和成功标准。
- 新增非目标范围时，必须说明它为什么不服务当前主路径。
- 不要把实现细节写进本文件，除非实现选择会影响产品边界。
- 不要把“未来可能有用”的想法直接提升为产品目标。
