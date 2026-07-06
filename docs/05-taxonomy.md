# 05 分类体系

## 文档用途

本文件定义 Agent Radar 如何给工具分类。分类体系用于筛选、评分、推荐和生成 AI 可读解释。

## 应包含内容

- 按工具类型分类：MCP、Skill、Agent、Framework、CLI、Prompt/Rules、Hosted Service。
- 按使用目的分类：coding、browser automation、data analysis、docs、design、search、database、cloud、communication、security、finance、research。
- 按使用方式分类：local、hosted、API、CLI、MCP server、SDK、prompt pack、workflow。
- 按来源可信度分类：official、well-known org、active open source、individual、commercial、unknown。
- 按风险分类：low、medium、high、critical。
- 多标签和主标签规则。

## 后续生成提示词

```text
请为 Agent Radar 生成分类体系文档。请设计 AI Agent、Skill、MCP Server、CLI、Framework、Prompt/Rules 等工具的多维分类体系，包括工具类型、使用目的、使用方式、来源可信度、权限风险、成熟度和适用 agent。每个分类都要包含定义、判断标准、示例和边界情况。内容使用中文。
```

## 维护规则

- 分类要服务推荐，不要为了完整而无限扩张。
- 新增分类必须提供至少 3 个示例或明确说明为什么暂时没有示例。
