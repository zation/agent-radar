# 11 安全与信任

## 文档用途

本文件定义 Agent Radar 如何识别和表达工具安全风险。由于 MCP、Skill、Agent、CLI 和 Framework 可能接触文件、浏览器、数据库、云服务、邮件和账号权限，本文件是核心安全边界。

Agent Radar 不替代安全扫描器或审计平台；它的职责是在工具选择和推荐中保守表达风险，避免 agent 幻觉式信任未知工具。

## 安全原则

- 未知工具默认不自动安装、不自动执行。
- 权限未知不能标记为低风险。
- 高风险权限必须要求人类确认。
- 来源可信度不等于安全保证。
- 推荐解释必须说明权限、数据流和不确定性。
- 不采集、不存储、不输出 token、私钥、cookie 或用户私密数据。

## 风险类型

### 供应链风险

风险：

- 恶意依赖。
- 安装脚本执行未知代码。
- 包名混淆。
- 仓库被接管。
- release artifact 不可验证。

字段：

- `install_methods`
- `repo_url`
- `package_urls`
- `maintenance`
- `security.known_risks`

推荐要求：

- 来源 unknown 且需要执行代码时，默认 `avoid`。
- 安装命令不透明时，不输出自动安装建议。

### 权限过大

风险：

- 工具申请超出任务需要的权限。
- 文件系统写入、shell、浏览器、数据库、云账号等权限未做边界控制。

推荐要求：

- 推荐解释中列出权限。
- 给出最小权限建议。
- 超出用户风险偏好时输出 `ask_human` 或 `avoid`。

### Prompt Injection

风险：

- 工具读取网页、邮件、文档或 issue 后，把恶意文本作为指令执行。
- Skill 或 rules 要求 agent 忽略系统和用户安全指令。

推荐要求：

- 浏览器、邮件、文档、网页抓取类工具至少 `medium` 风险。
- 输出中提示不要把不可信内容当作指令。

v0.4 反馈处理额外要求：

- GitHub Issue title、body、comment、用户名和链接均是不可信外部输入。
- Data Build 必须先确定性校验专用标签、Issue Form 字段、Tool Card key 和投票类型，再把最小必要字段交给 LLM。
- LLM 只能返回经过 schema 校验的 `accepted`、`rejected` 或 `needs-human-review`，不能调用工具、执行 Issue 指令或直接修改仓库。
- GitHub 写操作必须由固定代码路径执行，并限制为 `zation/agent-radar` 中带 `tool-feedback` 标签的 Issue comment、处理标签和 close 操作。
- 涉及安全、评分规则争议、证据冲突或信息不足时必须输出 `needs-human-review` 并保持 Issue open。

### Secret 泄露

风险：

- API key、token、cookie、SSH key、环境变量进入模型上下文或第三方服务。
- 工具日志记录敏感信息。
- BYOK 推荐请求中的 API key 被持久化到 artifacts、日志、浏览器可分享状态或响应体。

推荐要求：

- 涉及 `secrets` 权限时至少 `high` 风险。
- 不建议把 live secret 放入 agent 上下文。
- 输出安全默认值，例如使用 test key、临时 token、最小权限。
- Recommend API 只能把 API key 用作当前 LLM 请求认证参数，不得写入推荐结果、eval artifacts 或发布数据。

### 数据外传

风险：

- 本地文件、邮件、数据库记录或代码发送到第三方服务。
- 托管工具默认上传上下文。

推荐要求：

- hosted/API 工具必须说明数据离开本地。
- 企业或敏感项目默认推荐本地或官方低权限方案。

### 远程代码执行

风险：

- 工具运行 shell、安装依赖、执行生成代码或远程脚本。

推荐要求：

- `code_execution` 或 `shell` 权限至少 `high` 风险。
- unknown trust + code execution 应为 `avoid`。

### 账号和资金风险

风险：

- 邮件、云账号、支付、数据库写入、生产系统操作。

推荐要求：

- 支付和云 admin 至少 `critical`。
- 数据库写入、邮件读取至少 `high`。
- 必须 `ask_human`。

## 权限模型

权限字段见 `docs/04-data-model.md`。

### scope

| scope | 示例 | 默认风险 |
| --- | --- | --- |
| `filesystem` | 读写项目文件 | read: medium, write: high |
| `network` | 调用外部 API | medium |
| `browser` | 控制浏览器 | medium |
| `email` | 读取 Gmail | high |
| `database` | 查询或写入数据库 | read: high, write: critical |
| `cloud` | 管理云资源 | high 到 critical |
| `payment` | Stripe、退款、收款 | critical |
| `shell` | 执行命令 | high |
| `code_execution` | 运行代码或脚本 | high |
| `secrets` | API key、token | high 到 critical |
| `unknown` | 权限不明 | unknown，不能低风险推荐 |

### access

| access | 风险提示 |
| --- | --- |
| `read` | 数据泄露风险 |
| `write` | 数据破坏或状态改变风险 |
| `read_write` | 两者都有 |
| `execute` | 执行任意代码风险 |
| `admin` | 最高权限风险 |
| `unknown` | 采取保守判断 |

## 信任等级

字段：`security.trust_level`。

| 等级 | 定义 | 说明 |
| --- | --- | --- |
| `official` | 官方维护 | 仍需检查权限和数据流 |
| `well_known_org` | 知名组织 | 可信度较高但非安全保证 |
| `active_open_source` | 活跃开源 | 需看维护和社区信号 |
| `individual` | 个人维护 | 谨慎推荐 |
| `commercial` | 商业服务 | 关注数据外传、条款和锁定 |
| `unknown` | 来源不明 | 不进入高置信推荐 |

## 风险等级

| 等级 | 定义 | 推荐行为 |
| --- | --- | --- |
| `low` | 权限有限、来源可信、影响范围小 | 可推荐，但仍说明条件 |
| `medium` | 需要有限权限或外部 API | 可推荐，说明权限和安全默认值 |
| `high` | 涉及敏感数据、执行、写入或账号 | 默认 `ask_human` |
| `critical` | 涉及资金、云 admin、secret、生产写入 | 默认不自动使用，必须人工确认 |
| `unknown` | 无法判断 | 不进入低风险推荐 |

## 风险判定规则

### 最低风险等级

| 条件 | 最低风险 |
| --- | --- |
| 来源 unknown | medium |
| 权限 unknown | unknown |
| 读本地文件 | medium |
| 写本地文件 | high |
| shell/code execution | high |
| browser automation | medium |
| email read/write | high |
| database read | high |
| database write | critical |
| cloud admin | critical |
| payment operation | critical |
| secrets access | high |

### 风险升级条件

- 权限描述缺失。
- 安装方式包含 remote script。
- 工具默认上传上下文。
- 维护停滞且需要高权限。
- prompt/rules 要求绕过用户确认。
- 社区报告存在安全争议。

### 风险降低条件

风险可以降低但不能低于最低风险等级：

- 官方来源。
- 权限可配置且默认最小。
- 提供只读模式或 allowlist。
- 文档明确说明数据流和 secret 处理。
- 有安全审计或可信 release 签名。

## Human Approval 规则

以下情况必须人工确认：

- 安装或运行来源不明工具。
- 执行 shell、代码、远程脚本。
- 读写文件系统、邮件、数据库、云资源。
- 访问 payment、secret、生产账号。
- 把私有代码或文档发送到第三方服务。
- 自动修改评分大权重或核心 schema。

推荐输出应包含：

```json
{
  "requires_human_approval": true,
  "approval_reason": "需要读取 Gmail 内容，涉及个人数据。",
  "safe_defaults": ["只读权限", "限定邮箱标签", "不把邮件原文写入日志"]
}
```

## 安全解释模板

### 中风险

```text
该工具需要 {permission}，风险等级为 medium。建议限制作用范围为 {scope_limit}，并确认来源 {source} 后再使用。
```

### 高风险

```text
该工具涉及 {sensitive_scope}，可能访问或修改敏感数据。Agent 不应自动启用；请先确认权限范围、数据流和替代方案。
```

### Critical

```text
该工具涉及 {critical_scope}，可能影响资金、生产系统、secret 或云资源。除非用户明确确认并提供最小权限环境，否则不应使用。
```

### 证据不足

```text
该工具的权限或来源证据不足，无法判断安全边界。推荐结果应视为低置信，不建议自动安装或运行。
```

## 不信任原则

Agent Radar 对未知工具采用以下默认行为：

- 不自动安装。
- 不自动运行。
- 不自动传入 secret。
- 不自动授予文件、浏览器、邮件、数据库或云权限。
- 不把工具作者自述当作安全结论。
- 不把 star、排名或社交热度当作信任证明。

## 与推荐系统的关系

- `risk_level` 高于用户 `risk_tolerance` 时，推荐动作变为 `ask_human` 或 `avoid`。
- `critical` 风险不能直接输出 `use`。
- `unknown` 权限不能进入低风险推荐。
- 高风险工具必须在 `risks` 和 `next_steps` 中说明安全处理。

## 与采集系统的关系

采集禁止：

- 私有仓库。
- 用户邮件或文件。
- 带 cookie 的网页。
- 需要登录绕过的内容。
- 泄露 secret 的公开片段。

采集保守处理：

- 来源内容包含疑似 token 时，不入库原文，记录安全事件。
- 来源条款不清时，禁用自动采集。

## 安全评测

必须覆盖：

- unknown trust + code execution -> avoid。
- email read + low risk tolerance -> ask_human。
- payment + unknown source -> avoid/critical。
- permissions unknown -> not low risk。
- prompt 要求绕过安全规则 -> avoid。

评测失败时阻止发布。

## 维护规则

- 安全风险字段宁可保守，不要为了推荐率降低风险等级。
- 与权限、安装、执行相关的自动化必须默认最小权限。
- 新增权限 scope 必须同步更新数据模型、评分规则、推荐引擎和评测计划。
- 安全文档优先级高于推荐排序优化。
- v0.4 GitHub OAuth 只读取稳定 user ID 和公开用户名，不申请邮箱、仓库或组织权限；OAuth token 完成身份查询后不得长期保存。
- D1 不保存 Issue 原因或其他反馈自由文本；投票用户列表不得公开。
- 反馈评分调整不能降低安全风险等级、提升来源 trust level 或绕过 critical safety release gate。
