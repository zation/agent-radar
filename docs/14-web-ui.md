# 14 Web UI

## 文档用途

本文件定义 Agent Radar 当前 Web UI 的信息架构、交互边界、数据来源、视觉规则和验证方式。Web UI 不是营销首页，而是让开发者在同一条路径中描述任务、查看候选、复核风险与证据，并检查推荐评测质量。

## 当前实现

Web UI 使用 React/Vite 构建为 Static Assets，与 HTTP API 和 MCP JSON-RPC endpoint 一起部署到单个 Cloudflare Worker。`src/worker.ts` 处理 `/api/*`，其余请求交给 `ASSETS` binding；不存在独立 Cloudflare Pages 生产部署。

主要入口：

- `src/ui/App.tsx`：artifact 加载与一级页面组合。
- `src/ui/app-shell.tsx`：顶部导航和 release tag。
- `src/ui/tools-workspace.tsx`：Recommend、搜索筛选、工具索引和选择状态。
- `src/ui/tool-detail.tsx`：评分、适用边界、证据与权限详情。
- `src/ui/evaluation-page.tsx`：推荐评测健康度、筛选、query 列表与详情。
- `src/ui/evaluation-view.ts`：Golden Query 与 Eval Result 的保守合并。
- `src/ui/mobile-drill-in.ts`：移动端 list → detail、历史记录和状态恢复。
- `src/ui/data.ts`：浏览器 artifact 数据装配。
- `src/ui/styles.css`：v0.4 设计 tokens 与响应式规则。

## 信息架构

顶部只保留：

- `Tools`
- `Evaluation`

旧 `Recommend` 已合并进 Tools。旧 `Compare`、`Review` 和 golden-query popover 不再进入 Web 导航；其历史纯 helper 暂不影响运行时，后续可独立清理。

### Tools

Tools 页面从上到下为：

1. Recommend 命令区。
2. 搜索与类型筛选。
3. 工具索引。
4. 当前 Tool 详情。

没有任务时，索引按 Rating Result 排序展示完整 reviewed catalog。推荐成功后，API 返回的已知候选直接重排索引；搜索与类型筛选作用于当前候选集合，不生成第二层结果卡片。

Recommend 使用自适应展开：

- 首次访问或无任务时展开。
- Loading 保持展开并显示分析状态。
- Success 自动折叠，只显示任务摘要和候选数量。
- `ask_human`、`no_reliable_match` 和 provider/request error 保持展开，在输入框下显示单行状态。
- `ask_human` 使用 amber；`no_reliable_match` 使用中性状态；只有真实请求失败使用 red。
- Edit 重新展开；Clear task 清除任务与推荐排序。

Recommend 继续调用同一 Worker 的 `/api/recommend_tools`。API key 只用于当前 BYOK 请求，不持久化、不进入响应体，浏览器不直连 provider。

### Tool 详情

详情按决策优先级显示：

1. 工具身份、总分与风险。
2. 当前任务原因；无任务时使用 Rating explanation。
3. Decision、Evidence、Maintenance、Integration 快速字段。
4. 无外层卡片的 Good for / Not for。
5. Decision signals 分项评分。
6. 主要来源、权限、安全说明和最后验证时间。

总分不能替代风险、权限、证据或不适用边界。v0.4 P1 在评分说明下方渲染真实 thumb up/down 反馈：匿名用户可读聚合，登录用户可查看、切换或取消自己的当前投票。成功添加或切换后才显示可选 GitHub Issue Form Dialog；点击 `Add details` 在新标签打开 Issue Form 后立即关闭当前 Dialog，取消不弹窗，失败回滚 optimistic state 并显示一行错误。顶部 release tag 旁提供 Sign in 或公开用户名与 Sign out。

### Evaluation

`Evaluation` 是推荐透明度页面；`golden queries` 是页面解释的评测方法，不作为一级导航名。

页面读取同一 reviewed bundle 中的：

- `golden_queries.json`
- `eval_summary.json`

浏览器只合并定义与结果，不重跑评测。任一 case 缺少结果时，UI 保守显示失败；只有 suite 完整、0 failure、critical 4/4 且不 release-blocking 时显示全部通过。

页面展示 pass rate、critical cases、evaluated release、case 筛选、为什么需要该 query、预期/实际动作、风险、top candidate、更新时间和阻断含义。状态使用 check/warning；release/commit 使用 tag icon，不把版本误标成时间。

## 响应式与无障碍

桌面端 Tools 与 Evaluation 使用列表 + 详情双栏。

桌面端 Tool 与 Evaluation 索引列表使用 `max(60vh, 640px)` 最大高度；记录超出后仅列表内部纵向滚动，详情栏继续按页面正常流展示。移动端不限制列表高度。

低于 `900px` 时：

- 顶部仍显示 Tools / Evaluation。
- Tools 点击工具后进入独立详情，并隐藏 Recommend、筛选和列表。
- Evaluation 点击 query 后进入独立详情。
- 浏览器 Back 或页面 Back 恢复列表、筛选、任务状态和滚动位置。
- filters 可横向滚动，主要控件保持触屏尺寸。

所有交互支持键盘与可见 focus；颜色不单独承担状态或选中含义；动画尊重 `prefers-reduced-motion`。

## 视觉规范

当前 UI 是“浅色可信情报终端”：

- Canvas `#edf2f0`，Surface `#f9fbfa`，Ink `#17302a`。
- Trust `#087d69`，Caution `#d2932a`，Error `#c95648`。
- Geist 用于内容；系统等宽字体只用于版本、状态、类型、字段标签和分数。
- 普通控件约 4px 圆角，命令区和独立功能容器约 5–8px。
- 列表和详情依靠排版与分隔线，不使用默认 shadcn Card 网格。
- Tools 的唯一强视觉锚点是深绿 Recommend 命令区。
- 状态使用图标与文字，选中使用背景/左 rail，强调使用排版层级；三者不复用同一种视觉。

CSS class 使用 kebab-case。`dist-pages/` 不进入版本控制。

### 组件与样式职责

- shadcn/Base UI primitives 负责 Button、Input、Textarea、Select、ToggleGroup 和 Progress 的语义、键盘行为与 pointer、hover、active、focus-visible 状态。
- Tailwind utilities 负责页面 layout、spacing、typography、responsive 和 Agent Radar 的 selected/status 视觉；页面层不重复维护 primitive 已提供的交互状态。
- `src/ui/styles.css` 只保留 imports、theme token 映射、字体与全局基础规则。
- 可见标签不低于 `text-xs`，表单、按钮、列表主文本和正文使用 `text-sm` 或 `text-base`；源码契约测试禁止 7–11px 字号回归。
- 静态 UI chrome 使用英文。Golden Query `query.task`、`review_notes` 和其他 artifact 原文保持不变，其英文化属于 v0.5。

## 数据流

```text
release pipeline
  -> tool_cards.jsonl + ratings.jsonl + golden_queries.json + eval_summary.json
  -> immutable reviewed bundle / dist-pages
  -> Cloudflare Worker
       -> Static Assets: Web UI + data artifacts
       -> HTTP API: /api/*
       -> MCP JSON-RPC: /api/mcp

Browser
  -> src/ui/data.ts -> Tools / Evaluation
  -> /api/recommend_tools -> Worker recommendation engine -> LLM provider
```

本地 `ensure-dev-data` 必须准备 Tool Cards、Ratings、Search Index、Golden Queries 和 Eval Summary；不再下载仅服务旧 Review 页的 artifact。

## 交互边界

Web 允许：

- 搜索、筛选和选择 reviewed Tool Cards。
- 输入任务、model、risk tolerance 和当前请求 API key。
- 查看任务候选、评分解释、风险、权限、证据和适用边界。
- 查看只读 Recommendation Evaluation。

Web 不允许：

- 安装、授权或执行第三方工具。
- 保存 API key、secret、邮箱内容、私有代码或人工确认答案。
- 绕过 `ask_human`。
- 在浏览器重算评分或 golden eval。
- 在 OAuth/D1 vote adapter 完成前伪造反馈写入。
- 浏览器直连第三方 provider 或运行时修改 Provider registry。

## 验证要求

```bash
npm run stylelint
npm run lint
npm test
npm run pages:build
```

浏览器验证至少覆盖：

- Tools idle、loading、success、Edit、Clear、ask-human、no-match 和 provider error。
- 搜索、类型筛选、候选排序和 Tool 详情。
- Evaluation all/critical/action filters 与 case 详情。
- `1440 × 1000` 桌面布局。
- `390 × 844` Tools/Evaluation drill-in 与浏览器返回。
- 键盘 focus、无横向页面溢出和 reduced motion。

涉及推荐逻辑、数据装配或 artifacts 时，按范围追加 `npm run eval` 和 `npm run pipeline`。
