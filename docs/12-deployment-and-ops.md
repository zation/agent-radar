# 12 部署与运维

## 文档用途

本文件定义 Agent Radar 的低成本部署、定时任务、发布、监控、故障处理和回滚方案。

部署目标是支持可回放数据生成、可验证推荐发布和 agent 可查询接口，而不是过早建设复杂平台。

## 运维原则

- MVP 优先静态数据和 GitHub Actions。
- 发布前必须跑 schema、数据质量、安全和推荐评测。
- 每次发布记录数据版本、规则版本和索引版本。
- 失败时保留上一稳定版本。
- 新增基础设施前必须说明成本和替代方案。

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
- SQLite 或 DuckDB。
- 本地 MCP server。

### MVP 发布

用途：

- 发布静态工具数据、评分和索引。
- 提供基础 Web UI。
- 提供轻量 MCP/API 查询。

组件：

- GitHub Actions。
- GitHub Pages 或 Cloudflare Pages。
- 静态 JSON/JSONL artifacts。
- 可选 Cloudflare Workers MCP/API。

### 低成本生产

用途：

- 更稳定的查询接口。
- 更大的数据量。
- 更好的监控和回滚。

组件：

- Cloudflare Pages/Workers。
- Cloudflare R2 或 S3 兼容对象存储。
- SQLite/DuckDB 生成文件，或 Supabase Postgres。
- 简单状态监控。

## MVP 架构

```text
GitHub Actions
  -> crawl/parse/normalize
  -> validate schema
  -> rate
  -> build static index
  -> run eval
  -> publish artifacts
  -> static Web UI / MCP API reads artifacts
```

## 发布产物

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
    "rating": "rating_rules.v1",
    "recommendation": "recommendation_rules.v1"
  },
  "index_version": "index-2026-07-06",
  "eval_report": "reports/eval-data-2026-07-06.md",
  "published_at": "2026-07-06T12:00:00Z"
}
```

## GitHub Actions 流水线

### 定时任务

建议：

- 每日：检查高优先级来源和已知工具状态。
- 每周：运行全量采集、评分、索引和评测。
- 每月：生成数据质量和覆盖报告。
- 手动：新增来源、修复 parser、发布前验证。

### 发布流程

```text
checkout
  -> install dependencies
  -> validate docs links
  -> validate source registry
  -> crawl enabled sources
  -> parse snapshots
  -> normalize tool cards
  -> validate tool cards
  -> run rating engine
  -> build search index
  -> run eval
  -> compare eval diff
  -> publish static artifacts
```

### 发布门槛

必须通过：

- schema validation。
- source registry validation。
- data quality critical checks。
- safety eval critical cases。
- golden queries critical cases。
- index build。
- manifest consistency check。

允许带警告：

- 单个低优先级社区来源失败。
- 少量非关键字段缺失。
- 非 critical golden query 排名轻微变化。

## MCP/API 部署

### MVP 方式

MCP/API 可读取静态 artifacts，不需要写数据库。

支持工具：

- `search_tools`
- `get_tool_card`
- `recommend_tools`
- `explain_rating`

限制：

- 只读。
- 不安装第三方工具。
- 不访问用户 secret。
- 不执行推荐候选。

### Cloudflare Workers 方式

适用条件：

- 静态站点需要跨环境查询。
- 希望提供低成本 HTTP API。

数据读取：

- 小数据：随 Worker 打包或从 Pages asset 读取。
- 中等数据：R2 或 KV。

注意：

- KV 最终一致性可能影响刚发布数据，manifest 应指向稳定版本。

## Web UI 部署

MVP 页面：

- 工具列表。
- 工具详情。
- 推荐查询页。
- 比较页。
- Eval report 页面。

部署建议：

- 静态站点优先。
- 页面读取 manifest 中的数据版本。
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

1. 找到上一稳定 manifest。
2. 将发布指针切回上一版本。
3. 标记失败版本为 `retracted`。
4. 记录失败原因。
5. 新增或更新 eval case 防止复发。

不可只回滚索引而不回滚数据和评分，除非 manifest 明确支持组合版本。

## 数据保留策略

MVP：

- 保留最近 30 天 raw snapshot。
- 保留所有发布 manifest。
- 保留关键 eval report。

后续：

- Raw snapshot 可迁移到对象存储。
- 对低价值社区来源快照设置生命周期。
- 人工 override 和发布记录长期保留。

## 成本控制

优先级：

1. 静态文件。
2. GitHub Actions 免费额度。
3. Cloudflare Pages。
4. Workers 免费/低成本额度。
5. R2/Supabase 等按需引入。

新增付费服务前必须说明：

- 为什么静态方案不足。
- 预估成本。
- 替代方案。
- 迁移和回滚方式。

## 故障处理

| 故障 | 处理 |
| --- | --- |
| 单个来源失败 | 保留旧数据，标记 stale |
| 官方来源全部失败 | 阻止发布或人工确认 |
| parser 大量失败 | 回滚 parser 或保留旧版本 |
| 评分异常 | 阻止发布并输出 diff |
| API 不可用 | Web UI 显示静态数据，MCP 返回错误 |
| 数据污染 | 回滚 manifest，新增安全/数据 eval |

## 维护规则

- 新增基础设施前必须说明成本、替代方案和运维负担。
- 部署方案要优先支持可回放、可回滚和可观测。
- 发布流程不能绕过安全评测。
- MCP/API 服务保持只读，除非安全文档另行批准。
