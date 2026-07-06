# 04 数据模型

## 文档用途

本文件定义 Agent Radar 的核心数据结构，尤其是 Tool Card、来源记录、评分结果和推荐结果。它是采集、评分、搜索和推荐的共同契约。

## 应包含内容

- Raw Source Snapshot：原始来源数据。
- Source Record：来源级元数据。
- Tool Card：标准化工具卡片。
- Rating Result：评分结果和解释。
- Recommendation Result：按任务推荐的候选工具。
- 字段约束：必填、可选、枚举、置信度、时间戳。
- Schema 迁移规则。

## Tool Card 草案字段

```yaml
id:
name:
type: mcp | skill | agent | framework | cli | prompt | rules | dataset | service
summary:
source_urls:
repo_url:
homepage_url:
license:
primary_purpose:
use_cases:
not_for:
supported_agents:
install_methods:
auth_required:
permissions:
maintenance:
security:
rating:
ai_decision_notes:
last_checked_at:
confidence:
```

## 后续生成提示词

```text
请为 Agent Radar 生成完整数据模型文档。重点定义 Tool Card、Source Record、Raw Snapshot、Rating Result、Recommendation Result 和 Eval Case。每个字段都要说明含义、类型、是否必填、示例、生成方式和质量要求。请特别关注 AI 友好性，让 coding agent 能直接基于这些字段做工具选择。内容使用中文。
```

## 维护规则

- 修改字段语义必须同步更新采集、评分、推荐和评测文档。
- 删除字段前必须提供迁移策略。
