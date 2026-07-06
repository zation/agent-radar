# 13 Agent 自迭代机制

## 文档用途

本文件定义 coding agent 如何在 Agent Radar 项目中自行发现问题、提出改进、修改文档、代码或数据，并通过评测和人类审批安全迭代。

自迭代不是无监督自我修改。它是受 schema、评测、安全边界和人类审批约束的低风险改进流程。

## 自迭代原则

- 所有改动必须可回放、可解释、可回滚。
- 先判断问题类型，再选择允许的自动动作。
- 低风险数据、parser、文档和评测补充可自动处理。
- schema 语义变化、评分大改、高风险来源和自动执行工具必须人工确认。
- 每次改动都应产生验证结果或 eval diff。

## 触发来源

| 触发 | 示例 | 常见处理 |
| --- | --- | --- |
| 采集失败 | GitHub topic parser 结构变化 | 修 parser fixture |
| 解析失败 | license 字段映射错误 | 修字段映射 |
| 数据质量下降 | 权限未知率升高 | 补字段或降级来源 |
| 推荐误判 | 高风险工具排第一 | 新增 eval case，修评分 |
| 评分异常 | deprecated 工具仍 recommended | 修规则或数据 |
| schema 缺口 | 无法表达 hosted 数据外传 | 提出 schema 变更 |
| 用户反馈 | 工具分类错误 | 核验证据后修 Tool Card |
| 安全评测失败 | payment 工具未要求审批 | 修安全规则 |

## 可自动处理的任务

### 文档更新

允许：

- 补充字段说明。
- 修正交叉引用。
- 根据已确认规则更新示例。
- 增加维护规则。

要求：

- 不改变核心产品边界。
- 不放宽安全要求。

### Parser 修复

允许：

- 修复来源结构变化。
- 修复字段映射。
- 增加 fixture。
- 保留原始字段。

要求：

- 不引入绕过来源限制的采集方式。
- 运行 parser 测试和数据质量检查。

### 数据补全

允许：

- 从官方来源补充 docs_url、license、install_methods。
- 修正明显重复。
- 标记 deprecated。
- 补充 evidence_refs。

要求：

- 必须有公开来源证据。
- 高风险字段宁可保守。

### 评测补充

允许：

- 把误判样例转为 Eval Case。
- 增加 no reliable match case。
- 增加安全断言。
- 更新解释质量检查。

要求：

- 不为当前实现硬编码 expected。
- 说明样例代表的真实场景。

## 需要人类确认的任务

- 删除大量历史数据。
- 修改核心 schema 字段语义。
- 大幅调整评分规则或权重。
- 自动信任未知来源工具。
- 新增高风险来源。
- 引入付费服务、闭源依赖或长期运行基础设施。
- 自动安装或执行第三方工具。
- 降低安全风险等级。
- 修改 Human Approval 规则。

## 任务生成格式

Agent 发现问题后应生成结构化任务：

```yaml
id: task-fix-gmail-risk-20260706
type: fix_recommendation_safety
trigger:
  source: eval_failure
  eval_case_id: gq-gmail-task-summary
problem:
  summary: Gmail 推荐结果未要求人工确认。
  evidence:
    - "recommended_action was use"
    - "permissions include email"
suspected_cause:
  - recommendation rule missing email approval guard
allowed_actions:
  - inspect_recommendation_rule
  - add_safety_eval
  - adjust_recommendation_guard
requires_human_approval: false
verification:
  - run safety eval
  - run related golden query
```

## 自迭代流程

```text
发现问题
  -> 分类问题类型
  -> 判断是否允许自动处理
  -> 生成任务记录
  -> 建分支或工作区
  -> 最小改动
  -> 运行测试/评测
  -> 生成 diff 和报告
  -> 需要审批？
      -> 是：提交给人类
      -> 否：提交改动
  -> 观察后续评测
```

## 变更报告格式

每次自迭代改动应说明：

```markdown
## 变更摘要

- 修复了什么问题。
- 修改了哪些文件或数据。
- 为什么这样改。

## 证据

- 触发来源。
- 相关 Tool Card / Eval Case / Source Record。

## 验证

- 运行的命令。
- 评测结果。
- 变化前后对比。

## 风险

- 可能影响哪些推荐。
- 是否需要人工复核。
```

## Eval Diff 格式

```yaml
before:
  data_version:
  rules_version:
after:
  data_version:
  rules_version:
changes:
  recommendation_level_changes:
    - tool_id:
      from:
      to:
  risk_level_changes:
    - tool_id:
      from:
      to:
  top_rank_changes:
    - eval_case_id:
      before_top1:
      after_top1:
critical_failures:
review_required:
```

## 分支和提交规则

建议：

- 使用小分支处理一个问题。
- 提交信息说明问题类型，例如 `fix: correct mcp permission mapping`。
- 不在一个提交中混合 schema 大改、parser 修复和评分权重调整。

提交前必须：

- 检查 git diff。
- 运行相关测试或评测。
- 确认未包含 secret 或私密数据。

## 安全护栏

Agent 不得：

- 使用私有 token 采集数据。
- 自动运行未知工具进行验证。
- 为了通过评测降低风险等级。
- 删除来源证据。
- 静默修改 expected result。
- 把用户本地文件、邮件或浏览器数据写入数据集。

Agent 应：

- 保留原始快照。
- 标记不确定性。
- 请求人类确认高风险变更。
- 给出最小可验证改动。

## 人类审批接口

需要审批时，Agent 应提供：

- 变更目标。
- 影响范围。
- 风险说明。
- 替代方案。
- 推荐选择。
- 明确需要用户确认的问题。

不要把审批请求写成模糊问题，例如“是否继续”。应具体说明：“是否允许将 payment 权限的最低风险等级从 high 调整为 critical？”

## 自迭代成熟度阶段

### MVP

- 文档更新。
- 低风险 parser 修复。
- 数据质量检查。
- 手工触发 eval diff。

### v0.2

- 自动生成误判任务。
- 自动补充 eval cases。
- 推荐变化报告。

### v0.3

- CI 中生成改进建议。
- 将用户反馈转换为待审核任务。
- 数据质量趋势分析。

### v1.0

- 稳定自迭代工作流。
- 可配置策略。
- 完整审计日志和回滚。

## 维护规则

- 自迭代不是无监督自我修改，所有高风险变更必须有人类或明确策略审批。
- Agent 的每次改动都应能被回放、解释和回滚。
- 新增自动动作前必须更新允许范围和验证要求。
- 任何安全边界放宽都必须人工确认。
