# Agent Radar: Coding Agent 工作指令

本文件是给 Codex、Claude Code、Cursor、OpenCode 等 coding agent 的项目级操作说明。任何 agent 在本项目中工作前，都必须先阅读本文件和相关 `docs/` 文档。

## 项目定位

Agent Radar 是 AI Agent、Skill、MCP、CLI、Framework 和 Prompt/Rules 的评级与推荐系统。核心目标不是做新闻摘要，而是建立可被 AI 用于工具选择决策的结构化知识库。

## 默认工作流程

1. 先阅读与任务相关的文档。
2. 明确当前任务属于产品、架构、数据、采集、评分、推荐、评测、安全、部署中的哪一类。
3. 优先做最小可验证改动。
4. 修改后运行对应测试、静态检查或评测。
5. 输出变更摘要、验证结果和未解决风险。

## 必读文档

- 产品或范围变更：`docs/00-product-brief.md`、`docs/01-requirements.md`、`docs/15-roadmap.md`
- 架构或模块变更：`docs/03-system-architecture.md`
- 数据结构变更：`docs/04-data-model.md`、`docs/05-taxonomy.md`
- 评分变更：`docs/06-rating-rules.md`、`docs/10-evaluation-plan.md`
- 采集变更：`docs/07-source-registry.md`、`docs/08-crawler-and-ingestion.md`
- 推荐逻辑变更：`docs/09-recommendation-engine.md`、`docs/10-evaluation-plan.md`
- 安全相关变更：`docs/11-security-and-trust.md`
- 自迭代逻辑变更：`docs/13-agent-self-improvement.md`

## 文档职责与优先级

- `README.md` 和 `docs/00-14` 是产品、需求、架构及各领域当前实现事实的权威文档；技术事实应更新到对应领域文档，不依赖 Roadmap、Spec 或 Plan 反向定义。
- `docs/15-roadmap.md` 是当前开发阶段、优先级、里程碑和完成状态的唯一事实源。Roadmap 应链接相关 Spec 和 Plan，但不复制完整设计或实施步骤。
- `docs/superpowers/specs/**` 是单项变更的设计决策记录，回答“为什么做、做什么、不做什么”。Spec 获批后用于约束实现，完成后补充状态、实现提交和 Roadmap 链接并冻结。
- `docs/superpowers/plans/**` 是单项 Spec 的执行记录，回答“改哪些文件、按什么步骤实现、如何验证”。Plan 执行完成后补充状态和实现提交并冻结，不继续维护项目当前进度。
- 当文档冲突时，领域事实以 `README.md` 或对应 `docs/00-14` 为准，当前阶段和进度以 `docs/15-roadmap.md` 为准；已完成的 Spec/Plan 只作为决策与执行历史，不得覆盖当前事实。

每个 Spec 和 Plan 必须在开头声明：

- `状态`：`草稿`、`已批准`、`已完成` 或 `已取代`。
- `实现提交`：未完成时写“无”，完成后写实际 commit SHA。
- `当前状态来源`：指向 `docs/15-roadmap.md` 或对应领域权威文档。

功能完成时必须在同一变更中更新对应领域权威文档和 Roadmap。除修正错误的状态、提交号或链接外，已完成的 Spec/Plan 不再修改；后续迭代创建范围更小的新 Spec/Plan。

## 允许自动执行的动作

- 新增或更新文档草稿。
- 新增低风险采集源配置。
- 修复解析错误、字段映射错误、重复数据问题。
- 补充测试、评测样例和 golden queries。
- 优化低风险评分权重，并给出评测前后对比。
- 生成工具卡片草稿，但必须标注来源和置信度。

## 需要人类确认的动作

- 删除大量历史数据。
- 修改核心 schema 的字段语义。
- 大幅调整评分规则或权重。
- 自动信任未知来源工具。
- 引入新的付费服务、闭源依赖或长期运行基础设施。
- 执行可能泄露 token、私钥、邮件、文件系统或浏览器数据的操作。

## 输出要求

每次完成任务后，最终回复应包含：

- 修改了什么。
- 为什么这样改。
- 如何验证。
- 仍有哪些风险或后续事项。

## 后续生成提示词

当需要生成或重写本文件时，使用：

```text
请基于 Agent Radar 当前产品目标、系统架构和安全边界，生成一份面向 coding agent 的项目级工作指令。要求说明项目定位、必读文档、默认工作流程、允许自动执行的动作、需要人类确认的动作、验证要求和最终输出格式。内容使用中文，语气清晰、具体、可执行。
```
