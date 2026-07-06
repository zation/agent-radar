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

- 产品或范围变更：`docs/00-product-brief.md`、`docs/01-requirements.md`、`docs/14-roadmap.md`
- 架构或模块变更：`docs/03-system-architecture.md`
- 数据结构变更：`docs/04-data-model.md`、`docs/05-taxonomy.md`
- 评分变更：`docs/06-rating-rules.md`、`docs/10-evaluation-plan.md`
- 采集变更：`docs/07-source-registry.md`、`docs/08-crawler-and-ingestion.md`
- 推荐逻辑变更：`docs/09-recommendation-engine.md`、`docs/10-evaluation-plan.md`
- 安全相关变更：`docs/11-security-and-trust.md`
- 自迭代逻辑变更：`docs/13-agent-self-improvement.md`

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
