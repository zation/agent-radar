# 10 评测计划

## 文档用途

本文件定义如何评估 Agent Radar 的数据质量、评分质量和推荐质量。它是 agent 自迭代的安全护栏。

## 应包含内容

- Golden queries：典型用户需求和预期候选。
- Ranking eval：推荐排序是否合理。
- Data quality eval：字段完整性、重复率、过期率、来源覆盖。
- Rating eval：评分变化是否符合预期。
- Regression eval：规则或代码变更前后对比。
- 人工审核样本：争议案例、误判案例、边界案例。

## 后续生成提示词

```text
请为 Agent Radar 生成评测计划文档。请设计 golden queries、expected rankings、数据质量检查、评分回归测试、推荐解释质量评测和人工审核流程。要求每类评测说明输入、输出、通过标准、失败处理和如何用于 agent 自迭代。内容使用中文，并给出示例评测用例。
```

## 维护规则

- 修改评分或推荐逻辑必须运行相关评测。
- 评测失败不能只改 expected result，必须说明为什么预期变化合理。
