# 01 需求文档

## 文档用途

本文件记录 Agent Radar 的功能需求、非功能需求、MVP 范围和延期范围。它用于指导开发计划、验收标准和后续路线图。

Agent Radar 的需求判断应回到 `docs/00-product-brief.md`：系统的核心价值是帮助人类开发者和 coding agent 基于结构化证据选择 AI Agent、Skill、MCP Server、CLI、Framework 和 Prompt/Rules。

## 需求原则

- 需求必须服务“根据开发任务推荐合适 AI 工具”的主路径。
- MVP 优先保证数据可信、字段清晰、评分可解释，而不是追求覆盖数量。
- 每个功能都要有机器可读输出，不能只服务人类浏览。
- 推荐结果必须能说明来源、理由、风险和不确定性。
- 高风险动作只给建议，不自动安装、不自动授权、不绕过人类审批。
- MVP 技术栈固定为 TypeScript、JSON + Cloudflare D1 SQLite、Cloudflare Pages 和 Cloudflare Workers 免费额度。

## 角色与目标

### 人类开发者

目标：输入一个开发需求，快速获得可用工具候选、推荐理由、风险提示和替代方案。

验收标准：

- 能用自然语言描述任务并得到候选工具列表。
- 每个候选包含适用原因、不适用条件、安装或接入方式、来源链接和置信度。
- 当没有可靠工具时，系统返回“暂无可靠推荐”，而不是强行推荐。

### Coding agent

目标：在执行任务前查询 Agent Radar，获取可放入上下文的结构化建议，并据此选择工具或请求用户确认。

验收标准：

- 支持 JSON 或 MCP 查询输出。
- 输出包含推荐等级、风险等级、权限提示、证据字段和下一步建议。
- 对高风险工具明确要求人类确认。

### 项目维护者

目标：维护采集源、工具卡片、评分规则、评测样例和发布流程。

验收标准：

- 能新增低风险公开来源并记录来源可信度、采集方式和限制。
- 能审查工具卡片的字段完整性、来源质量和评分解释。
- 能运行评测，对评分或推荐变化进行前后对比。

### 工具维护者

目标：让工具被准确收录、分类和解释。

验收标准：

- 工具卡片可标注官方来源、仓库、文档、许可、安装方式和适用场景。
- 对争议字段可以通过来源证据修正。
- 不把作者宣传语直接当作评分结论。

## 功能需求

### FR-01 来源注册与管理

系统应维护可采集来源注册表，用于记录官方 registry、官方 GitHub 组织、官方文档站、包管理源和人工审核来源。社区目录、awesome list 和新闻来源不进入 MVP 自动采集范围。

验收标准：

- 每个来源包含名称、URL、来源类型、工具类型覆盖、采集方式、建议频率、可信度、速率限制和使用限制。
- 新增来源必须说明用途、预期字段、合法性边界和失败处理。
- MVP 仅启用官方或人工审核来源；不采集社区目录、新闻、需要绕过登录、付费墙、验证码或服务条款限制的数据。

### FR-02 原始快照保存

系统应保存来源原始数据快照，避免解析逻辑变化导致不可回放。

验收标准：

- 每次采集生成不可变 `Raw Source Snapshot`，包含来源 ID、采集时间、请求元数据、原始内容引用和内容哈希。
- 解析失败时仍保留快照和错误信息。
- 支持基于同一快照重新运行 parser 和 normalizer。

### FR-03 标准化 Tool Card

系统应把不同来源的工具信息标准化为 Tool Card。

验收标准：

- Tool Card 至少包含 `id`、`name`、`type`、`summary`、`source_urls`、`use_cases`、`not_for`、`install_methods`、`permissions`、`maintenance`、`security`、`last_checked_at`、`confidence`。
- 字段来源和置信度可追溯到 Source Record 或人工审核记录。
- 缺少关键字段时不能进入“可靠推荐”结果，只能作为低置信候选或待补全记录。

### FR-04 分类体系

系统应支持多维分类，包括工具类型、使用目的、使用方式、来源可信度、权限风险、成熟度和适用 agent。

验收标准：

- 一个工具可以有一个主类型和多个标签。
- 分类必须能用于筛选、评分和推荐解释。
- 分类冲突时记录判断依据和置信度。

### FR-05 评分系统

系统应根据统一规则和类型专属规则生成可解释评分。

验收标准：

- 每个评分包含总分、分项分、推荐等级、风险等级、解释、证据字段和规则版本。
- 不同工具类型支持不同权重，例如 MCP 更重视权限范围和工具描述质量，Skill 更重视触发条件和边界说明。
- 评分变化可通过评测集回归检查。

### FR-06 搜索与筛选

系统应支持按名称、类型、标签、任务、生态、权限、维护状态、来源可信度和风险等级检索工具。

验收标准：

- 支持关键词检索和结构化过滤。
- 检索结果显示匹配字段、基础评分、风险提示和更新时间。
- 搜索结果不应默认按热度排序，应综合任务匹配和可信度。

### FR-07 推荐引擎

系统应根据用户任务和上下文推荐工具。

验收标准：

- 输入支持自然语言任务、技术栈、运行环境、允许权限、风险偏好、已有工具和输出格式。
- 输出包含 Top N 候选、推荐等级、推荐理由、风险、替代方案、反推荐理由和来源证据。
- 当候选证据不足或风险超过偏好时，返回保守建议。

### FR-08 AI 友好输出

系统应提供适合 coding agent 使用的结构化输出。

验收标准：

- 支持 JSON 输出和 Markdown 摘要。
- JSON 字段稳定，适合被 agent 放入上下文或后续工具调用。
- 输出包含 `recommended_action`，例如 `use`、`compare`、`ask_human`、`avoid`、`no_reliable_match`。

### FR-09 MCP 查询接口

MVP 应在 Cloudflare Workers 上提供标准轻量 MCP API，供 coding agent 查询工具卡片和推荐结果。

验收标准：

- 至少支持 `search_tools`、`get_tool_card`、`recommend_tools`、`explain_rating`。
- 接口只读，读取 Cloudflare D1 和静态 JSON artifacts，不执行第三方工具安装或授权。
- 错误返回包含可读原因和可恢复建议。

### FR-10 Web UI

系统应提供基础 Web UI，服务人工浏览、比较和审核。

验收标准：

- 支持工具列表、详情页、筛选、比较和推荐结果展示。
- 工具详情页显示来源、更新时间、评分解释和风险说明。
- UI 不隐藏低置信或高风险原因。

### FR-11 评测系统

系统应维护 golden queries、数据质量检查、评分回归和推荐解释质量评测。

验收标准：

- 修改评分或推荐逻辑后能输出 eval diff。
- 评测失败必须说明影响范围，不能只修改 expected result。
- 至少覆盖常见开发任务、无可靠工具任务、高风险权限任务和同类工具比较任务。

### FR-12 报告生成

系统可基于结构化数据生成生态报告，但报告是推荐系统的副产品。

验收标准：

- 报告必须引用 Tool Card、评分结果和来源记录。
- 不把新闻摘要作为 MVP 主路径。
- 报告应明确样本范围、更新时间和局限性。

### FR-13 人工审核与修正

系统应支持人工修正关键字段、评分例外和误判样例。

验收标准：

- 人工修正记录包含修改人、时间、原因、来源证据和影响字段。
- 人工修正不覆盖原始快照，只作为标准化层或评分层覆盖。
- 关键 schema 语义变化必须同步更新数据模型、采集、评分、推荐和评测文档。

## 非功能需求

### NFR-01 可维护性

模块边界应清晰，数据 schema、评分规则、来源 parser 和推荐策略可独立演进。

验收标准：新增低风险来源时不需要修改评分核心；新增评分维度时能通过规则版本追踪影响。

### NFR-02 可解释性

所有推荐和评分必须可解释。

验收标准：任一推荐结果都能追溯到任务匹配字段、评分分项、风险字段和来源证据。

### NFR-03 数据新鲜度

系统应记录来源检查时间和数据更新时间。

验收标准：工具卡片显示 `last_checked_at`；超过新鲜度阈值时降低置信度或提示过期。

### NFR-04 成本控制

MVP 应使用 TypeScript、JSON 文件、Cloudflare D1 SQLite、Cloudflare Pages 和 Cloudflare Workers 免费额度。

验收标准：在无付费基础设施的情况下可以手动触发数据更新、运行评测、写入 D1、发布静态 JSON artifacts 和公开站点。

### NFR-05 性能

MVP 查询性能应满足交互式使用。

验收标准：本地或静态索引下，常见搜索和推荐查询在小规模数据集内可在 1 秒级返回；大规模优化延后。

### NFR-06 安全与隐私

系统只采集公开来源，不处理用户私密代码、邮件或浏览器数据。Recommend 的 BYOK API key 只用于当前 LLM provider 请求，不进入 artifacts、eval report 或持久化存储。

验收标准：采集流程不要求用户提交 secret；推荐流程如使用 BYOK secret，必须只在当前请求内使用并脱敏日志；高风险工具推荐必须提示权限边界和人工确认。

### NFR-07 可回放与可回滚

数据生成、评分和推荐应可回放。

验收标准：每次发布记录数据版本、规则版本、索引版本和评测结果；发现问题可回滚到上一版本。

## MVP 范围

MVP 必须实现：

- 完整文档体系。
- 最小 Tool Card schema。
- 初始分类体系。
- MCP、Skill 和 Agent 三类首批工具范围。
- 少量高质量官方或人工审核来源注册。
- 手动触发、可人工复核的采集与标准化流程。
- JSON 数据集、Cloudflare D1 SQLite 存储和基础搜索。
- `rating_rules.v0.1-draft` 基础评分规则和解释模板。
- 面向开发任务的推荐输出。
- 部署在 Cloudflare Workers 上的标准轻量 MCP API。
- 部署在 Cloudflare Pages 上的公开站点。
- Golden queries 和推荐质量评测。

MVP 使用人工补全和手动触发更新，不做自动定时采集。

当前可靠发布路径仍是人工 seed：`npm run pipeline` 从 `src/data/seed-tool-cards.ts` 读取 Tool Cards 并生成 artifacts。`npm run ingest` 已提供 v0.2 最小采集草稿链路，可读取 enabled Source Registry、保存 Raw Snapshot、输出 Source Records，并生成 Tool Card drafts、最小 normalizer/deduper、人工 override artifact、approval/review/release admission、promotion candidates 和 promotion plan；但这些采集产物尚未自动进入可靠推荐发布数据。

## 延期范围

以下能力不进入 MVP：

- 复杂账号系统和多租户权限。
- 在线安装市场或一键执行第三方工具。
- 企业采购、审批流和细粒度组织治理。
- 大规模实时爬虫和全网监控。
- 高级可视化大屏。
- 对第三方工具进行完整安全审计。
- 闭源付费数据源依赖。
- 任何付费服务或超出免费额度的长期运行基础设施。
- 社区目录、awesome list 和新闻来源自动采集。
- 用户反馈闭环。

## 不应做的内容

- 不把热度榜单直接当作推荐系统。
- 不为提高覆盖数自动信任未知来源。
- 不自动安装或运行高风险工具。
- 不用猜测补齐关键字段。
- 不把新闻摘要、趋势文章或营销文案当作核心产品。

## 需求验收总表

| 编号 | 能力 | 当前状态 | 主要输入 | 主要输出 | 验收方式 |
| --- | --- | --- | --- | --- | --- |
| FR-01 | 来源注册 | v0.2 草稿链路已可执行，发布 artifact 未接入 | 来源 URL 与元数据 | Source Registry | 字段检查、人工审核 |
| FR-02 | 原始快照 | v0.2 草稿链路已实现本地写入 | 来源响应 | Raw Snapshot | 哈希、时间戳、可回放 |
| FR-03 | Tool Card | MVP 小样本已实现 | Source Record/人工种子数据 | 标准化卡片 | schema 校验、抽样审核 |
| FR-04 | 分类 | MVP 标签体系已用于 Tool Cards | Tool Card 字段 | 多维标签 | 分类规则测试 |
| FR-05 | 评分 | `rating_rules.v0.1-draft` 已实现 | Tool Card、规则版本 | Rating Result | 单元测试、eval diff |
| FR-06 | 搜索 | 已实现基础搜索/API/UI | 查询词、过滤器 | 搜索结果 | golden search cases |
| FR-07 | 推荐 | BYOK LLM-backed 推荐已通过 MVP golden eval baseline | 任务上下文、API key、model | Recommendation Result | golden queries |
| FR-08 | AI 输出 | JSON schema 已实现，Markdown 摘要未系统化 | 推荐结果 | JSON/Markdown | schema 校验 |
| FR-09 | MCP 查询 | HTTP JSON API 已实现，完整 MCP 包装未完成 | MCP/API tool call | 查询响应 | 接口测试 |
| FR-10 | Web UI | Tools/Recommend 主路径已实现 | 数据索引、用户任务 | 浏览、比较、推荐页面 | 手工验收 + Pages build |
| FR-11 | 评测 | Node test + blocked/real LLM eval 框架已实现 | 数据、评分、LLM provider | Eval Report | CI/本地运行 |
| FR-12 | 报告 | Eval report 已实现，生态报告未实现 | 结构化数据 | Markdown 报告 | 来源引用检查 |
| FR-13 | 人工修正 | 未实现 | 修正请求 | Override Record | 审计记录检查 |

## 当前实现备注

- 推荐能力不再维护本地关键词召回/排序引擎。`recommend_tools` 使用 BYOK LLM provider 生成推荐，本地代码负责 provider routing、prompt 上下文、schema 归一化、已知工具 ID 校验和高风险动作保护。
- 当前支持 OpenAI、MiniMax 和 DeepSeek 的 OpenAI-compatible Chat Completions 路由。
- 本地开发时 Vite dev server 已挂载 `/api/*`，与 Workers API 使用同一套 handler。
- `npm run ingest` 已落地最小采集草稿链路；当前发布数据仍来自人工维护的 `seedToolCards`，采集产物进入 Tool Card 草稿和人工审核队列是 v0.2 后续工作。
- 没有 `AGENT_RADAR_LLM_API_KEY` 时，推荐 eval 输出 blocked summary；这不是推荐质量通过，只表示缺少真实 provider 运行条件。
- MVP baseline 已用真实 provider key 跑通过 golden query 验证；后续风险转为数据覆盖、采集接入和 provider 错误分层。

## 维护规则

- 新增需求必须说明目标用户、触发场景和验收方式。
- 不要把“未来可能有用”的想法直接塞入 MVP。
- 涉及 schema、评分、推荐或安全边界的需求变更，必须同步更新相关文档。
- 需求文档和路线图冲突时，先回到产品简报确认范围，再调整路线图。
