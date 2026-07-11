# 14 Web UI

## v0.3 P2 推荐安全展示

Recommend 结果区显示总体风险、release ID、短 commit SHA、人工确认原因、“使用前确认事项”和安全默认值。确认事项是只读列表；Web 不提供输入框、确认状态、回答持久化、重新推荐或授权/执行按钮。

## 文档用途

本文件定义 Agent Radar Web UI 的信息架构、页面结构、数据来源、交互边界和验证方式。它用于指导由 Cloudflare Worker Static Assets 提供的公开站点设计、实现和后续维护。

Web UI 的目标不是做营销首页，而是把 Tool Card、评分、风险、来源和推荐结果以可审核、可比较、可解释的方式呈现给人类开发者和项目维护者。

## UI 原则

- 以工具选择和推荐解释为主路径，不做新闻流或宣传页。
- 信息密度适中，优先支持扫描、比较和复核。
- 不隐藏低置信、高风险、权限和不适用条件。
- UI 不生成不同于 API 的推荐逻辑；推荐结果必须来自共享推荐引擎或同源 artifacts。
- 默认只读，不安装、不授权、不执行第三方工具。Recommend 提交会把当前请求的 API key 发送给同一 Worker 的后端 API 用于 LLM 调用，但不持久化。
- Web、JSON artifacts、HTTP API 和 MCP JSON-RPC endpoint 由单个启用 Static Assets 的 Cloudflare Worker 提供，避免引入额外部署单元或付费服务。

## 当前实现

当前 MVP UI 是 React/Vite 静态前端。构建后的 `dist-pages/` 与 HTTP API、MCP JSON-RPC endpoint 一起部署到单个 Cloudflare Worker；`src/worker.ts` 将非 `/api/*` 请求交给 `ASSETS` binding，并处理 `/api/*` 请求。当前不存在独立的 Cloudflare Pages 生产部署。

主要入口：

- `index.html`
- `src/ui/App.tsx`
- `src/ui/data.ts`
- `src/ui/styles.css`
- `src/worker.ts`
- `wrangler.toml`

本地命令：

```bash
npm run dev -- --port 4173
npm run pages:build
npm run stylelint
```

`pages:build` 是保留的历史脚本名，实际执行 Vite build 并生成 Worker Static Assets 使用的 `dist-pages/`，不表示发布到 Cloudflare Pages。

UI 读取的发布 artifacts：

- `public/data/tool_cards.jsonl`
- `public/data/ratings.jsonl`
- `public/data/eval_summary.json`
- `public/data/source_registry_review_requests.json`

## 信息架构

MVP 使用顶部导航切换主要页面：

- `Tools`
- `Recommend`
- `Compare`
- `Review`

每个页面服务不同任务，避免把搜索和推荐混在一个工作区里。发布质量检查不再占用独立页面，而是收纳在右上角 `golden queries` 状态弹层中。

### Tools 页面

职责：

- 展示当前数据版本中的 Tool Cards。
- 支持按工具类型筛选。
- 支持按名称、摘要、标签和用途搜索。
- 显示工具类型、推荐等级和总分。
- 展示选中工具的详情、评分解释、风险和证据。

当前支持类型：

- `skill`
- `mcp`
- `agent`

后续扩展到 `framework`、`cli`、`prompt`、`rules` 时，应优先复用同一筛选模型。

布局：

- 左侧：工具列表、搜索、类型筛选。
- 右侧：工具详情和基础比较区域。

Tools 页面不显示推荐输入，也不显示推荐结果。

### 工具详情

职责：

- 展示选中 Tool Card 的核心字段。
- 展示评分总分、推荐等级、风险等级和证据质量。
- 展示 Rating Result 的分项评分。
- 展示适用场景和不适用场景。
- 暴露来源、权限和安全说明。

详情页不得只展示总分。任一工具推荐都应能追溯到：

- Tool Card 字段。
- Rating Result。
- 来源证据。
- 风险和权限说明。

### Recommend 页面

职责：

- 允许用户输入自然语言需求。
- 允许用户输入 API key。
- 允许用户选择大模型。
- 选择风险偏好。
- 点击 `Submit` 后显示提交中状态。
- 推荐成功后自动折叠输入区，优先展示候选列表。
- 允许用户再次展开输入区重新编辑需求。
- 展示推荐动作和候选工具列表。
- 选择某个推荐候选后，在右侧展示与 Tools 页面一致的工具详情。
- 对高风险场景显示 `ask_human` 或 `no_reliable_match`。

当前 Recommend 页面通过同一 Worker 的 `/api/recommend_tools` 调用后端 LLM 推荐引擎。API key 是 BYOK 请求参数，只用于本次 LLM 调用，不写入持久化存储、不进入响应体。浏览器不直接请求第三方 provider。

当前模型下拉由构建期共享的 `src/recommendation/provider-registry.ts` 经 `src/ui/provider-options.ts` 提供，不在浏览器运行时读取 `data/provider_registry.json`。现有浏览器到 Worker、Worker 到 provider 的后端代理路径继续使用；更完整的 Provider runtime 配置 UI、浏览器运行时 registry 加载，以及 direct-to-provider 与 proxy 模式选择进入 Backlog。

布局：

- 左侧：可折叠的需求输入区、API key、模型选择、风险偏好、提交按钮和推荐列表。
- 右侧：当前选中推荐候选的 Tool Card 详情。

交互：

- 初始状态展开输入区，按钮文案为 `Submit`。
- 提交中按钮显示 loading spinner，避免用户误以为点击无效。
- 提交成功后输入区折叠成需求摘要和模型/风险信息。
- 折叠摘要或 `Edit input` 可以重新展开输入区。

LLM 输出必须保留底层 Tool Card、Rating Result、风险和来源证据引用。UI 不能把 LLM 生成内容呈现成无证据的事实。

### Eval 状态弹层

职责：

- 显示 golden queries 通过情况。
- 展示每个 eval case 的推荐动作。
- 帮助维护者判断当前数据版本是否可发布。

入口：

- 顶部右侧动态显示 `passed/total golden queries` 状态控件；当前已验证 v0.2 基线为 `10/10`。
- hover 或键盘 focus 后显示 eval 明细。

UI 中的 eval 状态来自 `public/data/eval_summary.json`，不应在浏览器端重新计算。Eval 是固定发布质量检查，不随 Recommend 页的输入动态变化，也不作为独立导航页面呈现。

### Compare 页面

职责：

- 提供最多 4 个 Tool Cards 的同屏比较。
- 展示评分、风险、证据、权限、适用场景和不适用场景。
- 服务候选排序检查和 production gate 前的审核证据扫描。

MVP 比较能力保持轻量。批量筛选和排序解释可以放到 v0.2 后续迭代。

### Review 页面

职责：

- 读取 `source_registry_review_requests.json`。
- 作为只读的 production-gate evidence/audit surface，展示 Source Registry 中待 production gate 关注的证据摘要。
- 标出需要 production gate 关注的高影响来源字段。
- 展示 review reason 和 suggested action。

Review 页面只读展示 immutable reviewed bundle 中的审核证据和提示，不是逐条人工审批工作台。默认审核由 validation、脚本/规则、LLM eval、auto review、release admission 和 promotion check 完成并持久化证据；GitHub `production` environment gate 是唯一的常规人工发布确认。

页面不生成逐条人工审核 JSON，不在浏览器端写入 artifact，也不自动确认来源、启用 crawler 或发布 Tool Card。`Approval Record` 仅用于有证据的 break-glass override，不是 v0.2 的常规 UI 流程。

### Feedback 入口

v0.4 UI 应在视觉和交互重构后增加轻量 Tool Card 反馈入口，让使用端信号进入点评和评测闭环。

建议入口：

- Tool Card：GitHub 登录后点赞、点踩或取消；同一用户只保留一条当前投票。
- Tool Card：可选打开预填的 GitHub Issue Form，提交字段错误、文档过期、安装失败、权限超出预期等具体原因。
- 公开展示聚合赞踩数，不展示投票用户名或用户列表。

反馈提交是写操作，不属于当前 MVP/v0.2/v0.3 只读 UI 边界。v0.4 P1 使用最小 GitHub OAuth 和 D1 唯一投票记录；Agent Radar 不存储反馈自由文本，具体原因由用户在 GitHub Issue Form 中填写。v0.4 P2 在构建期按 `feedback_rules.v0.1` 统一生成上限为 `-3` 到 `+3` 的评分调整，反馈不能降低安全风险等级或提升来源 trust level。

## 视觉规范

当前 UI 采用操作型知识库风格：

- 白色和浅灰背景。
- 深色正文。
- Teal 用于可信、通过和主操作。
- Amber 用于高风险、人工确认和无可靠候选。
- 组件圆角不超过 8px。
- 避免嵌套卡片、营销 hero、装饰渐变和大面积插画。
- 优先使用图标表达工具和状态，避免用大号说明文字解释功能。

CSS 维护规则：

- 样式入口为 `src/ui/styles.css`。
- class 使用 kebab-case。
- 修改样式后运行 `npm run stylelint`。
- 构建产物 `dist-pages/` 不进入版本控制。

## 数据流

```text
release pipeline
  -> immutable reviewed bundle / dist-pages
  -> Cloudflare Worker
       -> Static Assets: Web UI + versioned JSON artifacts
       -> HTTP API: /api/*
       -> MCP JSON-RPC: /api/mcp

Browser
  -> Static Assets -> src/ui/data.ts -> src/ui/App.tsx
  -> /api/recommend_tools -> Worker recommendation engine -> LLM provider
```

UI 的数据装配由 `src/ui/data.ts` 负责：

- `parseJsonl`：解析 JSONL artifacts。
- `createToolViewModels`：把 Tool Card 与 Rating Result 关联。
- `sourceReviewRequests`：把 Source Registry production-gate evidence 提供给只读 Review 页面。

Recommend 页不在浏览器端运行本地推荐逻辑。提交后由同一 Worker 的 API 调用 LLM 推荐引擎并返回 `Recommendation Result`。Tool Cards、Ratings、Eval Summary 和 Source Registry review evidence 均来自与 Worker 同一次发布的 Static Assets，HTTP API 也读取该 deployment 内的同源 artifacts。

UI 与 API 输出必须保持和 `docs/04-data-model.md`、`docs/09-recommendation-engine.md` 一致。

## 交互边界

MVP Web UI 允许：

- 搜索和筛选本地 artifacts。
- 查看 Tool Card 和评分解释。
- 输入推荐任务并查看推荐结果。
- 输入 API key 和从构建期模型列表中选择模型，用于本次经 Worker 代理的 BYOK LLM 推荐请求。
- 折叠和重新展开 Recommend 输入区。
- 通过右上角状态弹层查看 eval 状态。
- 比较少量候选。
- 查看 Source Registry production-gate evidence 摘要和 suggested action。

MVP Web UI 不允许：

- 安装第三方工具。
- 存储、记录或把用户 API key、secret、token、邮箱内容或私有代码写入 artifacts、日志或页面状态以外的持久位置。
- 持久化修改 Tool Card、评分规则、review records 或来源数据。
- 绕过 `ask_human` 执行高风险动作。
- 把 UI 侧结果写回数据源。
- 提交持久化反馈记录；该能力进入 v0.4 P1，并受 GitHub 登录、唯一约束、Origin 检查和基础限流保护。
- 在浏览器运行时修改 Provider 配置、读取 Provider registry 或直连第三方 provider；这些能力进入 Backlog。

如需增加写操作、用户反馈或人工 override UI，必须同步更新安全、数据模型、推荐和部署文档。

## 验证要求

修改 UI 后至少运行：

```bash
npm run stylelint
npm run lint
npm test
npm run pages:build
```

其中 `pages:build` 仅是历史命名的 Static Assets 构建命令。生产部署和 smoke 由单 Worker release workflow 完成，不包含 Cloudflare Pages 部署步骤。

涉及推荐展示或数据装配时，还应运行：

```bash
npm run eval
npm run pipeline
```

人工或浏览器验证应覆盖：

- 页面非空渲染。
- 无框架错误 overlay。
- 无 console error。
- 桌面工作区布局可读。
- 移动视口无横向溢出。
- Recommend `Submit` 有 loading 状态，完成后折叠输入区并更新结果。
- 折叠后的 Recommend 输入摘要可重新展开。
- 右上角 golden queries hover/focus 后显示 eval 明细。
- 高风险场景显示 `ask_human` 或 `no_reliable_match`。
- eval 状态与 `eval_summary.json` 一致。

## 维护规则

- 新增页面前先确认它服务工具选择、推荐解释或 production gate 前的审核证据扫描。
- UI 文案应来自数据、评分或推荐结果，避免编造营销描述。
- 任何新视觉状态都应有对应数据状态或交互状态。
- 与 API 输出重复的展示逻辑应抽到共享数据模型或 helper，避免前后端语义漂移。
- UI 不能降低风险等级，也不能把 `ask_human` 呈现成可直接执行。
- Review 页面保持只读 evidence/audit 语义，不增加逐条人工审批表单或人工审核 JSON 生成器。
- Provider runtime 配置 UI、浏览器读取 `provider_registry.json` 和 direct-to-provider 模式属于 Backlog；若要启动，必须先更新产品、架构、安全和部署边界。
