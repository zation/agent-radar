# 07 采集源注册表

## 文档用途

本文件记录 Agent Radar 的数据来源、采集方式、可信度、频率和限制。它用于管理来源扩展和数据质量。

## 应包含内容

- 官方来源：MCP registry、厂商文档、官方 GitHub 组织。
- 社区来源：awesome list、GitHub topics、Hacker News、Product Hunt、社区目录。
- 包管理来源：npm、PyPI、Docker Hub、GitHub Releases。
- 来源字段：名称、URL、类型、采集方式、频率、速率限制、可信度、解析策略。
- 来源优先级和冲突解决规则。

## 后续生成提示词

```text
请为 Agent Radar 生成采集源注册表文档。请列出适合发现 AI Agent、Skill、MCP Server、CLI、Framework、Prompt/Rules 的公开来源，并为每个来源说明采集方式、更新频率、可信度、字段可得性、限制、风险和解析策略。内容使用中文，优先考虑低成本、合法、稳定的数据来源。
```

## 维护规则

- 新增来源必须说明用途、可信度和速率限制。
- 不采集需要绕过登录、付费墙或违反服务条款的数据。
