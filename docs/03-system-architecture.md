# 03 系统架构

## 文档用途

本文件描述 Agent Radar 的系统模块、数据流、接口边界和部署形态。它用于指导代码结构和技术选型。

## 应包含内容

- 核心模块：source registry、crawler、raw snapshot store、normalizer、rating engine、search index、recommendation engine、MCP server、Web UI、eval runner。
- 数据流：来源发现 -> 原始抓取 -> 标准化 -> 分类 -> 评分 -> 索引 -> 查询推荐。
- 模块边界：每个模块输入、输出、依赖和失败处理。
- 技术选型建议：TypeScript 或 Python、JSONL、SQLite/DuckDB、GitHub Actions、Cloudflare Pages/Workers。
- 扩展点：新增来源、新增工具类型、新增评分规则、新增推荐策略。

## 后续生成提示词

```text
请为 Agent Radar 生成系统架构文档。请描述模块划分、数据流、接口边界、存储选择、任务调度、MCP 服务、Web UI、评测系统和自迭代机制。要求每个模块说明职责、输入、输出、依赖、错误处理和测试方式。内容使用中文，技术方案优先低成本、易维护、适合 coding agent 迭代。
```

## 维护规则

- 新增模块前必须说明为什么现有模块无法承载。
- 架构文档应反映真实代码结构，不做脱离实现的蓝图。
