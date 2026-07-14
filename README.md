<p align="center">
  <img src="./public/logo.svg" alt="Agent Radar" width="180" />
</p>

# Agent Radar

**Choose AI tools with evidence, not hype.**

Agent Radar is a structured rating and recommendation knowledge base for AI Agents, Skills, MCP Servers, CLIs, Frameworks, and Prompts/Rules. It helps developers and coding agents answer a practical question: which tool fits this task, and what should I know before trusting it?

Instead of publishing another directory of links, Agent Radar turns fragmented ecosystem information into Tool Cards, explainable ratings, task-oriented recommendations, risk signals, and agent-readable data.

## Why Agent Radar

The AI tooling ecosystem is growing faster than any one developer can evaluate it. Names and categories overlap, documentation quality varies, and popularity often says little about task fit, integration cost, maintenance, permissions, or trust.

Agent Radar adds a decision layer:

- **Task fit over popularity.** Recommendations start from the work to be done, not a global leaderboard.
- **Evidence over marketing.** Sources, update times, provenance, and confidence remain visible.
- **Explanation over opaque ranking.** Ratings and recommendations expose reasons, trade-offs, and unsuitable conditions.
- **Safety before execution.** Permission, trust, data-flow, and production-impact risks can tighten or block a recommendation.
- **Built for humans and agents.** The same reviewed knowledge is available through a Web UI, static data, HTTP endpoints, and MCP.

## What You Get

### Structured Tool Knowledge

Tool Cards describe capabilities, appropriate tasks, limitations, integration methods, maintenance, permissions, known risks, sources, and confidence in a consistent format across tool types.

### Explainable Ratings

Ratings combine task fit, maintenance, documentation, integration cost, security risk, and evidence quality. Scores never replace the underlying evidence or risk context.

### Task-Oriented Recommendations

Describe a development task, environment, preferred tool type, allowed permissions, and risk tolerance. Agent Radar returns candidates with fit reasons, risks, alternatives, and a conservative next action.

| Action | Meaning |
| --- | --- |
| `use` | A suitable option can be included in the plan within its stated boundaries |
| `compare` | Multiple options deserve a trade-off review |
| `ask_human` | Permission, account, production, or uncertainty boundaries require confirmation |
| `avoid` | The option or operation crosses an unacceptable safety or quality boundary |
| `no_reliable_match` | The catalog cannot support a trustworthy recommendation |

### Agent-Readable Decision Context

JSON, JSONL, HTTP, and MCP surfaces let coding agents search the catalog, inspect Tool Cards, request recommendations, and explain ratings without scraping a human-only page.

## How It Works

```text
reviewed public sources
  -> normalized Tool Cards and provenance
  -> explainable ratings and risk signals
  -> task-oriented retrieval and recommendation
  -> deterministic safety enforcement
  -> provider-backed evaluation and release gates
  -> Web, JSON/JSONL, HTTP API, and MCP
```

Collection is controlled by a Source Registry. Candidates pass normalization, validation, review, admission, and promotion gates before entering reliable recommendation data. Dynamic recommendations use an LLM for task interpretation and candidate selection, while local deterministic logic validates known tools and enforces safety boundaries.

The v0.7 data path also discovers the current top two public repositories for GitHub topic `agent-skills` and expands eligible `skills/**/SKILL.md` manifests into one Tool Card per Skill. Repository rank is discovery evidence, not quality evidence. Each current build keeps only successfully fetched Skill manifests; raw Skill text stays inside ingestion evidence and is never sent to the recommendation provider.

## Who It Is For

- **AI-first developers** choosing among agents, Skills, MCP Servers, CLIs, and Frameworks for a concrete task.
- **Coding-agent users** who want tool selection to include reasons, permissions, risks, and traceable evidence.
- **AI platform teams** building a trusted, reusable catalog and decision layer for developers.
- **Tool maintainers** who want capabilities, limitations, and sources represented accurately.

## Trust and Safety

Agent Radar is designed to support safer selection, not to authorize execution.

- Sources and field-level evidence remain traceable.
- Unknown, stale, or conflicting evidence lowers confidence.
- Permissions and data flows stay visible beside recommendation value.
- High-risk operations can require human confirmation even when a tool is a strong task match.
- Unknown-source code execution is treated conservatively and cannot be promoted by provider output.
- Critical safety cases block a reviewed release when they fail, are missing, or are not executed.

Agent Radar does not automatically install, authorize, or run third-party tools. It is not a substitute for a security scanner, dependency audit, organizational policy, or human review of production-impacting actions.

## Ways to Use Agent Radar

### Web UI

Browse and filter the reviewed catalog, describe a task, inspect recommendations, open detailed Tool Cards, and review evaluation evidence through the Tools and Evaluation workspaces.

### Static Data

Reviewed bundles expose versioned Tool Cards, Rating Results, search indexes, Golden Queries, evaluation summaries, manifests, provenance, and quality evidence as JSON or JSONL artifacts.

### HTTP API

The Worker exposes read-oriented endpoints for:

- `/api/search_tools`
- `/api/get_tool_card`
- `/api/recommend_tools`
- `/api/explain_rating`
- `/api/version`

### MCP

`/api/mcp` provides a stateless Streamable HTTP MCP interface built with the official TypeScript SDK v2 beta. It exposes `search_tools`, `get_tool_card`, `recommend_tools`, and `explain_rating`; all four tools are read-only with respect to tool execution and installation. `/api/mcp_manifest` exposes the same shared contracts for simpler HTTP integrations.

`recommend_tools` accepts its ordinary query and optional model as tool input. A per-request provider credential is sent only in the optional secret header `X-Agent-Radar-LLM-API-Key`; it is never part of the tool schema or response. The Worker may use its configured server-side fallback when that header is absent.

The remote-only Agent Radar MCP server is published in the official Registry as `io.github.zation/agent-radar`, backed by the production Streamable HTTP endpoint and evidence-bound GitHub OIDC publication.

## Documentation

- [Product Brief](docs/00-product-brief.md)
- [User Workflows](docs/02-user-workflows.md)
- [System Architecture](docs/03-system-architecture.md)
- [Data Model](docs/04-data-model.md)
- [Rating Rules](docs/06-rating-rules.md)
- [Recommendation Engine](docs/09-recommendation-engine.md)
- [Evaluation Plan](docs/10-evaluation-plan.md)
- [Security and Trust](docs/11-security-and-trust.md)
- [Deployment and Operations](docs/12-deployment-and-ops.md)
- [Web UI](docs/14-web-ui.md)
- [Roadmap](docs/15-roadmap.md)

## Development and Contributing

Use the [Development Guide](DEVELOPMENT.md) for local setup, development commands, data generation, evaluation, testing, and troubleshooting.

Coding agents and contributors must also read [AGENTS.md](AGENTS.md) before changing the project. It defines document authority, required validation, safe automatic actions, and changes that require human confirmation.
