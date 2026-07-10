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
| 用户反馈 | 工具分类错误、推荐无用、权限提示缺失、安装失败 | 转为反馈汇总、Review Summary 或待审核任务；不能直接改分或提升信任 |
| 安全评测失败 | payment 工具未要求审批 | 修安全规则 |
| CI 失败 | test failed、eval failed、preview gate failed | 收集项目 GitHub link、失败 job、脱敏 CI log 和相关 artifact 摘要，交给 LLM 生成修复分支和 PR 草稿；PR 必须包含复现步骤、修改说明和验证结果 |

## 后续想法：CI 失败自动修复 PR

当 GitHub Actions 中测试、评测或发布 gate 失败时，后续可以引入受控的自动修复工作流：

```text
CI failure
  -> 收集 repo link、commit SHA、workflow/job id、失败命令、脱敏 CI log、相关 artifact 摘要
  -> 分类失败类型：test_failure、eval_failure、schema_failure、pipeline_failure、preview_failure
  -> 调用 LLM 生成问题诊断和最小修复计划
  -> 在独立分支应用低风险修复
  -> 运行对应测试或 eval
  -> 自动创建 draft PR
  -> 人类 review 后合并
```

安全边界：

- 只发送公开 repo link、失败日志、命令输出和必要 artifact 摘要；不得发送 secret、token、`.env`、私有数据、本地文件、浏览器数据或邮件内容。
- 自动 PR 默认只能处理低风险改动，例如测试修复、parser fixture、字段映射、文档、eval case 补充和明显的 pipeline bug。
- schema 语义变化、评分权重大改、安全风险降低、来源 trust level 提升、自动发布策略变化和依赖/基础设施变更必须转为人工审批任务。
- LLM 只能基于 CI log、仓库内容和已生成 artifacts 诊断，不得把未引用的外部知识写成项目事实。
- PR 描述必须包含触发来源、失败摘要、修复范围、运行过的验证命令、剩余风险和是否需要人工确认。

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

### 反馈处理

允许：

- 将 Web UI、MCP/API 或 agent runtime 的反馈聚合为 `feedback_summary.v1`。
- 根据负反馈生成 data quality、recommendation misrank 或 safety eval task。
- 把高价值反馈样例转为 golden query 或 safety assertion。
- 为 Tool Card draft 或 promotion candidate 生成 `review_summary.v1`。

要求：

- 不保存用户私有代码、邮件内容、token、secret、完整 prompt 或浏览器内容。
- 小样本反馈只能作为弱信号，不能直接提升评分、降低风险或提升 trust level。
- `unsafe`、权限遗漏、生产数据、支付、邮件、数据库、云账号相关反馈必须进入人工异常队列。
- LLM 可以总结反馈和来源证据，但不能把未引用的外部知识写成事实。

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
  -> 汇总来源证据、Review Summary 和用户反馈
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
- 根据用户反馈直接自动安装工具、提升来源信任、降低风险等级或发布未知来源 Tool Card。

Agent 应：

- 保留原始快照。
- 标记不确定性。
- 请求人类确认高风险变更。
- 给出最小可验证改动。
- 将用户反馈作为点评和评测输入，而不是单独作为事实来源。

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
- 允许 agent 后续自动创建 PR，修复 parser、data 和 eval 问题；PR 必须包含验证结果。

### v0.2

- 自动生成误判任务。
- 自动补充 eval cases。
- 推荐变化报告。
- 设计反馈记录格式和最小反馈汇总报告。
- 用 Review Summary 降低人工逐条审核成本，但不自动解除安全 gate。

### v0.3

- P1 完善 provenance、URL、跨来源冲突、Review Summary 和数据质量报告。
- P2 增加安全风险评分、结构化 Human Approval、eval diff 和 critical safety release gate。
- 不接收用户反馈写入；现有 Web/API/MCP 主路径保持只读。

### v0.4

- P1 通过 GitHub OAuth 和 D1 收集 Tool Card 赞踩，并允许用户主动打开结构化 GitHub Issue Form 提交必填原因。
- P2 在 `Release All` 构建中将反馈 Issue 分为 accepted、rejected 和 needs-human-review，生成反馈快照和评级输入。
- accepted Issue 和裸投票按用户与 Tool Card 去重，采用版本化、上限为 `-3` 到 `+3` 的保守评分调整。
- 人工审核聚焦安全、规则争议、证据冲突和 `needs-human-review` Issue。

### v1.0

- 稳定自迭代工作流。
- 可配置策略。
- 完整审计日志和回滚。

## 维护规则

- 自迭代不是无监督自我修改，所有高风险变更必须有人类或明确策略审批。
- Agent 的每次改动都应能被回放、解释和回滚。
- 新增自动动作前必须更新允许范围和验证要求。
- 任何安全边界放宽都必须人工确认。
