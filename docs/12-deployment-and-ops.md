# 12 部署与运维

## 文档用途

本文件定义 Agent Radar 的低成本部署、定时任务、发布、监控和故障处理方案。

## 应包含内容

- MVP 部署：GitHub Actions、GitHub Pages 或 Cloudflare Pages、静态 JSON/JSONL、轻量 MCP server。
- 低成本生产：Cloudflare Workers、R2、Supabase 或 SQLite/DuckDB 文件。
- 定时任务：每日采集、每周全量、每月评测报告。
- 发布流程：生成数据、运行评测、发布索引、更新文档。
- 监控：采集成功率、数据新鲜度、推荐失败率、评分漂移。
- 回滚：数据版本、索引版本、规则版本。

## 后续生成提示词

```text
请为 Agent Radar 生成部署与运维文档。要求优先低成本方案，覆盖 GitHub Actions、Cloudflare Pages/Workers、静态数据文件、MCP Server、定时采集、发布流程、监控指标、故障处理和回滚策略。内容使用中文，并明确 MVP 阶段和生产阶段的差异。
```

## 维护规则

- 新增基础设施前必须说明成本、替代方案和运维负担。
- 部署方案要优先支持可回放、可回滚和可观测。
