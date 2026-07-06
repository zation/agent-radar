# 08 采集与入库

## 文档用途

本文件定义数据采集、解析、去重、标准化和入库流程。它用于指导 crawler 和 normalizer 的实现。

## 应包含内容

- 定时任务策略：每日增量、每周全量、失败重试。
- 原始数据保存：raw snapshot 不直接覆盖。
- 解析流程：source-specific parser -> normalized record -> Tool Card。
- 去重规则：repo URL、包名、主页、名称相似度。
- 数据质量检查：必填字段、链接可访问性、时间戳、来源置信度。
- 失败处理：限流、网络错误、结构变化、解析失败。

## 后续生成提示词

```text
请为 Agent Radar 生成采集与入库文档。请描述 crawler、parser、normalizer、deduper、validator 的工作流程，包含定时策略、原始快照、增量更新、失败重试、去重规则、数据质量检查和日志要求。内容使用中文，并给出适合 GitHub Actions 低成本运行的实现建议。
```

## 维护规则

- 所有 parser 应尽量保留原始字段，避免不可逆丢失。
- 采集失败不应阻断全部 pipeline，除非核心来源全部不可用。
