# 06 评分规则

## 文档用途

本文件定义 Agent Radar 如何给不同类型工具评分。评分结果必须可解释、可复现、可回归测试，并能帮助人类和 AI 做工具选择。

评分不是“谁更热门”，而是“在给定任务和风险约束下，哪个工具更值得被推荐”。

## 评分原则

- 评分必须引用 Tool Card 字段、来源证据或明确规则。
- 总分只用于排序辅助，推荐解释比数字更重要。
- 高风险工具即使能力强，也必须在推荐中暴露风险。
- 证据不足时不能给高置信高分。
- 不同工具类型使用不同权重。
- 修改评分规则必须同步更新评测集。

## 评分输出

评分输出为 `Rating Result`，见 `docs/04-data-model.md`。

核心字段：

- `overall_score`：0-100。
- `dimension_scores`：分项分。
- `recommendation_level`：推荐等级。
- `risk_level`：风险等级。
- `explanations`：每个关键维度的解释。
- `evidence_quality`：证据质量。
- `rules_version`：评分规则版本。

## 通用维度

| 维度 | 默认权重 | 定义 |
| --- | ---: | --- |
| `task_fit` | 25 | 工具能力与目标任务的匹配度 |
| `evidence_quality` | 15 | 来源可靠性、字段完整性、可追溯性 |
| `documentation_quality` | 15 | 安装、示例、限制、权限说明是否清晰 |
| `maintenance_health` | 15 | 维护活跃度、release、issue 和弃用状态 |
| `integration_cost` | 10 | 安装、认证、运行环境和接入复杂度 |
| `security_posture` | 15 | 权限范围、供应链风险、数据外传风险 |
| `community_signal` | 5 | 社区使用、star、引用、讨论活跃度 |

默认权重可被类型专属规则覆盖，但总和应为 100。

## 分数含义

| 分数区间 | 含义 |
| --- | --- |
| 90-100 | 强匹配，证据充分，风险可控 |
| 75-89 | 推荐或优先考虑，但需说明限制 |
| 60-74 | 可作为备选，适合特定场景 |
| 40-59 | 弱推荐，仅在缺少替代时考虑 |
| 0-39 | 不建议推荐或证据不足 |

## 推荐等级

| 等级 | 条件 |
| --- | --- |
| `recommended` | 总分 >= 75，风险不超过任务偏好，证据至少 medium |
| `consider` | 总分 >= 60，存在明确限制或替代方案 |
| `situational` | 只适合特定环境、agent 或权限条件 |
| `avoid` | 风险过高、维护停滞、任务不匹配或安全问题明显 |
| `insufficient_evidence` | 关键字段或来源不足 |

## 通用扣分项

| 扣分项 | 建议扣分 | 说明 |
| --- | ---: | --- |
| 缺少安装方式 | -8 | agent 难以执行下一步 |
| 缺少文档 | -10 | 无法验证用法 |
| 来源不明 | -15 | 降低证据质量 |
| 维护停滞 | -10 到 -25 | 按停滞程度 |
| 权限描述缺失 | -12 | 安全风险未知 |
| 需要高权限但无解释 | -20 | 不应首选推荐 |
| 许可证不明 | -5 | 企业或复用风险 |
| 与任务类型不匹配 | -20 到 -50 | 推荐核心失败 |

## 通用加分项

| 加分项 | 建议加分 | 说明 |
| --- | ---: | --- |
| 官方来源 | +8 | 证据强 |
| 文档包含最小示例 | +5 | 降低集成成本 |
| 权限边界清楚 | +6 | 安全可解释 |
| 支持常见 agent | +5 | agent 决策更直接 |
| 有活跃 release | +5 | 维护信号 |
| 多来源一致 | +5 | 提升置信度 |

加分不应让高风险、低证据工具越过安全阈值。

## 类型专属规则

### MCP 工具

权重：

| 维度 | 权重 |
| --- | ---: |
| `task_fit` | 22 |
| `mcp_tool_description_quality` | 15 |
| `permission_scope` | 18 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `integration_cost` | 8 |
| `evidence_quality` | 10 |
| `community_signal` | 3 |

专属评分项：

- 工具描述是否清楚，是否有参数 schema。
- MCP client 兼容性是否明确。
- 权限是否可最小化，例如目录 allowlist、只读模式。
- 是否需要 OAuth、API key 或本地 secret。
- 是否有供应链风险，例如未知安装脚本。

高风险条件：

- 需要 shell、浏览器、邮件、云 admin、数据库写入或 payment 权限。
- 未说明权限边界。
- 远程 server 处理敏感数据但无隐私说明。

解释模板：

```text
该 MCP 适合 {task}，因为它提供 {capability}。主要风险是 {permission_scope}，建议在 {safe_default} 下使用。证据来自 {source}.
```

### Skill

权重：

| 维度 | 权重 |
| --- | ---: |
| `trigger_clarity` | 18 |
| `instruction_quality` | 20 |
| `task_fit` | 20 |
| `boundary_clarity` | 12 |
| `portability` | 10 |
| `evidence_quality` | 10 |
| `maintenance_health` | 5 |
| `security_posture` | 5 |

专属评分项：

- 触发条件是否明确。
- 步骤是否可执行。
- 是否包含必要参考文件。
- 是否说明边界、失败处理和安全限制。
- 是否依赖特定平台。

扣分项：

- 只是一段泛泛 prompt，没有具体流程。
- 指令要求绕过安全审批。
- 引用资源缺失。

解释模板：

```text
该 Skill 适合 {task}，因为触发条件和执行步骤清晰。限制是 {boundary}，在 {agent_context} 中使用前应确认 {requirement}.
```

### Agent

权重：

| 维度 | 权重 |
| --- | ---: |
| `task_fit` | 20 |
| `autonomy_control` | 15 |
| `tooling_ecosystem` | 12 |
| `state_and_memory_safety` | 10 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `integration_cost` | 8 |
| `security_posture` | 8 |
| `community_signal` | 3 |

专属评分项：

- 自主执行边界是否可控。
- 是否支持审批、人类确认和日志。
- 工具调用生态是否成熟。
- 状态、记忆和 secret 处理是否清楚。
- 是否适合 coding、research、browser 等具体任务。

高风险条件：

- 默认全自动执行高权限动作。
- 缺少执行日志。
- 运行未知代码或安装依赖。

### Framework

权重：

| 维度 | 权重 |
| --- | ---: |
| `developer_fit` | 18 |
| `api_stability` | 14 |
| `documentation_quality` | 15 |
| `examples_quality` | 10 |
| `integration_cost` | 12 |
| `maintenance_health` | 14 |
| `ecosystem` | 8 |
| `security_posture` | 6 |
| `community_signal` | 3 |

专属评分项：

- API 是否稳定。
- 示例是否覆盖真实集成。
- 与目标语言和部署环境是否匹配。
- 是否有 lock-in 或托管依赖。
- 状态管理、工具调用和错误处理是否可控。

### CLI / SDK

权重：

| 维度 | 权重 |
| --- | ---: |
| `task_fit` | 22 |
| `automation_friendliness` | 15 |
| `platform_compatibility` | 10 |
| `installation_reliability` | 12 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `security_posture` | 12 |
| `community_signal` | 5 |

专属评分项：

- 是否支持非交互式运行。
- 输出是否机器可读。
- 是否能在 CI 或 agent 环境稳定运行。
- 是否会执行 shell、修改文件或访问 secret。

### Prompt / Rules

权重：

| 维度 | 权重 |
| --- | ---: |
| `task_fit` | 20 |
| `specificity` | 20 |
| `boundary_clarity` | 15 |
| `agent_compatibility` | 10 |
| `evaluation_support` | 10 |
| `evidence_quality` | 10 |
| `maintenance_health` | 5 |
| `security_posture` | 10 |

专属评分项：

- 是否针对具体任务，而不是泛泛建议。
- 是否包含禁止事项和审批边界。
- 是否可测试或有示例输入输出。
- 是否可能诱导 agent 泄露 secret、绕过限制或执行高风险动作。

## 安全评分规则

安全评分由 `permissions`、`trust_level`、`known_risks` 和证据质量共同决定。

### 风险等级上限

| 条件 | 最低风险等级 |
| --- | --- |
| 权限未知 | `unknown` |
| 读写文件系统 | `medium` |
| shell 或 code execution | `high` |
| 邮件、数据库写入、云账号 | `high` |
| 支付、云 admin、secret 管理 | `critical` |
| 来源未知且需要执行代码 | `high` |

### 推荐限制

- `critical` 风险默认不进入 `recommended`，除非任务明确需要且来源为官方，同时必须 `ask_human`。
- 权限未知不能标记为低风险。
- 安全说明缺失时降低 `security_posture` 和 `evidence_quality`。

## 证据质量规则

| 证据质量 | 条件 |
| --- | --- |
| `high` | 官方来源或多可信来源一致，字段完整 |
| `medium` | 单一可信来源，关键字段齐全 |
| `low` | 社区来源、字段缺失或存在冲突 |
| `unknown` | 来源不可确认 |

证据质量影响：

- `low` 最高推荐等级为 `consider`。
- `unknown` 最高推荐等级为 `insufficient_evidence`，除非人工审核补充。

## 评分计算流程

```text
Tool Card
  -> 检查必填字段
  -> 选择类型专属权重
  -> 计算分项分
  -> 应用扣分和加分
  -> 应用安全上限
  -> 生成推荐等级
  -> 生成解释
  -> 输出 Rating Result
```

## 示例评分

### 示例：官方文件系统 MCP

```yaml
tool_id: official-filesystem-mcp
tool_type: mcp
overall_score: 82
recommendation_level: consider
risk_level: medium
dimension_scores:
  task_fit: 90
  mcp_tool_description_quality: 85
  permission_scope: 65
  documentation_quality: 80
  maintenance_health: 85
  integration_cost: 75
  evidence_quality: 90
  community_signal: 70
explanations:
  - dimension: permission_scope
    reason: 需要文件系统访问，建议只读和目录 allowlist。
  - dimension: evidence_quality
    reason: 来源为官方仓库和文档，证据质量高。
```

结论：适合需要本地文件访问的 agent 任务，但因为文件系统权限，推荐输出应提示人工确认。

### 示例：来源不明支付自动化 CLI

```yaml
tool_id: unknown-payment-cli
tool_type: cli
overall_score: 35
recommendation_level: avoid
risk_level: critical
dimension_scores:
  task_fit: 70
  automation_friendliness: 60
  installation_reliability: 30
  documentation_quality: 20
  maintenance_health: 20
  security_posture: 5
  community_signal: 10
explanations:
  - dimension: security_posture
    reason: 涉及支付和 secret，但来源不明且权限说明缺失。
```

结论：即使任务相关，也不应推荐。

## 解释质量要求

每个评分结果至少解释：

- 为什么适合或不适合主要任务。
- 哪些字段支撑这个判断。
- 主要风险是什么。
- 置信度为何是当前等级。
- 推荐时需要什么前置条件。

禁止：

- 只输出数字。
- 用 star 数替代质量判断。
- 把作者宣传语当作评分理由。
- 对未知权限给低风险结论。

## 评分回归要求

以下变更必须运行评分评测：

- 修改权重。
- 新增或删除评分维度。
- 修改安全上限。
- 修改证据质量规则。
- 修改分类枚举。
- 大量新增来源。

评测输出必须包含：

- 分数变化最大的工具。
- 推荐等级变化的工具。
- 风险等级变化的工具。
- golden queries 排名变化。
- 是否需要人工审核。

## 维护规则

- 修改评分规则必须同步更新评测集。
- 评分结果必须包含解释，不允许只有数字。
- 安全相关扣分和风险上限优先于排序优化。
- 大幅调整权重需要人类确认。
