# 00 Product Brief

## Document Purpose

This document defines Agent Radar's product positioning, target users, core value, product boundaries, and success metrics. It is the upstream authority for requirements, architecture, rating, recommendation, and roadmap decisions.

When later documents disagree about scope, return here and ask whether the capability helps human developers or coding agents select AI tools more reliably.

## One-Sentence Positioning

Agent Radar is an AI tool rating and recommendation knowledge base for human developers and coding agents. It uses structured data, explainable ratings, and task-oriented recommendations to help users choose among AI Agents, Skills, MCP Servers, CLIs, Frameworks, and Prompts/Rules.

## Product Background

AI development tools are expanding from individual products into a composable ecosystem of models, agents, MCP Servers, CLIs, editor extensions, workflow Skills, rules files, and Frameworks. Developers must now answer more than "What tools exist?":

- Which tool fits the current task?
- Is it maintained, safe, and easy to integrate?
- Can a coding agent read the information and make an actionable choice?
- Is a recommendation supported by evidence rather than popularity, ranking, or vendor claims?

Agent Radar's opportunity is to turn fragmented ecosystem information into a decision layer that agents can use, rather than another link list intended only for human browsing.

## Target Users

### AI-First Developers

These users work daily with Codex, Claude Code, Cursor, OpenCode, Gemini CLI, and similar tools. They need to decide quickly whether a task should use an existing Agent, MCP Server, Skill, CLI, or Framework, or be implemented directly.

### Coding-Agent Users

These users want an agent to select tools while preserving transparent rationale, risk warnings, and traceable sources. Agent Radar must let agents query capabilities, use cases, constraints, and rating explanations.

### AI Platform Teams

These teams maintain trusted tool catalogs for internal developers and care about coverage, freshness, safety boundaries, rating consistency, and governance. They need reusable decision criteria, not discovery alone.

### Tool Maintainers

These users want their tools to be understood, classified, and recommended accurately. They care whether Tool Cards reflect actual capabilities, installation, use cases, limitations, and maintenance status.

## Core Problem

Given a development need, how can Agent Radar reliably find an appropriate AI tool and explain why it recommends that tool?

This includes several subproblems:

- Ecosystem information is scattered across GitHub, documentation sites, MCP registries, blogs, example repositories, and community discussion.
- Naming and classification are inconsistent; the same tool may be called an Agent, Plugin, Skill, Server, or Framework.
- Popularity does not equal usability. Stars, reposts, and rankings do not directly prove integration quality, maintenance quality, or task fit.
- Human-readable introductions may lack the structured fields, risk labels, and machine-readable output needed by agents.
- Recommendations must be explainable so users and agents can decide whether to trust them.

## Primary Scenarios

### Task-Driven Recommendation

A user or agent provides a task such as "increase test coverage for a Python project," "read Gmail in Codex and summarize action items," or "integrate Stripe Checkout into a Next.js application." Agent Radar returns candidates, fit reasons, risks, alternatives, and source evidence.

### Tool Discovery and Comparison

A user explores a category such as MCP Servers, coding-agent Frameworks, CLI agents, or Prompt/Rules templates. Agent Radar provides taxonomy search, Tool Cards, rating dimensions, and peer comparison.

### Agent Decision Context

Before execution, a coding agent queries Agent Radar for structured context such as available tools, trigger conditions, installation or invocation limitations, safety notes, and unsuitable scenarios.

### Tool Ecosystem Monitoring

Maintainers and platform teams review new tools, failures, maintenance changes, rating changes, and risk changes to decide whether to add, retain, or remove tools.

### Research and Reports

Agent Radar may produce ecosystem reports from structured data, but reports are a byproduct of the rating and recommendation system, not the primary product.

## Product Boundaries

Agent Radar is a rating and recommendation knowledge base, not a general news site, installation marketplace, or security scanner.

### In Scope

- Collect public information about AI Agents, Skills, MCP Servers, CLIs, Frameworks, and Prompts/Rules.
- Produce normalized Tool Cards describing type, capabilities, appropriate tasks, usage, limitations, sources, and confidence.
- Maintain a taxonomy that humans and agents can search by task, ecosystem, integration method, and risk.
- Maintain explainable rating rules covering task fit, maintenance, documentation, integration cost, security risk, and evidence quality.
- Provide search, filtering, comparison, and recommendation.
- Provide agent-friendly output such as JSON, Markdown summaries, and MCP queries.
- Provide a repository-owned installable Agent Skill that guides coding agents through the same reviewed search, evidence, recommendation, and safety boundaries.
- Preserve sources and update times so recommendations are traceable and reviewable.

### Out of Scope

- Timeline-only AI news aggregation.
- Link-only awesome lists without verified fields or recommendation rationale.
- Unverified automatic installation.
- Replacing security scanners or promising detection of every vulnerability, supply-chain attack, or malicious behavior.
- Early complex account systems, enterprise permission governance, or online marketplaces.
- Treating popularity as recommendation rank.

## Differences from Adjacent Products

### MCP Registries

MCP registries primarily address MCP Server discovery and distribution. Agent Radar covers Agents, Skills, CLIs, Frameworks, and Prompts/Rules as well, with cross-type recommendation, rating explanations, and task fit.

### Awesome Lists

Awesome lists support human browsing and early discovery but typically lack structured fields, consistent ratings, update mechanisms, and recommendation explanations. Agent Radar data is intended to enter agent decision flows directly.

### AI Ecosystem Newsletters

Newsletters emphasize recency. Agent Radar maintains durable tool knowledge; news and releases are signals that may trigger Tool Card changes.

### Security Scanners

Security scanners focus on vulnerabilities, dependency risk, and runtime safety. Agent Radar records safety-related risks to support tool selection but does not provide complete security-audit conclusions.

### Enterprise Tool Catalogs

Enterprise catalogs typically focus on internal compliance, procurement, and access. Agent Radar focuses on the public ecosystem and agent-readable recommendations. Custom enterprise policy may come later but is not central to MVP.

## Differentiated Value

Agent Radar's advantage is not listing more tools; it turns tool information into actionable selection evidence:

- Task-oriented rather than ranking-oriented.
- Designed for agent decisions as well as human reading.
- Explainable ratings with evidence, trade-offs, and uncertainty.
- Cross-type coverage rather than isolated MCP, CLI, Skill, and Framework catalogs.
- Explicit sources, update times, and confidence to reduce hallucinated recommendations.
- Tiered results such as recommended, optional, and discouraged for the same need.

## MVP Scope

MVP tests one hypothesis: for a development request, Agent Radar can recommend appropriate AI tools more consistently than ordinary search or a link list.

MVP includes:

- A minimal Tool Card schema.
- An initial taxonomy that will ultimately cover Agent, Skill, MCP Server, CLI, Framework, and Prompt/Rules; the first MVP set covers MCP, Skill, and Agent.
- A small number of high-quality official sources and controlled public metadata sources, with a manually triggered, replayable import flow.
- Basic JSON and Cloudflare D1 SQLite indexing and search.
- Base ratings emphasizing use case, maintenance, documentation, integration cost, and evidence quality.
- Task-oriented recommendation output with rationale, conditions, risks, and sources.
- A standard lightweight MCP API on Cloudflare Workers and structured agent output.
- Golden queries for recommendation-quality evaluation.

MVP favors a smaller trusted dataset over broad unverified coverage. It does not ingest community directories or news, support a user-feedback loop, or introduce paid services.

## v0.2 Delivery Boundary

v0.2 uses one Cloudflare Worker with Static Assets enabled for Web, data artifacts, HTTP API, and the MCP JSON-RPC endpoint. Controlled GitHub topic metadata and npm package metadata may be enabled sources, but must pass the same validation, automatic review, release admission, and promotion gates as official documentation and exact repository metadata. A topic, star count, or package's existence alone cannot make a tool reliably recommendable.

Normal release review evidence is generated by scripts, rules, LLM evaluation, automatic review, and promotion checks, then persisted in an immutable reviewed bundle. The only routine human release confirmation is the GitHub `production` environment gate. Per-item approval forms and review-record generators are not part of v0.2; `Approval Record` remains only as an evidence-backed break-glass override. High-risk execution, destructive actions, and safety-boundary changes still require human confirmation.

`all-v0.8.0` is the current verified production baseline. Release All run `29383566104` and production deployment `5459363215` bind `production-release-evidence.json` to commit `c174c13913d82cf14c67f4cda060d38a2b4d5781`; the reviewed catalog contains 76 Tool Cards, including the first 23 dynamically discovered Skill cards. Real-provider golden evaluation passed 24/24, critical safety passed 4/4, and MCP smoke checks passed 7/7. Its reviewed evidence records 24/24 provider-reported request attempts, no unavailable usage or retries, and 700,377 total tokens, 27.49% below the comparable `all-v0.7.1` baseline. The official MCP Registry still exposes the same production remote as active/latest `io.github.zation/agent-radar@0.6.4`.

v0.9 P2 adds a source-distributed, local-first `agent-radar` Agent Skill under `skills/agent-radar`. An explicit synchronization command downloads the latest compatible reviewed dataset, verifies its version, size, checksums, and schemas, and atomically activates it for offline search and local recommendation context. Installation does not create an installation marketplace, grant permission to adopt a recommended tool, require MCP or a provider credential, or change the Worker API and MCP trust boundary.

v0.3 focused on P1 data/trust and P2 recommendation safety/evaluation. v0.4 focused on UI redesign, GitHub OAuth, D1 voting, GitHub Issue Form feedback, and build-time feedback rating integration. A fuller Provider runtime configuration UI, browser loading of `provider_registry.json`, and direct-to-provider versus proxy decisions remain in Backlog rather than v0.3 or v0.4.

## Success Metrics

### Recommendation Accuracy

Use human or script-assisted review of golden queries to judge whether recommendations truly fit. Candidate count matters less than whether top results are useful and explanations are sound.

### Tool Coverage

Count only valid Tool Cards. Records without sources, update times, taxonomy, or basic capability descriptions do not count toward core coverage.

### Data Freshness

Track Tool Card update time, source-check time, and broken-link rate. Stale data directly reduces recommendation trust.

### Rating Explanation Quality

Ratings must answer why a tool is recommended, why it is not first, and when it should not be used. Measure this through human sampling, feedback, and evaluation cases.

### Agent Decision Usability

Measure whether a coding agent can turn an Agent Radar result into an appropriate next step: select a tool, skip an unsuitable tool, request confirmation, or choose a lower-risk approach.

### Risk Identification Rate

Measure whether recommendations expose obvious risks such as stalled maintenance, missing documentation, excessive permissions, unknown sources, unclear installation, or task mismatch.

## Decision Principles

- Prioritize the primary path of selecting an appropriate AI tool for a need.
- Improve data trust and recommendation explanation before expanding coverage.
- Make every rating traceable to fields, rules, or source evidence.
- Label uncertainty explicitly; never guess critical fields.
- Avoid early platform sprawl; accounts, permissions, marketplaces, and installers are not core.
- Make product output useful both to humans and as agent context.

## Maintenance Rules

- When product positioning changes, update this document before requirements and Roadmap.
- A new primary scenario must state target users, trigger, and success criteria.
- A new out-of-scope item must explain why it does not serve the primary path.
- Keep implementation details out unless an implementation choice changes product boundaries.
- Do not promote a merely possible future idea into a product goal.
