# 12 部署与运维

## v0.3 P2 发布门禁

Release All 在 reviewed bundle 构建 job 注入 `AGENT_RADAR_RELEASE_ID` 和 `AGENT_RADAR_COMMIT_SHA`，运行当前候选的 24 条真实 provider golden queries，并在上传 bundle 前校验 4 条 critical safety cases。部署 job 原样部署已审核 bundle，并把相同 release ID 与 commit SHA 注入 Worker。P2 不下载历史 eval artifact，也不生成 Eval Diff；现有 P1 历史数据质量 artifact 读取保持不变。

## 文档用途

本文件定义 Agent Radar 的低成本部署、定时任务、发布、监控、故障处理和回滚方案。

部署目标是支持可回放数据生成、可验证推荐发布和 agent 可查询接口，而不是过早建设复杂平台。

## 运维原则

- MVP/v0.2 固定使用 Cloudflare 免费栈：Cloudflare Workers Static Assets、Cloudflare Workers API 和 Cloudflare D1 SQLite。
- 发布前必须跑 schema、数据质量、安全和推荐评测。
- 每次发布记录数据版本、规则版本和索引版本。
- 正常审核由脚本、规则、LLM eval、auto review、release admission 和 promotion check 完成，并固化到 immutable reviewed bundle。
- GitHub `production` environment gate 是唯一的常规人工发布确认。`approval_override` 只用于有证据的 break-glass 情况。
- 审核对象必须和发布对象一致；生产 job 从同一不可变 tag/SHA 构建 Worker 代码，并原样恢复 reviewed bundle 中的静态 assets/data，不重新运行 pipeline 生成新数据产物。
- 失败时保留上一稳定版本。
- 不引入任何付费服务；新增基础设施前必须说明免费额度、成本和替代方案。

## 环境分层

### 本地开发

用途：

- 编辑文档和 schema。
- 运行 parser fixture。
- 生成小样本 Tool Card。
- 调试评分和推荐。

组件：

- 本地文件系统。
- JSON/JSONL。
- 本地 SQLite，保持与 Cloudflare D1 schema 兼容。
- 本地 TypeScript MCP server，用于模拟 Workers MCP API。

### MVP/v0.2 发布

用途：

- 发布静态工具数据、评分和索引。
- 提供基础 Web UI。
- 提供同域 Cloudflare Workers 上的标准轻量 MCP/API。

组件：

- 推送不可变 `all-v*` tag，或用 `workflow_dispatch` 选择已有的 `all-v*` tag。
- Cloudflare Workers Static Assets。
- Worker 内的只读 `/api/*` 和 `/api/mcp`。
- 同一 Worker deployment 内的静态 JSON/JSONL artifacts。
- Cloudflare D1 SQLite。

### 低成本生产

用途：

- 更稳定的查询接口。
- 更大的数据量。
- 更好的监控和回滚。

组件：

- Cloudflare Workers Static Assets + Worker API。
- Cloudflare D1 SQLite。
- JSON artifacts。
- 简单状态监控。

## MVP 架构

### 当前实现

当前本地 MVP 可靠发布流水线默认使用 enabled Source Registry 的采集结果作为输入，生成评分、搜索索引、D1 seed SQL、golden query 数据和 eval report。源码内的 seed Tool Cards 不再作为生产发布输入。

```text
enabled Source Registry
  -> crawl/parse/normalize
  -> release admission + promotion check
  -> validate Tool Card schema
  -> rate
  -> build static index + D1 seed SQL
  -> run eval or blocked eval summary
  -> publish artifacts
  -> Worker Static Assets serves Web/data and Worker API reads same deployment artifacts
```

当前已实现 Source Registry 读取、crawler、parser、Raw Snapshot 保存、Source Record 输出、discovery candidates、发布用 `source_registry.json` artifact、基础 validator、repo/package/docs 跨来源 normalizer、source profile 字段映射、最小 deduper、带证据的 break-glass override artifact 及其 evidence ref 审计、intervention requests、review queue、auto review、release admission、promotion candidates、promotion plan 和 promotion check dry-run，并已接入默认可靠发布 artifacts。Web UI 展示 Source Registry production gate attention signals，但不写入或改变发布审核状态。v0.3 仍需完善跨来源字段冲突处理，以及覆盖多来源 lineage、转换规则版本和冲突选择依据的完整 override 审计。

### 目标形态

```text
GitHub Actions
  -> crawl/parse/normalize
  -> validate schema
  -> rate
  -> build static index + D1 import
  -> run eval
  -> publish artifacts
  -> Cloudflare Worker serves Web UI, JSON artifacts and MCP/API from one deployment
```

MVP 不启用自动 schedule。维护者手动触发更新和发布。

## Worker 一体化发布主路径

v0.2 的现行生产架构是单个启用 Static Assets 的 Cloudflare Worker：同一 deployment 承载 Web、数据 artifacts、HTTP API 和 MCP JSON-RPC endpoint。旧 Cloudflare Pages workflows 只属于历史方案，不是当前发布架构，也不保留双轨兼容层。

目标 Worker 项目名：

```text
agent-radar
```

同一个 Worker deployment 提供：

```text
/                  Web UI
/assets/*          Web bundle assets
/data/*            发布数据 artifacts
/reports/*         Eval report
/api/search_tools
/api/get_tool_card
/api/recommend_tools
/api/explain_rating
/api/mcp_manifest
/api/mcp
/api/version
```

数据读取原则：

- Worker API 默认从同一 deployment 的 static assets 读取 `data/tool_cards.jsonl`、`data/ratings.jsonl` 和 `data/search_index.json`。
- 标准发布流程不再需要 `AGENT_RADAR_DATA_BASE_URL`。
- MCP smoke 使用刚部署的 Worker URL，不再依赖手工维护的 `AGENT_RADAR_MCP_BASE_URL`。
- D1 后续作为 serving cache 接入；JSON/JSONL artifacts 仍是发布审核、回放和回滚的事实源。

发布 tag 使用三段版本号和发布轨道前缀：

```text
all-v0.2.4
all-v0.2.5
```

规则：

- `all-vX.Y.Z` 表示一次完整发布尝试，构建并部署 data + web + api/mcp 到同一个 Worker。
- 如果发布尝试失败或需要重新审核，不复用 tag，直接递增 patch 版本。
- tag 只有在 reviewed bundle、GitHub `production` environment confirmation、生产部署、部署后 smoke 和 production evidence 全部完成后，才可视为已验证 production release。
- 失败 tag 保留为历史尝试，供审计和复盘使用。

### v0.2 发布状态

- `all-v0.2.4` 是上一版已验证基线：发布 29 张 Tool Cards，真实 provider golden eval 10/10 通过，promotion candidates 29/29 通过，完成 GitHub `production` environment confirmation 与生产部署，线上 `/api/mcp` smoke 4/4 通过。
- `all-v0.3.3` 是当前已验证 production baseline。GitHub Actions run `29136141415` 已完成 production confirmation 和 Worker 部署；`production-release-evidence.json` 绑定 commit `6dcd9c5f`、deployment `5400068926`、reviewed bundle、manifest/D1 checksums 与线上 endpoint，部署后 MCP smoke 为 4/4。

后续需要更细粒度发布时再增加：

```text
data-vX.Y.Z
web-vX.Y.Z
api-vX.Y.Z
```

在这些单独发布轨道出现前，`all-v*` 是唯一生产发布入口。

## 发布产物

发布产物由 `npm run pipeline` 在本地或 CI 中生成，默认不作为源码长期提交。源码仓库保留 Source Registry、golden queries、评分/推荐代码、schema、migration 和文档；`public/data`、`public/reports`、`dist`、`dist-pages` 属于可再生成产物，应作为 GitHub Actions artifacts 或 Worker Static Assets 部署输出保存。v0.2 不要求创建 GitHub Release 对象。

| 产物 | 路径示例 | 用途 |
| --- | --- | --- |
| Source Registry | `public/data/source_registry.json` | 来源展示和审计 |
| Tool Cards | `public/data/tool_cards.jsonl` | 工具详情 |
| Ratings | `public/data/ratings.jsonl` | 评分解释 |
| Search Index | `public/data/search_index.json` | 搜索和召回 |
| Eval Report | `public/reports/eval-<version>.md` | 发布质量证明 |
| Manifest | `public/data/manifest.json` | 版本指针 |

Manifest 示例：

```json
{
  "data_version": "data-2026-07-06",
  "schema_versions": {
    "tool_card": "tool_card.v1",
    "rating_result": "rating_result.v1"
  },
  "rules_versions": {
    "rating": "rating_rules.v0.1-draft",
    "recommendation": "recommendation_rules.v1"
  },
  "index_version": "index-2026-07-06",
  "eval_report": "reports/eval-data-2026-07-06.md",
  "published_at": "2026-07-06T12:00:00Z"
}
```

## 手动触发流水线

### 触发策略

MVP 只使用手动触发：

- 新增或修正来源。
- 新增或修正 Tool Card。
- 修复 parser。
- 发布前验证。
- 需要刷新公开站点或 D1 数据。

### 当前 MVP 命令

当前实现提供以下本地命令：

```bash
npm test
npm run pipeline
npm run eval
npm run pages:build
npm run dev
npm run dev:data
npm run dev:with-data
npm run release:build
npm run promotion:check
npm run mcp:smoke
npm run preview:build
npm run dev:server -- --port 4173
```

命令说明：

- `npm test`：运行 TypeScript 编译和 Node test suite，覆盖评分、推荐、pipeline、API 和 UI 数据装配。
- `npm run pipeline`：生成本地 `public/data` artifacts、D1 seed SQL 和 `public/reports` eval report；这些文件是发布产物，不再默认进入 git。
- `npm run dev`：先确保 UI 和本地 API 必需的五个 artifacts 存在且可解析；缺失或损坏时从固定的已验证 production origin `https://agent-radar.zation1.workers.dev` 下载，再启动 127.0.0.1 上的 Vite。
- `npm run dev:data`：只执行本地 UI data bootstrap。下载先进入临时目录，`tool_cards.jsonl`、`ratings.jsonl`、`search_index.json`、`eval_summary.json` 和 `source_registry_review_requests.json` 全部通过 HTTP、HTML fallback、JSON/JSONL 校验后才替换本地文件；它不运行或放宽 production pipeline 门禁。
- `npm run eval`：运行 10 个 v0.2 golden queries；需要 `AGENT_RADAR_LLM_API_KEY` 才会调用真实 LLM provider。缺少 key 时输出 blocked summary 并退出非 0。
- `npm run pages:build`：构建 Vite 静态 UI，输出到本地 `dist-pages/`，供 Worker Static Assets 部署使用。命令名暂时保留以减少迁移噪声。
- `npm run dev:with-data`：兼容入口；执行与 `npm run dev` 相同的 production UI data bootstrap，并在 4173 端口启动 Vite dev server。
- `npm run release:build`：运行测试、生成发布产物并构建静态 UI 输出，适合 CI 或手动发布前使用。
- `npm run promotion:check`：默认读取 `dist-pages/data/promotion_candidates/promotion_check.json`；release workflow 也显式传入该 reviewed bundle 路径。如果 promotion candidate 重复或未通过 Tool Card validator dry-run，则非 0 退出，并在进入 production gate 前阻断发布。
- `npm run mcp:smoke`：对部署后的 Worker base URL 执行 JSON-RPC smoke test，覆盖 initialize、tools/list、只读 tools/call 和只读边界。Worker 一体化发布后，GitHub Actions 必须从 deploy output 自动传入 base URL；`AGENT_RADAR_MCP_BASE_URL` 只作为本地或外部 endpoint override。
- `npm run preview:build`：release build 只运行一次 ingestion/pipeline，并把版本化 review evidence 随静态数据复制到 `dist-pages/`；finalize 只从同一 `dist-pages` 校验和渲染 artifact manifest 与 `artifacts/review/ingestion.md`，不会再次联网采集。
- `npm run dev:server -- --port 4173`：只启动 Vite，并通过 dev middleware 挂载 `/api/*` 到同一套 API handler；不会准备数据。正常开发优先运行 `npm run dev`，缺数据错误界面测试使用 `npm run dev:empty`。

LLM 推荐相关环境变量：

| 变量 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `AGENT_RADAR_LLM_API_KEY` | eval 必填 | 无 | BYOK provider key，仅用于当前 eval/provider 请求 |
| `AGENT_RADAR_LLM_MODEL` | 否 | `deepseek-v4-flash` | eval 使用的模型 ID 或已支持的 provider model label；本地 CLI 和 CI 使用同一默认值 |
| `AGENT_RADAR_LLM_BASE_URL` | 否 | provider 默认值 | 覆盖当前 LLM provider 的 OpenAI-compatible base URL，不包含具体 path；例如国内 MiniMax 使用 `https://api.minimaxi.com` |
| `AGENT_RADAR_CHECK_URLS` | 否 | `false` | 设置为 `true` 时，`npm run pipeline` 会对 Tool Card URL 执行 HEAD/GET 可达性检查；默认只输出 skipped artifact，避免本地/CI 偶发外网失败 |
| `AGENT_RADAR_MCP_BASE_URL` | 本地 smoke 可选 | 无 | 本地或外部 endpoint override；标准 Worker 一体化发布必须使用刚部署的 Worker URL 自动运行 smoke。 |

本地开发可以在仓库根目录创建 `.env`，该文件必须保持 git ignored：

```dotenv
AGENT_RADAR_LLM_API_KEY=your-provider-key
AGENT_RADAR_LLM_MODEL=MiniMax M3
AGENT_RADAR_LLM_BASE_URL=https://api.minimaxi.com
```

Node CLI 入口会在运行时加载 `.env`，包括 `npm run eval`、`npm run pipeline`、`npm run dev:with-data`、`npm run release:build` 和 `npm run preview:build`。系统环境变量优先级高于 `.env`，因此 CI secret 或 shell 中显式导出的变量不会被本地 `.env` 覆盖。

本地/API 推荐调用中，如果请求体没有传 `api_key` 或 `model`，后端会回退到 `AGENT_RADAR_LLM_API_KEY`、`AGENT_RADAR_LLM_MODEL` 和 provider registry 默认模型。`AGENT_RADAR_LLM_BASE_URL` 只覆盖当前 model 对应 provider 的 base URL；provider 仍由 model label 或 model id 决定。浏览器页面不会读取或显示 `.env` 内容，secret 只留在本地 Node/API 进程中。

当前 Web UI 支持用户在 Recommend 表单中输入一次性 API key 和模型。请求路径为：

```text
Browser UI
  -> /api/recommend_tools
  -> Recommendation Engine proxy
  -> OpenAI / MiniMax / DeepSeek provider
```

安全约束：

- API key 不写入 artifacts、eval report 或响应体。
- `.env` 不进入 git；不要把 provider key 粘贴到文档、issue、PR 或 Actions Summary。
- server 日志只记录 provider、endpoint、model、状态码和脱敏错误体。
- provider 401/403、429、模型不可用和 JSON 输出异常会映射为稳定 API error code，并由 Recommend UI 展示 provider/status 上下文。
- 本地 dev API 和 Workers API 都必须保持只读，不安装、不授权、不执行推荐工具。

Web UI 的 Review 页面读取 `data/source_registry_review_requests.json`，展示需要在 production gate 关注或介入的 Source Registry signals。该页面不自动确认来源，也不改变发布数据或审核状态。

当前 D1 相关文件：

- schema migration：`migrations/0001_mvp_read_model.sql`
- data seed：`public/data/d1_seed.sql`

当前 Workers 只读 API 入口：`src/worker.ts`。

每日增量、每周全量和每月审核作为 v0.2 之后能力，不在 MVP 自动运行。

### 发布流程

Agent Radar 的数据发布流程采用“build once, review once, deploy the reviewed assets”原则。由于 LLM-backed eval 和数据采集都可能受时间、provider、来源内容变化影响，生产发布不应在 GitHub production confirmation 后重新运行 `pipeline` 并发布新结果。`all-v*` workflow 先用脚本、规则和 LLM 生成 static assets、自动审核结果与 review artifacts，并上传 immutable reviewed bundle，同时对同一 ref 的 Worker 代码执行 dry-run；production gate 确认后，production job 从同一不可变 tag/SHA checkout Worker 源码，并原样恢复 reviewed `dist-pages` 后部署。

### `all-v*` Worker 发布流程

当前实现使用 Worker 一体化发布 workflow。触发方式：

```bash
git tag -a all-v0.2.5 -m "Agent Radar v0.2 closeout"
git push origin all-v0.2.5
```

也可以通过 `workflow_dispatch` 在 GitHub 的标准 ref 选择器中选择已有的 `all-v*` tag；workflow 会拒绝 branch 或其他 ref。Workflow 不接受第二套自定义 ref 输入，并将 build 与 production 两次 checkout 都固定到事件 `${{ github.sha }}`，保证实际代码、GitHub event、deployment record 和 production evidence 指向同一不可变提交。Workflow 使用 `cloudflare/wrangler-action@v4` 执行 `wrangler deploy`，把 `dist-pages` 作为 Worker Static Assets 与 `src/worker.ts` 一起部署到 Cloudflare Worker `agent-radar`。

```text
checkout
  -> install dependencies
  -> npm run preview:build
  -> npm run promotion:check
  -> wrangler deploy --dry-run validates Worker source/config with reviewed assets
  -> append compact review summary to GitHub Actions summary
  -> upload immutable reviewed bundle (dist-pages + review + worker dry-run)
  -> production job waits on GitHub Environment: production
  -> after confirmation, download and restore the reviewed dist-pages
  -> bundle Worker from the same immutable ref and deploy it with reviewed Static Assets
  -> run npm run mcp:smoke against deployed Worker URL
  -> resolve matching GitHub production deployment
  -> generate and upload production-release-evidence.json + mcp-smoke-result.json
```

Worker deployment 应包含：

- 产品网站本体。
- `data/*`：Tool Cards、ratings、search index、eval summary、D1 seed。
- `data/provider_registry.json`：版本化 provider runtime config，供 UI、API 和发布审核确认 BYOK model/provider 选项一致。
- `data/tool_card_field_provenance.json`：关键字段 provenance summary，覆盖 `permissions`、`security` 和 `maintenance` 的字段级证据状态。
- `data/field_provenance/tool_card_fields.v2.json`、`data/conflicts/tool_card_conflicts.json`：字段级多来源选择证据和冲突报告；迁移期继续保留 provenance v1。
- `data/tool_card_url_validation.v2.json`：带超时、重试、状态分类和历史的 URL 检查；迁移期继续保留 URL v1。
- `data/data_quality_report.json`：P1 确定性数据质量门禁。
- `data/review_summary.v2.json` 与 `reports/review_summary.v2.md`：发布级审核摘要及证据路径。
- `data/mcp_examples.json`：MCP JSON-RPC 请求示例，供 agent/client 集成验证。
- `data/mcp_smoke_checklist.json`：MCP deployment review checklist，列出 initialize、tools/list、只读 tools/call 和只读边界的必检项。
- `reports/*`：eval report。
- `artifact-manifest.json`：直接记录 git sha、data version、eval model、通过数、eval failure categories、source registry diff summary、source registry review summary、Tool Card URL validation summary、Tool Card field provenance summary、crawl audit summary、approval override summary、discovery candidates summary、intervention requests summary、field value provenance summary、auto review summary、release admission summary、promotion candidates summary、promotion check summary、构建时间和关键文件 checksum；规则版本和索引版本保存在被 checksum 覆盖的 `data/manifest.json` 中，checksum 还覆盖 `provider_registry.json`、`tool_card_field_provenance.json`、`mcp_examples.json` 和 `mcp_smoke_checklist.json`。

部署前 reviewed bundle 与 GitHub Actions summary 应包含：

- compact review summary，在 GitHub `production` environment confirmation 前展示 ref/SHA、data version、golden eval、source registry attention signals、Tool Card intervention requests、release admission blocks、promotion check failures、critical field provenance missing 和 crawl failure/partial 等整批发布信号。
- `artifacts/review/ingestion.md` 作为 uploaded artifact 保存完整采集明细，包括 discovery candidates、intervention requests、auto review scorecards、release admission items、promotion candidates 和 promotion plan。
- `dist-pages/artifact-manifest.json` 作为机器可读摘要保存在 reviewed bundle 中；它直接记录 Git SHA、data version、eval 和自动审核/admission/promotion 摘要，并用关键文件 checksums 间接绑定 `data/manifest.json` 中的规则与索引版本。
- `worker-dry-run` 保存 Wrangler 对 Worker bundle 的部署前校验结果。

P1 检查只在 reviewed-bundle build job 运行：该 job 强制启用真实 URL 检查，尝试恢复上一成功 Release All 的 reviewed baseline，随后执行采集、数据质量门禁、golden eval、Review Summary/final manifest checksum 校验和 pages build。上一 artifact 不存在时显式使用 `no_baseline`；来源失败且策略允许时保留上一稳定 Source Records。production job 在 GitHub `production` environment 确认后只下载、复核并部署同一个 immutable reviewed bundle；不得重跑采集、URL checker、评分或数据质量报告。

GitHub 配置要求：

| 名称 | 类型 | 用途 |
| --- | --- | --- |
| `AGENT_RADAR_LLM_API_KEY` | secret | `pipeline` / golden eval 使用的 BYOK provider key。 |
| `AGENT_RADAR_LLM_MODEL` | repository variable | eval model；默认使用 `deepseek-v4-flash`。 |
| `CLOUDFLARE_API_TOKEN` | secret | Wrangler Worker deploy 认证。 |
| `CLOUDFLARE_ACCOUNT_ID` | secret | Cloudflare account id。 |
| `CLOUDFLARE_PROJECT_NAME` | repository variable | Cloudflare project name；默认使用 `agent-radar`。 |

Workflow 在部署前上传的 reviewed bundle artifact 名为 `agent-radar-all-<run_id>`，包含：

- `dist-pages`：可部署网站、数据 artifacts 和 `artifact-manifest.json`。
- `artifacts/review`：脚本、规则和 LLM 生成的 Markdown review evidence。
- `worker-dry-run`：Wrangler dry-run 输出。

部署后 workflow 另行上传 `agent-radar-mcp-smoke-<run_id>` artifact，包含：

- `mcp-smoke-result.json`：对刚部署 Worker `/api/mcp` 自动执行 initialize、tools/list、只读 tools/call 和只读边界检查的原始结果。
- `production-release-evidence.json`：把 GitHub repository/run/SHA/tag、production deployment id、reviewed bundle 名称、manifest 与 D1 seed checksums、Worker URL、MCP endpoint 和 smoke summary 绑定为 `production_release_evidence.v1`。

Workflow 先通过 `gh api` 将 production deployment 唯一绑定到当前 repository/run/SHA/tag；evidence builder 再校验 release metadata 格式、manifest `git_sha`、D1 seed checksum、Worker/MCP endpoint 和全部必需 smoke checks，并计算 manifest 文件 SHA 写入证据。任一步失败都会使 production job 失败。JSON 与 smoke artifact 是部署完成后的证据，不属于部署前 reviewed bundle，也不取代 GitHub production confirmation。

### Production Promote 流程

```text
download immutable reviewed bundle
  -> restore reviewed dist-pages without rebuilding
  -> bundle Worker from the same immutable ref and deploy reviewed Static Assets
  -> run automated MCP smoke against deploy output URL
  -> resolve this run's GitHub production deployment id
  -> validate and persist production-release-evidence.json
```

Production promote 不重新运行：

- `npm run ingest`
- `npm run pipeline`
- `npm run eval`

当前 workflow 的标准路径就是在 GitHub `production` environment confirmation 后下载 immutable reviewed bundle，并部署其中的同一份 `dist-pages`；不得重新 build 数据 artifacts。GitHub environment deployment record、Actions run、不可变 tag、reviewed bundle 和部署后 evidence artifacts 共同构成发布记录。

### 发布门槛

必须通过：

- schema validation。
- source registry validation。
- data quality critical checks。
- `data_quality_report.v1` 为 pass，`review_summary.v2` 无 blocking item 且 checksum 校验通过。
- safety eval critical cases。
- golden queries critical cases。
- index build。
- artifact manifest 已生成并记录关键文件 checksums；production evidence 校验 manifest `git_sha` 和 D1 seed checksum。
- immutable reviewed bundle 已上传，且 deployment 原样恢复其中的 `dist-pages`。
- GitHub `production` environment gate 已完成唯一一次常规人工发布确认。
- 部署后 MCP smoke 全部通过，且 `production-release-evidence.json` 成功生成并上传。

LLM-backed 推荐发布说明：

- 没有 provider key 时，golden queries 只能证明 pipeline 可运行，不能证明推荐质量。
- 发布推荐质量声明前，必须至少使用一个真实 provider key 跑完 critical golden queries。
- 如果 provider 返回 401、429、模型不可用或 JSON 输出异常，应记录为 provider/config failure，不应修改 expected result 掩盖问题。

允许带警告：

- 单个低优先级社区来源失败。
- 少量非关键字段缺失。
- 非 critical golden query 排名轻微变化。

## Workers MCP/API 部署

### MVP 方式

MCP/API 部署在同一个 Cloudflare Worker 中，读取同一 Worker deployment 的静态 JSON artifacts。D1 后续作为 serving cache 接入，但不替代 artifacts 的事实源地位。

入口：

- `/api/mcp_manifest`：HTTP JSON 工具清单。
- `/api/mcp`：MCP JSON-RPC endpoint，支持 `initialize`、`tools/list` 和 `tools/call`。
- `data/mcp_examples.json`：部署产物中的 JSON-RPC 请求示例，可用于 agent/client smoke test。
- `data/mcp_smoke_checklist.json`：部署验收清单；workflow 的自动 smoke 按其覆盖 endpoint 初始化、工具列表、只读工具调用和只读边界。
- `data/provider_registry.json`：部署产物中的 provider registry artifact；其版本、默认模型和 UI 可选模型进入 reviewed bundle 的自动校验与 evidence。
- `npm run mcp:smoke`：部署后的自动 smoke test；标准 workflow 从 Worker deploy output 自动传入 base URL 并请求 `${base}/api/mcp`。

支持工具：

- `search_tools`
- `get_tool_card`
- `recommend_tools`
- `explain_rating`

限制：

- 只读。
- 不安装第三方工具。
- 不持久化用户 secret；Recommend BYOK key 只用于当前 provider 请求。
- 不执行推荐候选。
- MCP `tools/call` 只包装上述只读查询工具；未知 method 或未知 tool 返回 JSON-RPC error。
- 使用 Cloudflare 免费额度。

### Cloudflare Workers Static Assets 方式

适用条件：

- Web UI、数据 artifacts 和 MCP/API 需要同域部署。
- 希望避免额外维护外部 data URL 或独立 MCP base URL。
- 希望一次 `all-v*` 发布绑定 data、web 和 api/mcp。

数据读取：

- 当前主查询：同一 Worker deployment 的静态 JSON artifacts。
- 后续 serving cache：Cloudflare D1 SQLite。

注意：

- Worker API 读取的 artifacts 必须来自当前 deployment，不能读 `latest` 或外部 mutable URL 作为审核对象。
- D1 schema 迁移必须和 manifest 版本一致；D1 只能作为 serving copy。
- Workers API 保持只读。

## Web UI 部署

MVP 页面：

- 工具列表。
- 工具详情。
- 推荐查询页。
- 比较页。
- Eval report 页面。

部署建议：

- Cloudflare Workers Static Assets 作为公开站点。
- 页面读取同一 Worker deployment 中的 manifest 数据版本。
- 如果数据版本缺失，显示降级错误，不展示旧推荐为新数据。

## 监控指标

### 采集指标

- 来源成功率。
- 来源失败次数。
- 限流次数。
- parser warning 数。
- 新增工具数。
- 更新工具数。

### 数据指标

- Tool Card 总数。
- 必填字段完整率。
- 过期率。
- 权限未知率。
- possible duplicate 数。
- 低置信记录占比。

### 推荐指标

- golden queries 通过率。
- Top 1 变化数。
- no reliable match 数。
- 高风险候选推荐次数。
- 推荐解释缺失数。

### 运维指标

- 构建时长。
- 发布成功率。
- artifact 大小。
- API 响应时间。
- 旧版本回滚次数。

## 告警规则

阻断发布：

- critical safety eval 失败。
- schema validation 失败。
- manifest 不一致。
- 核心数据文件缺失。
- 权限未知率显著上升。

需要人工查看：

- Top 1 排名大量变化。
- 高风险工具推荐等级上升。
- 新来源带来大量低置信记录。
- 采集失败率连续多次升高。

## 回滚策略

每次发布保留：

- 数据版本。
- 规则版本。
- 索引版本。
- eval report。
- manifest。

回滚步骤：

1. 找到上一稳定 `all-v*` release manifest、Worker deployment id 和 bundle checksum。
2. 优先使用 Cloudflare Worker rollback 恢复上一 Worker deployment；如果不可用，则 checkout 上一不可变 ref、恢复其 immutable reviewed bundle 中的 `dist-pages`，再由 Wrangler 构建 Worker 并部署，不能重新运行 pipeline/eval 生成数据 artifacts。
3. 如果 D1 serving 已启用，使用上一 release 的 `d1_seed.sql` 恢复 D1，或切回上一 active D1 database。
4. 标记失败版本为 `retracted`。
5. 记录失败原因。
6. 新增或更新 eval case 防止复发。

不可只回滚索引而不回滚数据和评分，除非 manifest 明确支持组合版本。标准 `all-v*` 回滚应恢复同一个 Worker deployment 中的 Web、data artifacts 和 MCP/API。

## 数据保留策略

MVP：

- 保留最近 30 天 raw snapshot。
- 保留所有发布 manifest。
- 保留关键 eval report。
- 保留 D1 schema migration。

后续：

- Raw snapshot 如需迁移到对象存储，必须确认免费额度足够。
- 对低价值社区来源快照设置生命周期。
- 人工 override 和发布记录长期保留。

## 成本控制

优先级：

1. 静态文件。
2. Cloudflare Workers Static Assets 免费额度。
3. Cloudflare Workers 免费额度。
4. Cloudflare D1 免费额度。
5. 仅在免费额度可承载时评估 R2。

新增基础设施前必须确认仍在免费额度内，并说明：

- 为什么静态方案不足。
- 免费额度和潜在成本上限。
- 替代方案。
- 迁移和回滚方式。

## 故障处理

| 故障 | 处理 |
| --- | --- |
| 单个来源失败 | 保留旧数据，标记 stale |
| 官方来源全部失败 | 阻止发布并调查来源或采集故障 |
| parser 大量失败 | 回滚 parser 或保留旧版本 |
| 评分异常 | 阻止发布并输出 diff |
| API 不可用 | 回滚 Worker deployment；必要时 Web UI 显示静态数据，MCP 返回错误 |
| 数据污染 | 回滚 manifest，新增安全/数据 eval |

## 维护规则

- 新增基础设施前必须说明成本、替代方案和运维负担。
- 部署方案要优先支持可回放、可回滚和可观测。
- 发布流程不能绕过安全评测。
- MCP API 服务保持只读，除非安全文档另行批准。
