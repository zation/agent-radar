# 05 Taxonomy

## Document Purpose

This document defines how Agent Radar classifies tools. Taxonomy supports filtering, rating, recommendation, risk explanation, and agent-readable output.

The goal is not to classify everything. It is to help users and coding agents decide what a tool is, what it fits, how it integrates, how risky it is, and how trustworthy the evidence is.

## Principles

- One primary type per tool, with optional secondary types and multiple tags.
- Categories must serve recommendation and explanation, not unlimited display.
- Uncertain classifications record confidence and rationale.
- Enums stay aligned with `docs/04-data-model.md`.
- Safety categories stay aligned with `docs/11-security-and-trust.md`.

## Dimensions

| Dimension | Field | Purpose |
| --- | --- | --- |
| Tool type | `type`, `secondary_types` | Select rating rules and integration |
| Purpose | `tags`, `primary_purpose` | Task match and retrieval |
| Usage | `usage_mode` | Estimate integration cost |
| Source trust | `security.trust_level` | Risk and evidence weight |
| Permission risk | `permissions`, `security.risk_level` | Safety filtering |
| Maturity | `maturity`, `maintenance.status` | Recommendation order |
| Supported agent | `supported_agents` | Agent decision |

## Tool Types

### `mcp`

A server or tool collection exposing tools, resources, or prompts through Model Context Protocol.

Criteria: explicitly provides an MCP Server, documents supported-client connection, and primarily exposes external capabilities to agents.

Examples: filesystem, GitHub, and database-query MCP Servers.

Boundary: a CLI that starts an MCP Server is `mcp` primary and `cli` secondary when MCP is the principal usage.

### `skill`

Reusable instructions, workflows, references, or capability packages for coding agents.

Criteria: primarily natural-language rules, steps, templates, or resources; triggered through an agent Skill/Plugin mechanism; executable code is optional.

Examples: OpenAI API documentation lookup, frontend building, and analytical-report Skills.

Boundary: a prompt-only project without workflow boundaries is `prompt`.

### `agent`

A product or project that independently plans tasks and invokes tools.

Criteria: has an execution loop or autonomous/semi-autonomous behavior, accepts goals and performs multiple steps, and commonly includes tools, state, or memory.

Examples: coding, research, and browser-automation Agents.

Boundary: a library used to build Agents is `framework`.

### `framework`

A development Framework for Agents, workflows, tool calling, or AI applications.

Criteria: provides an SDK, abstraction, runtime, or orchestration; requires code integration; primarily helps developers build systems.

Examples: Agent Frameworks, workflow orchestration, and tool-calling SDKs.

Boundary: when both hosted service and SDK exist, choose the primary user entry and add `service` or `sdk` tags.

### `cli`

A command-line tool usable by humans or agents.

Criteria: shell is the main entry and supports scripting/project automation.

Examples: coding CLI Agents, documentation generators, and data-conversion CLIs.

Boundary: an installation wrapper for an MCP Server is not primarily `cli`.

### `prompt`

A reusable prompt template, system prompt, or task prompt whose main content is model-input text and which lacks a complete agent workflow/tool adapter.

### `rules`

Project- or tool-level Agent behavior rules, policies, or constraints, including `AGENTS.md`, `.cursorrules`, and `CLAUDE.md`.

### `dataset`

A dataset whose primary value is tool discovery, rating, recommendation, or evaluation data.

### `service`

A hosted service or SaaS whose primary capability runs on a third party and commonly requires an account, API key, or paid plan.

## Purpose Tags

Purpose is stored in `primary_purpose` and `tags`. Multiple tags are allowed, but one purpose is primary.

| Tag | Definition | Example |
| --- | --- | --- |
| `coding` | Generate, modify, review, or refactor code | Fix a bug, generate tests |
| `testing` | Generate/run tests or analyze coverage | Add unit tests |
| `browser_automation` | Control browsers, scrape, or run E2E | Open and screenshot a page |
| `data_analysis` | Tables, SQL, notebooks, reports | Analyze CSV |
| `documents` | Word, PDF, document processing | Draft a contract |
| `presentations` | Slides and presentation material | Create a pitch deck |
| `design` | UI, Figma, visual generation | Rebuild from screenshot |
| `search` | Web search, knowledge retrieval, RAG | Find sources |
| `database` | Query, migrate, administer databases | Query Postgres |
| `cloud` | Cloud resources, deployment, IaC | Deploy to Workers |
| `communication` | Email, Slack, IM | Summarize messages |
| `security` | Vulnerability, permission, secret checks | Audit dependency risk |
| `finance` | Financial data and investment research | Analyze statements |
| `research` | Source organization and industry research | Research a company |
| `media` | Image, audio, or video generation/processing | Generate video |
| `workflow` | Multi-step automation/orchestration | Recurring report |

A new purpose tag requires a clear trigger task, at least three candidate tools or a strategic-category rationale, and updated recommendation/evaluation examples.

## Usage Modes

Suggested field: `usage_mode`.

| Value | Definition | Rating effect |
| --- | --- | --- |
| `local` | Runs locally | Controllable permissions, potentially higher setup cost |
| `hosted` | Third-party hosted | Easy setup, but account/data-transfer risk |
| `api` | Used via API | Requires key and network |
| `cli` | Invoked from shell | Automatable; inspect shell risk |
| `mcp_server` | Connected through MCP | Agent-friendly; model permissions |
| `sdk` | Integrated as a library | Flexible, higher development cost |
| `prompt_pack` | Prompt package | Low integration cost, context-dependent reliability |
| `workflow` | Predefined process | Repeatable; inspect boundaries |

## Source Trust

Field: `security.trust_level`.

| Value | Definition | Criteria |
| --- | --- | --- |
| `official` | Official | Maintained by vendor, owner, or protocol |
| `well_known_org` | Well-known organization | Public reputation, history, and team |
| `active_open_source` | Active open source | Active community and normal issues/releases |
| `individual` | Individual project | Trust depends on evidence |
| `commercial` | Commercial service | Company-maintained; assess lock-in/data risk |
| `unknown` | Unknown | Unclear source or insufficient evidence |

Trust level is not a quality score; it affects evidence weight and risk explanation only.

## Permission Risk

Fields: `permissions` and `security.risk_level`.

### Scope

- `filesystem`
- `network`
- `browser`
- `email`
- `database`
- `cloud`
- `payment`
- `shell`
- `code_execution`
- `secrets`
- `unknown`

### Access

- `read`
- `write`
- `read_write`
- `execute`
- `admin`
- `unknown`

### Risk Levels

| Level | Definition | Example |
| --- | --- | --- |
| `low` | Limited permission and impact | Read public docs |
| `medium` | Scoped local/account permission | Read project files, call API |
| `high` | May change important data or access sensitive accounts | Write DB, read email, shell |
| `critical` | May affect money, cloud resources, secrets, or data at scale | Payments, cloud admin, unknown code |
| `unknown` | Cannot assess | Missing permission description |

## Maturity

Fields: `maturity` and `maintenance.status`.

### `maturity`

| Value | Definition |
| --- | --- |
| `experimental` | Unstable API or behavior |
| `beta` | Usable but rapidly changing |
| `stable` | Stable docs, releases, and usage |
| `deprecated` | Retired or migration recommended |
| `unknown` | Cannot assess |

### `maintenance.status`

| Value | Definition |
| --- | --- |
| `active` | Recent release, commit, issue work, or docs |
| `slow` | Slow but continuing |
| `inactive` | No signal for a long period |
| `deprecated` | Explicitly ended |
| `unknown` | Cannot assess |

## Supported Agents

Field: `supported_agents`.

Suggested values: `codex`, `claude-code`, `cursor`, `opencode`, `gemini-cli`, `generic-mcp-client`, `generic-cli-agent`, and `unknown`.

Use exact-agent values only when official docs or verifiable community examples support them. Theoretical compatibility uses `generic-*` or `unknown`.

## Primary and Multiple Tags

### Choosing Primary Type

Use the main entry point:

1. MCP invocation.
2. Agent Skill/Rules.
3. Independent Agent execution.
4. Framework/SDK construction.
5. CLI use.
6. Prompt or Rules text only.

### Multiple Tags

- Tags describe searchable tasks, not marketing adjectives.
- Normalize synonyms, such as `web_automation` into `browser_automation`.
- Avoid vague tags such as `productivity`, `ai`, and `tool`.

## Conflict Handling

| Conflict | Handling |
| --- | --- |
| One source says Framework, another Agent | Use primary entry; record secondary type |
| Both local and hosted | `usage_mode` may be multiple; warn for highest-risk path |
| Missing permissions | At least `unknown`; exclude from low-risk recommendation |
| Unverified Agent support | Use `generic-*` or `unknown` |

## Examples

### Filesystem MCP

```yaml
type: mcp
secondary_types: [cli]
primary_purpose: local_file_access
tags: [filesystem, local, mcp_server, coding]
usage_mode: [mcp_server, local]
permissions:
  - scope: filesystem
    access: read_write
maturity: stable
```

### Frontend-Building Skill

```yaml
type: skill
primary_purpose: frontend_app_building
tags: [coding, design, workflow]
usage_mode: [workflow, prompt_pack]
permissions: []
maturity: stable
```

### Agent Framework

```yaml
type: framework
secondary_types: [sdk]
primary_purpose: agent_development
tags: [coding, workflow, tool_calling]
usage_mode: [sdk]
permissions:
  - scope: code_execution
    access: execute
maturity: beta
```

## Relationship to Rating and Recommendation

- `type` selects rating weights.
- `tags` and `primary_purpose` drive task retrieval.
- `usage_mode` affects integration cost.
- `permissions` and `risk_level` drive safety filtering.
- `trust_level` affects evidence quality.
- `maturity` and `maintenance.status` affect ordering.

## Maintenance Rules

- Categories must serve recommendation; do not expand for completeness alone.
- A new category needs three examples or a clear explanation for temporarily having fewer.
- Enum changes update data model, rating rules, recommendation engine, and evaluation plan together.
