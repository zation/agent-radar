# 05 分类体系

## 文档用途

本文件定义 Agent Radar 如何给工具分类。分类体系用于筛选、评分、推荐、风险解释和 AI 可读输出。

分类不是为了穷尽世界，而是为了帮助用户和 coding agent 判断：这个工具是什么、适合什么任务、如何接入、风险多高、证据是否可信。

## 分类原则

- 一个工具只能有一个主类型，但可以有多个次类型和标签。
- 分类必须服务推荐和解释，不为了展示而无限扩张。
- 不确定分类要记录置信度和依据。
- 同一字段的枚举应与 `docs/04-data-model.md` 保持一致。
- 安全相关分类应与 `docs/11-security-and-trust.md` 对齐。

## 维度总览

| 维度 | 字段 | 用途 |
| --- | --- | --- |
| 工具类型 | `type`、`secondary_types` | 判断评分规则和接入方式 |
| 使用目的 | `tags`、`primary_purpose` | 任务匹配和检索 |
| 使用方式 | `usage_mode` | 判断集成成本 |
| 来源可信度 | `security.trust_level` | 风险和证据权重 |
| 权限风险 | `permissions`、`security.risk_level` | 安全过滤 |
| 成熟度 | `maturity`、`maintenance.status` | 推荐排序 |
| 适用 agent | `supported_agents` | agent 决策 |

## 工具类型分类

### `mcp`

定义：通过 Model Context Protocol 暴露工具、资源或 prompts 的 server 或工具集合。

判断标准：

- 明确提供 MCP server。
- 文档说明可被支持 MCP 的 client 连接。
- 主要价值是把外部能力暴露给 agent。

示例：

- 文件系统 MCP server。
- GitHub MCP server。
- 数据库查询 MCP server。

边界情况：

- 一个 CLI 同时启动 MCP server，主类型按主要使用方式判断；如果主要用于 MCP，主类型为 `mcp`，次类型为 `cli`。

### `skill`

定义：面向 coding agent 的可复用指令、工作流、参考文件或能力包。

判断标准：

- 主要由自然语言规则、步骤、模板或资源构成。
- 通过 agent 的 skill/plugin 机制触发。
- 不一定包含可执行代码。

示例：

- OpenAI API 文档查询 skill。
- 前端应用构建 skill。
- 数据分析报告 skill。

边界情况：

- 如果项目主要是 prompt 模板且没有工作流边界，主类型应为 `prompt`。

### `agent`

定义：可独立执行任务、规划步骤并调用工具的 agent 产品或项目。

判断标准：

- 具备任务执行循环或 autonomous/semi-autonomous 行为。
- 可接受目标并产出多步行动。
- 通常包含工具调用、状态或记忆。

示例：

- 开源 coding agent。
- 研究 agent。
- 浏览器自动化 agent。

边界情况：

- 框架本身不直接执行任务，而是用来构建 agent，应归为 `framework`。

### `framework`

定义：用于构建 agent、workflow、tool calling 或 AI 应用的开发框架。

判断标准：

- 提供 SDK、抽象、运行时或编排能力。
- 用户需要写代码集成。
- 主要服务开发者构建系统。

示例：

- Agent 框架。
- Workflow orchestration framework。
- Tool calling SDK。

边界情况：

- 如果项目同时有托管服务和 SDK，按用户主要入口选择主类型，另加 `service` 或 `sdk` 标签。

### `cli`

定义：通过命令行使用的工具，可由人类或 agent 调用。

判断标准：

- 主要入口是 shell 命令。
- 支持脚本化或项目内自动化。

示例：

- Coding CLI agent。
- 文档生成 CLI。
- 数据转换 CLI。

边界情况：

- CLI 只是安装 wrapper，而主要能力是 MCP server 时，主类型不应是 `cli`。

### `prompt`

定义：可复用 prompt 模板、系统提示词或任务提示。

判断标准：

- 主要内容是模型输入文本。
- 不包含完整 agent 工作流或工具适配。

示例：

- 代码审查 prompt。
- 产品需求分析 prompt。
- 测试生成 prompt。

### `rules`

定义：项目级或工具级 agent 行为规则、policy 或约束文件。

判断标准：

- 主要用于约束 agent 行为。
- 常见形式包括 `AGENTS.md`、`.cursorrules`、`CLAUDE.md` 等。

示例：

- 项目编码规范。
- 安全审批规则。
- 测试和提交要求。

### `dataset`

定义：用于工具发现、评分、推荐或评测的数据集。

判断标准：

- 主要价值是数据，而不是可执行能力。

### `service`

定义：托管服务或 SaaS，提供 API、控制台或云端能力。

判断标准：

- 主要能力运行在第三方服务中。
- 通常需要账号、API key 或付费计划。

## 使用目的分类

使用目的写入 `primary_purpose` 和 `tags`。一个工具可以有多个目的标签，但应选择一个最主要目的。

| 标签 | 定义 | 示例任务 |
| --- | --- | --- |
| `coding` | 代码生成、修改、审查、重构 | 修复 bug、生成测试 |
| `testing` | 测试生成、运行、覆盖率分析 | 补单元测试 |
| `browser_automation` | 控制浏览器、抓取页面、端到端测试 | 访问网页并截图 |
| `data_analysis` | 表格、SQL、Notebook、分析报告 | 分析 CSV |
| `documents` | Word、PDF、文档处理 | 生成合同草案 |
| `presentations` | Slides、PPT、演示材料 | 生成路演 deck |
| `design` | UI、Figma、视觉生成 | 从截图还原页面 |
| `search` | Web 搜索、知识检索、RAG | 查找资料 |
| `database` | 数据库查询、迁移、管理 | 查询 Postgres |
| `cloud` | 云资源、部署、IaC | 部署到 Workers |
| `communication` | 邮件、Slack、IM | 总结消息 |
| `security` | 漏洞、权限、secret 检查 | 检查依赖风险 |
| `finance` | 财务数据、投资研究 | 分析财报 |
| `research` | 资料整理、行业研究 | 公司研究 |
| `media` | 图片、音频、视频生成或处理 | 生成视频 |
| `workflow` | 多步骤自动化或任务编排 | 定期报告 |

新增目的标签要求：

- 明确触发任务。
- 至少 3 个候选工具或说明为什么是战略性新类目。
- 更新推荐和评测样例。

## 使用方式分类

字段建议：`usage_mode`。

| 值 | 定义 | 评分影响 |
| --- | --- | --- |
| `local` | 本地运行 | 权限可控，但安装成本可能更高 |
| `hosted` | 第三方托管 | 安装简单，但涉及数据外传和账号 |
| `api` | 通过 API 使用 | 需要密钥和网络 |
| `cli` | 命令行调用 | 适合自动化，需检查 shell 风险 |
| `mcp_server` | 通过 MCP 连接 | 适合 agent 工具调用，需建模权限 |
| `sdk` | 代码库集成 | 灵活但开发成本更高 |
| `prompt_pack` | prompt 包 | 集成成本低，可靠性依赖上下文 |
| `workflow` | 预定义流程 | 适合重复任务，需检查边界 |

## 来源可信度分类

字段：`security.trust_level`。

| 值 | 定义 | 判断标准 |
| --- | --- | --- |
| `official` | 官方来源 | 厂商、项目所有者或协议官方维护 |
| `well_known_org` | 知名组织 | 有公开信誉、维护记录和团队背景 |
| `active_open_source` | 活跃开源 | 社区活跃、issue/release 正常 |
| `individual` | 个人项目 | 个人维护，可信度取决于证据 |
| `commercial` | 商业服务 | 公司维护，但需评估锁定和数据风险 |
| `unknown` | 未知 | 来源不清或证据不足 |

信任等级不是质量评分，只影响证据权重和风险解释。

## 权限风险分类

字段：`permissions` 和 `security.risk_level`。

### 权限 scope

- `filesystem`
- `network`
- `browser`
- `email`
- `database`
- `cloud`
- `payment`
- `shell`
- `code_execution`
- `secrets`
- `unknown`

### access

- `read`
- `write`
- `read_write`
- `execute`
- `admin`
- `unknown`

### 风险等级

| 等级 | 定义 | 示例 |
| --- | --- | --- |
| `low` | 权限有限，影响范围小 | 读取公开文档 |
| `medium` | 需要本地或账号权限，但可限制范围 | 读项目文件、调用 API |
| `high` | 可能修改重要数据或访问敏感账户 | 写数据库、读邮件、shell 执行 |
| `critical` | 可能导致资金、云资源、secret 或大规模数据风险 | 支付操作、云 admin、自动执行未知代码 |
| `unknown` | 无法判断 | 权限描述缺失 |

## 成熟度分类

字段：`maturity` 和 `maintenance.status`。

### maturity

| 值 | 定义 |
| --- | --- |
| `experimental` | 实验性，API 或行为不稳定 |
| `beta` | 可用但仍在快速变化 |
| `stable` | 文档、release 和使用方式稳定 |
| `deprecated` | 已弃用或建议迁移 |
| `unknown` | 无法判断 |

### maintenance.status

| 值 | 定义 |
| --- | --- |
| `active` | 近期有 release、commit、issue 处理或文档更新 |
| `slow` | 维护较慢但未停止 |
| `inactive` | 长期无维护信号 |
| `deprecated` | 明确停止维护 |
| `unknown` | 无法判断 |

## 适用 agent 分类

字段：`supported_agents`。

建议枚举：

- `codex`
- `claude-code`
- `cursor`
- `opencode`
- `gemini-cli`
- `generic-mcp-client`
- `generic-cli-agent`
- `unknown`

判断标准：

- 官方文档明确支持。
- 社区示例可验证。
- 仅理论兼容时标记 `generic-*`，不要标记具体 agent。

## 主标签与多标签规则

### 主类型选择

按用户主要使用入口判断：

1. 是否通过 MCP 调用。
2. 是否作为 agent skill/rules 使用。
3. 是否独立作为 agent 执行任务。
4. 是否作为框架/SDK 构建系统。
5. 是否主要通过 CLI 使用。
6. 是否只是 prompt 或规则文本。

### 多标签规则

- 标签应反映可检索任务，不反映营销形容词。
- 同义标签应归一，例如 `web_automation` 归并到 `browser_automation`。
- 模糊标签应避免，例如 `productivity`、`ai`、`tool`。

## 分类冲突处理

| 冲突 | 处理 |
| --- | --- |
| 来源 A 说是 framework，来源 B 说是 agent | 按用户主要入口判断，并记录次类型 |
| 工具同时支持本地和托管 | `usage_mode` 可多值，风险按最高敏感路径提示 |
| 权限描述缺失 | `risk_level` 至少为 `unknown`，不进入低风险推荐 |
| 支持 agent 未证实 | 使用 `generic-*` 或 `unknown` |

## 示例分类

### 文件系统 MCP

```yaml
type: mcp
secondary_types: [cli]
primary_purpose: local_file_access
tags: [filesystem, local, mcp_server, coding]
usage_mode: [mcp_server, local]
permissions:
  - scope: filesystem
    access: read_write
maturity: stable
```

### 前端构建 Skill

```yaml
type: skill
primary_purpose: frontend_app_building
tags: [coding, design, workflow]
usage_mode: [workflow, prompt_pack]
permissions: []
maturity: stable
```

### Agent 框架

```yaml
type: framework
secondary_types: [sdk]
primary_purpose: agent_development
tags: [coding, workflow, tool_calling]
usage_mode: [sdk]
permissions:
  - scope: code_execution
    access: execute
maturity: beta
```

## 与评分和推荐的关系

- `type` 决定评分权重。
- `tags` 和 `primary_purpose` 决定任务召回。
- `usage_mode` 影响集成成本。
- `permissions` 和 `risk_level` 决定安全过滤。
- `trust_level` 影响证据质量。
- `maturity` 和 `maintenance.status` 影响推荐排序。

## 维护规则

- 分类要服务推荐，不要为了完整而无限扩张。
- 新增分类必须提供至少 3 个示例或明确说明为什么暂时没有示例。
- 修改枚举必须同步更新数据模型、评分规则、推荐引擎和评测计划。
