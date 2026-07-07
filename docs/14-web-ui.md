# 14 Web UI

## 文档用途

本文件定义 Agent Radar Web UI 的信息架构、页面结构、数据来源、交互边界和验证方式。它用于指导 Cloudflare Pages 公开站点的设计、实现和后续维护。

Web UI 的目标不是做营销首页，而是把 Tool Card、评分、风险、来源和推荐结果以可审核、可比较、可解释的方式呈现给人类开发者和项目维护者。

## UI 原则

- 以工具选择和推荐解释为主路径，不做新闻流或宣传页。
- 信息密度适中，优先支持扫描、比较和复核。
- 不隐藏低置信、高风险、权限和不适用条件。
- UI 不生成不同于 API 的推荐逻辑；推荐结果必须来自共享推荐引擎或同源 artifacts。
- 默认只读，不安装、不授权、不执行第三方工具。
- 优先使用 Cloudflare Pages 静态能力和 JSON artifacts，避免引入付费服务。

## 当前实现

当前 MVP UI 是 Cloudflare Pages 风格的 React/Vite 静态应用。

主要入口：

- `index.html`
- `src/ui/App.tsx`
- `src/ui/data.ts`
- `src/ui/styles.css`

本地命令：

```bash
npm run dev -- --port 4173
npm run pages:build
npm run stylelint
```

UI 读取的发布 artifacts：

- `public/data/tool_cards.jsonl`
- `public/data/ratings.jsonl`
- `public/data/eval_summary.json`

## 信息架构

MVP 使用三栏工作台布局：

### 工具列表

职责：

- 展示当前数据版本中的 Tool Cards。
- 支持按工具类型筛选。
- 支持按名称、摘要、标签和用途搜索。
- 显示工具类型、推荐等级和总分。

当前支持类型：

- `skill`
- `mcp`
- `agent`

后续扩展到 `framework`、`cli`、`prompt`、`rules` 时，应优先复用同一筛选模型。

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

### 推荐查询

职责：

- 允许用户输入自然语言任务。
- 选择风险偏好。
- 展示推荐动作和候选工具。
- 对高风险场景显示 `ask_human` 或 `no_reliable_match`。

当前推荐查询直接复用 `src/recommendation/engine.ts` 的本地逻辑。后续接入 Workers API 时，前端展示结构不应改变推荐语义。

### 评测状态

职责：

- 显示 golden queries 通过情况。
- 展示每个 eval case 的推荐动作。
- 帮助维护者判断当前数据版本是否可发布。

UI 中的 eval 状态来自 `public/data/eval_summary.json`，不应在浏览器端重新计算。

### 比较区域

职责：

- 提供基础同屏比较。
- 展示名称、类型、风险和总分。
- 服务人工审核和候选排序检查。

MVP 比较能力保持轻量。复杂比较表、批量筛选和排序解释可以放到 v0.2 后续迭代。

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
Tool Cards JSONL
  + Ratings JSONL
  + Eval Summary JSON
  -> src/ui/data.ts
  -> src/ui/App.tsx
  -> Cloudflare Pages static UI
```

UI 的数据装配由 `src/ui/data.ts` 负责：

- `parseJsonl`：解析 JSONL artifacts。
- `createToolViewModels`：把 Tool Card 与 Rating Result 关联。
- `recommendFromViewModels`：在本地预览中复用推荐引擎。

生产环境可以改为读取 Workers API，但必须保持输出字段与 `docs/04-data-model.md`、`docs/09-recommendation-engine.md` 一致。

## 交互边界

MVP Web UI 允许：

- 搜索和筛选本地 artifacts。
- 查看 Tool Card 和评分解释。
- 输入推荐任务并查看推荐结果。
- 查看 eval 状态。
- 比较少量候选。

MVP Web UI 不允许：

- 安装第三方工具。
- 请求用户 secret、token、邮箱内容或私有代码。
- 修改 Tool Card、评分规则或来源数据。
- 绕过 `ask_human` 执行高风险动作。
- 把 UI 侧结果写回数据源。

如需增加写操作、用户反馈或人工 override UI，必须同步更新安全、数据模型、推荐和部署文档。

## 验证要求

修改 UI 后至少运行：

```bash
npm run stylelint
npm run lint
npm test
npm run pages:build
```

涉及推荐展示或数据装配时，还应运行：

```bash
npm run eval
npm run pipeline
```

人工或浏览器验证应覆盖：

- 页面非空渲染。
- 无框架错误 overlay。
- 无 console error。
- 桌面三栏布局可读。
- 移动视口无横向溢出。
- 推荐查询按钮能更新结果。
- 高风险场景显示 `ask_human` 或 `no_reliable_match`。
- eval 状态与 `eval_summary.json` 一致。

## 维护规则

- 新增页面前先确认它服务工具选择、推荐解释或人工审核。
- UI 文案应来自数据、评分或推荐结果，避免编造营销描述。
- 任何新视觉状态都应有对应数据状态或交互状态。
- 与 API 输出重复的展示逻辑应抽到共享数据模型或 helper，避免前后端语义漂移。
- UI 不能降低风险等级，也不能把 `ask_human` 呈现成可直接执行。
