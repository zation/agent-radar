# Agent Radar

Agent Radar 是一个面向人类开发者和 coding agent 的 AI 工具评级与推荐知识库。它定期发现社区中的 AI Agent、Skill、MCP Server、CLI、Framework 和 Prompt/Rules，按用途、使用方式、来源可信度和风险进行结构化分类与评分，并输出 AI 友好的文档、JSON/JSONL 数据和 MCP 查询能力。

## 项目目标

- 帮助开发者快速找到适合当前需求的 AI 工具。
- 帮助 coding agent 根据任务目标、约束和风险自动选择可复用工具。
- 持续沉淀工具卡片、评分规则、采集源、评测集和推荐依据。
- 允许 coding agent 在明确护栏下改进采集代码、数据结构、评分标准和文档。

## 当前阶段

当前阶段是 MVP 可运行骨架。仓库已经包含：

- TypeScript Tool Card、Rating Result、Recommendation Result schema。
- 6 张人工审核种子 Tool Cards，覆盖 `skill`、`mcp`、`agent`。
- 本地数据 pipeline，可生成 JSON/JSONL artifacts、D1 seed SQL 和 eval report。
- 只读 API handler，覆盖 `search_tools`、`get_tool_card`、`recommend_tools`、`explain_rating`。
- Cloudflare D1 兼容 read model migration。
- Cloudflare Pages 风格的 React/Vite 公开 UI。
- 5 个 MVP golden queries，覆盖测试、支付、邮件、浏览器和无可靠候选场景。

## 本地命令

```bash
npm install
npm test
npm run pipeline
npm run eval
npm run pages:build
npm run dev -- --port 4173
```

核心产物：

- `public/data/tool_cards.jsonl`
- `public/data/ratings.jsonl`
- `public/data/search_index.json`
- `public/data/d1_seed.sql`
- `public/data/manifest.json`
- `public/reports/eval-data-2026-07-06.md`

Cloudflare D1 初始化使用 `migrations/0001_mvp_read_model.sql`，数据导入使用 `public/data/d1_seed.sql`。Workers 只读 API 入口在 `src/worker.ts`，Pages UI 入口在 `index.html` 和 `src/ui/App.tsx`。

## 文档入口

- [产品简报](docs/00-product-brief.md)
- [需求文档](docs/01-requirements.md)
- [用户流程](docs/02-user-workflows.md)
- [系统架构](docs/03-system-architecture.md)
- [数据模型](docs/04-data-model.md)
- [分类体系](docs/05-taxonomy.md)
- [评分规则](docs/06-rating-rules.md)
- [采集源注册表](docs/07-source-registry.md)
- [采集与入库](docs/08-crawler-and-ingestion.md)
- [推荐引擎](docs/09-recommendation-engine.md)
- [评测计划](docs/10-evaluation-plan.md)
- [安全与信任](docs/11-security-and-trust.md)
- [部署与运维](docs/12-deployment-and-ops.md)
- [Agent 自迭代机制](docs/13-agent-self-improvement.md)
- [Web UI](docs/14-web-ui.md)
- [路线图](docs/15-roadmap.md)

## 给 coding agent 的工作方式

开始任何实现前，先阅读 [AGENTS.md](AGENTS.md)。默认流程是：理解文档、提出最小改动、修改代码或数据、运行测试和评测、输出变更说明。高风险动作必须等待人类确认。

## 后续生成提示词

所有后续文档和代码生成提示词放在 [docs/prompts](docs/prompts)。
