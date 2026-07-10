# Agent Radar

Agent Radar 是一个面向人类开发者和 coding agent 的 AI 工具评级与推荐知识库。它定期发现社区中的 AI Agent、Skill、MCP Server、CLI、Framework 和 Prompt/Rules，按用途、使用方式、来源可信度和风险进行结构化分类与评分，并输出 AI 友好的文档、JSON/JSONL 数据和 MCP 查询能力。

## 项目目标

- 帮助开发者快速找到适合当前需求的 AI 工具。
- 帮助 coding agent 根据任务目标、约束和风险自动选择可复用工具。
- 持续沉淀工具卡片、评分规则、采集源、评测集和推荐依据。
- 允许 coding agent 在明确护栏下改进采集代码、数据结构、评分标准和文档。

## 当前阶段

当前处于 v0.2 收尾阶段。`all-v0.2.4` 已验证发布 29 张 Tool Cards，真实 provider golden eval 为 10/10，production promotion 通过，已部署 Worker 的 MCP JSON-RPC endpoint 完成 4/4 smoke checks。`all-v0.2.5` 仍是待执行的 closeout release，只有完成全部本地门禁、GitHub `production` approval、部署和线上核验后才能标记为已发布。仓库已经包含：

- TypeScript Tool Card、Rating Result、Recommendation Result schema。
- Source Registry 驱动的数据 pipeline；受控的 GitHub topic、精确 GitHub repository、npm package metadata 和官方文档 sources 已启用，候选必须经过 validation、auto review 和 promotion gates。
- 单个启用 Static Assets 的 Cloudflare Worker，同时承载 Web、数据 artifacts、HTTP API 和 `/api/mcp` MCP JSON-RPC endpoint。
- 只读 API handler，覆盖 `search_tools`、`get_tool_card`、`recommend_tools`、`explain_rating`。
- Cloudflare D1 兼容 read model migration。
- React/Vite 公开 UI，由同一个 Cloudflare Worker 的 Static Assets 提供。
- v0.2 golden queries，覆盖 coding agent、agent framework、MCP、GitHub、监控调试和无可靠候选场景。

## 本地命令

```bash
npm install
npm test
npm run ingest
npm run pipeline
npm run eval
npm run pages:build
npm run dev:with-data
npm run preview:build
npm run dev -- --port 4173
```

核心发布产物由 `npm run pipeline` 生成，不再作为源码长期提交：

- `public/data/tool_cards.jsonl`
- `public/data/ratings.jsonl`
- `public/data/search_index.json`
- `public/data/d1_seed.sql`
- `public/data/manifest.json`
- `public/reports/eval-data-2026-07-06.md`

开发环境通过 `npm run dev:with-data` 先生成本地 `public/data` 和 `public/reports`，再启动 Vite。发布环境通过 `npm run release:build` 在 CI 或发布机上重新生成同一批产物并构建 `dist-pages`。Cloudflare D1 初始化使用 `migrations/0001_mvp_read_model.sql`，数据导入使用生成的 `public/data/d1_seed.sql`；v0.2 线上查询仍以同一 deployment 的静态 artifacts 为事实源，D1 serving cache 尚未启用。Worker 入口在 `src/worker.ts`，UI 入口在 `index.html` 和 `src/ui/App.tsx`。

`npm run ingest` 运行 v0.2 数据采集 MVP 的本地链路：读取 enabled Source Registry、保存 Raw Snapshot 到 `data/raw/`，输出 Source Records、Tool Card drafts、release admission、promotion candidates 和 promotion check artifact。`npm run pipeline` 默认消费通过 gate 的采集候选并生成可靠推荐发布数据。这些中间文件是可再生成的采集产物，不进入 git。

本地 LLM eval 或推荐可以使用仓库根目录 `.env`，该文件应保持 git ignored：

```dotenv
AGENT_RADAR_LLM_API_KEY=your-provider-key
AGENT_RADAR_LLM_MODEL=MiniMax M3
AGENT_RADAR_LLM_BASE_URL=https://api.minimaxi.com
```

`npm run eval`、`npm run pipeline` 和依赖 pipeline 的本地命令会自动加载 `.env`。显式 shell 环境变量或 CI secret 优先于 `.env`。`AGENT_RADAR_LLM_BASE_URL` 用于覆盖当前 provider 的 base URL，例如国内 MiniMax key 使用 `https://api.minimaxi.com`。

`npm run preview:build` 在 `release:build` 后生成 `dist-pages/artifact-manifest.json`，并把完整审核材料写入 `artifacts/review/ingestion.md`。名称中的 `preview` 是历史命令名；当前产物是 `Release All` workflow 使用的 immutable reviewed bundle，不代表 Cloudflare Pages deployment。正常审核由脚本、规则、LLM eval、auto review、release admission 和 promotion check 生成证据，结果持久化在 reviewed bundle 中，不要求维护者逐条填写 approval record。

推送 `all-v*` tag 会触发 `.github/workflows/release-all.yml`：构建并上传 reviewed bundle，等待 GitHub `production` environment 的一次人工发布确认，再部署同一 bundle 到 Cloudflare Worker。Workflow 从 Wrangler deploy output 取得 Worker URL，自动运行 MCP smoke，并把 GitHub run、SHA、tag、production deployment、manifest checksum、D1 seed checksum 和 smoke 结果写入 `production-release-evidence.json`。高风险工具执行、破坏性操作和安全边界变化仍必须取得人工确认。

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
