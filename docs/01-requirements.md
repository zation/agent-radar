# 01 Requirements

## v0.3 P2 Recommendation-Safety Increment

Every dynamic recommendation entry point must return Recommendation Result v2 with a release ID, commit SHA, and structured safety assessment that the LLM cannot override. The suite contains 24 golden queries, including four critical safety cases; any failed, missing, or unexecuted critical case blocks a production release. The Web UI displays confirmation requirements read-only and stores neither answers nor execution authorization.

## Document Purpose

This document records Agent Radar's functional requirements, non-functional requirements, MVP scope, and deferred scope. It guides implementation plans, acceptance criteria, and the Roadmap.

Requirement decisions must return to `docs/00-product-brief.md`: the system's core value is helping human developers and coding agents select AI Agents, Skills, MCP Servers, CLIs, Frameworks, and Prompts/Rules from structured evidence.

## Requirement Principles

- Requirements must serve the primary path of recommending appropriate AI tools for development tasks.
- MVP prioritizes trusted data, clear fields, and explainable ratings over coverage volume.
- Every capability needs machine-readable output; human browsing alone is insufficient.
- Recommendations must explain sources, rationale, risk, and uncertainty.
- High-risk actions receive advice only: no automatic installation, authorization, or human-approval bypass.
- The MVP stack is fixed to TypeScript, JSON plus Cloudflare D1 SQLite, and one Cloudflare Worker with Static Assets within free-tier limits.

## Roles and Goals

### Human Developer

Goal: enter a development need and quickly receive usable candidates, rationale, risks, and alternatives.

Acceptance criteria:

- Natural-language task input returns candidate tools.
- Every candidate includes fit, unsuitable conditions, installation/integration, source links, and confidence.
- When no reliable tool exists, return "No reliable recommendation" rather than forcing a result.

### Coding Agent

Goal: query Agent Radar before execution and receive structured context for choosing a tool or requesting confirmation.

Acceptance criteria:

- JSON or MCP query output is available.
- Output includes recommendation level, risk level, permissions, evidence, and next steps.
- High-risk tools explicitly require human confirmation.

### Project Maintainer

Goal: maintain sources, Tool Cards, rating rules, evaluation cases, and releases.

Acceptance criteria:

- A low-risk public source can be added with trust, collection method, and constraints recorded.
- Tool Card completeness, source quality, and rating explanation can be reviewed.
- Evaluations can compare rating or recommendation changes.

### Tool Maintainer

Goal: have a tool represented, classified, and explained accurately.

Acceptance criteria:

- Tool Cards can identify official sources, repository, documentation, license, installation, and use cases.
- Disputed fields can be corrected with source evidence.
- Vendor marketing claims are not rating conclusions.

## Functional Requirements

### FR-01 Source Registration and Management

Maintain a Source Registry for official registries, official GitHub organizations, official documentation sites, and GitHub topic/package metadata sources whose access boundaries were reviewed. Community directories, awesome lists, and news are not automatically ingested in MVP.

Acceptance criteria:

- Each source has name, URL, source type, covered tool types, collection method, suggested frequency, trust level, rate limit, and usage restrictions.
- A new source states purpose, expected fields, legal boundary, and failure behavior.
- An enabled source has an implemented parser, owner, access-terms record, and conservative failure policy. Controlled GitHub topic and npm metadata still pass validation, automatic review, and promotion gates.
- Never collect sources requiring bypass of login, paywall, CAPTCHA, service terms, or the exclusion of community/news sources.

### FR-02 Raw Snapshot Retention

Save immutable source snapshots so parser changes remain replayable.

Acceptance criteria:

- Every collection creates a `Raw Source Snapshot` with source ID, collection time, request metadata, raw-content reference, and content hash.
- Parser failures preserve the snapshot and error.
- Parser and normalizer can rerun against the same snapshot.

### FR-03 Normalized Tool Card

Normalize heterogeneous source data into Tool Cards.

Acceptance criteria:

- At minimum: `id`, `name`, `type`, `summary`, `source_urls`, `use_cases`, `not_for`, `install_methods`, `permissions`, `maintenance`, `security`, `last_checked_at`, and `confidence`.
- Field sources and confidence trace to a Source Record, field provenance, or public-evidence-backed break-glass override.
- Missing critical fields exclude a record from reliable recommendations; it remains low-confidence or incomplete.

### FR-04 Taxonomy

Support tool type, purpose, usage, source trust, permission risk, maturity, and applicable-agent dimensions.

Acceptance criteria:

- One primary type and multiple tags per tool.
- Taxonomy supports filtering, rating, and recommendation explanations.
- Conflicts record rationale and confidence.

### FR-05 Rating System

Generate explainable ratings from shared and type-specific rules.

Acceptance criteria:

- Each rating includes total score, dimension scores, recommendation level, risk level, explanation, evidence, and rules version.
- Weights may differ by type: MCP emphasizes permission scope and tool-description quality; Skill emphasizes triggers and boundaries.
- Evaluation regression detects rating changes.

### FR-06 Search and Filtering

Search by name, type, tag, task, ecosystem, permission, maintenance, source trust, and risk.

Acceptance criteria:

- Keyword search and structured filters.
- Results show matching fields, base rating, risk warning, and update time.
- Default ordering combines task fit and trust rather than popularity alone.

### FR-07 Recommendation Engine

Recommend tools from user task and context.

Acceptance criteria:

- Input supports task, stack, runtime, allowed permissions, risk preference, existing tools, and output format.
- Output includes Top N candidates, recommendation level, rationale, risks, alternatives, reasons against use, and source evidence.
- Insufficient evidence or excessive risk produces conservative advice.

### FR-08 Agent-Friendly Output

Provide structured output suitable for coding agents.

Acceptance criteria:

- JSON and Markdown summary.
- Stable JSON fields usable as context or subsequent tool input.
- `recommended_action` supports `use`, `compare`, `ask_human`, `avoid`, and `no_reliable_match`.

### FR-09 MCP Query Interface

The same Cloudflare Worker with Static Assets serves a lightweight MCP JSON-RPC API at `/api/mcp`.

Acceptance criteria:

- Support `initialize`, `tools/list`, and read-only `tools/call` exposing at least `search_tools`, `get_tool_card`, `recommend_tools`, and `explain_rating`.
- v0.2 reads static JSON artifacts from the same Worker deployment and never installs or authorizes third-party tools.
- Errors include a readable cause and recovery advice.

### FR-10 Web UI

Provide a basic Web UI for human browsing, comparison, and review.

Acceptance criteria:

- Tool list, detail, filtering, comparison, and recommendation display.
- Details show sources, update time, rating explanation, and risk.
- Low confidence and high-risk rationale remain visible.

### FR-11 Evaluation System

Maintain golden queries, data-quality checks, rating regression, and explanation-quality evaluation.

Acceptance criteria:

- Rating or recommendation changes can produce an eval diff.
- Failures explain impact; do not merely edit expected results.
- Cover common development tasks, no-match tasks, high-risk permissions, and peer comparison.

### FR-12 Report Generation

Structured data may generate ecosystem reports as a byproduct.

Acceptance criteria:

- Reports cite Tool Cards, Rating Results, and Source Records.
- News summaries are not the MVP primary path.
- Reports state sample, update time, and limitations.

### FR-13 Corrections and Release Review

Support evidence-backed field overrides, rating exceptions, and misclassification corrections. Normal draft review uses scripts, rules, LLM evaluation, automatic review, release admission, and promotion checks rather than per-item human approval.

Acceptance criteria:

- Override Records contain actor, time, reason, source evidence, and affected field and are break-glass inputs only.
- Overrides do not replace raw snapshots; they apply at normalization or rating.
- Automatic-review evidence persists in the reviewed bundle; routine human confirmation occurs only at the GitHub `production` environment gate.
- Core schema semantic changes update data model, ingestion, rating, recommendation, and evaluation docs together.

### FR-14 User and Agent Feedback Loop

v0.4 collects GitHub-identity-bound Tool Card votes in Web and detailed reasons through a user-submitted GitHub Issue Form. `Release All` processes feedback while building the reviewed bundle to improve Tool Cards, ratings, safety notes, and golden queries.

Acceptance criteria:

- Minimal GitHub OAuth requests only stable user ID and public username, with no email, repository, or organization scopes. One mutable `up` or `down` vote exists per user and Tool Card.
- Aggregate counts are public; an individual's vote state is visible only to that user and voter lists are never public.
- Tool Card pages open the `zation/agent-radar` Issue Form with Tool Card key, vote, data version, and Tool Card URL prefilled. The page does not create the Issue; reason is required and is not stored in Agent Radar D1.
- Feedback never contains private code, email, tokens, secrets, full prompts, or browser content.
- The reviewed-bundle build deterministically validates legal open feedback Issues, then performs constrained LLM classification as `accepted`, `rejected`, or `needs-human-review`. Accepted/rejected Issues receive a processing comment/build information and close; human-review Issues remain open.
- `feedback_rules.v0.1` computes each build consistently: an accepted Issue contributes `+1/-1`; otherwise a bare vote contributes `+0.2/-0.2`; per-card adjustment is clamped from `-3` to `+3`. Feedback cannot lower security risk or raise source trust.
- Feedback classified as `unsafe`, or involving missing permissions, production data, payments, email, databases, or cloud accounts, enters the human intervention queue.
- The MVP/v0.2 MCP/API path stays read-only. v0.4 adds only a vote endpoint protected by GitHub login, uniqueness, Origin checks, and basic rate limiting.

## Non-Functional Requirements

### NFR-01 Maintainability

Module boundaries are clear; schemas, rating rules, source parsers, and recommendation policy evolve independently.

Acceptance: a low-risk source does not require rating-core changes; a new dimension is traceable by rules version.

### NFR-02 Explainability

Every recommendation and rating is explainable.

Acceptance: any result traces to task-fit fields, dimensions, risk fields, and source evidence.

### NFR-03 Data Freshness

Record source-check and data-update times.

Acceptance: Tool Cards display `last_checked_at`; stale cards lose confidence or show a warning.

### NFR-04 Cost Control

MVP uses TypeScript, JSON, Cloudflare D1 SQLite, and one Worker with Static Assets within free-tier limits.

Acceptance: without paid infrastructure, maintainers can manually update data, run evaluation, write D1, and publish JSON artifacts and the public site.

### NFR-05 Performance

MVP queries support interactive use.

Acceptance: common search and recommendation queries return in roughly one second on the small local/static dataset; large-scale optimization is deferred.

### NFR-06 Security and Privacy

Collect public sources only; do not process private code, email, or browser data. A Recommend BYOK API key is used only for the current provider request and never enters artifacts, eval reports, or persistence.

Acceptance: ingestion requests no user secret; a BYOK secret remains request-scoped with redacted logs; high-risk recommendations state permissions and human confirmation.

### NFR-07 Replay and Rollback

Data generation, rating, and recommendation are replayable.

Acceptance: releases record data, rules, index versions, and evaluation results and can roll back.

## MVP Scope

MVP must implement:

- Complete documentation.
- Minimal Tool Card schema and initial taxonomy.
- First-party scope for MCP, Skill, and Agent.
- A small set of high-quality official and controlled public metadata sources.
- A manually triggered, replayable ingestion/normalization flow with automatic-review evidence.
- JSON datasets, Cloudflare D1 SQLite storage, and basic search.
- `rating_rules.v0.1-draft` base ratings and explanation templates.
- Task-oriented recommendations.
- Read-only HTTP API, MCP JSON-RPC endpoint, and Static Assets site on the same Worker.
- Golden queries and recommendation-quality evaluation.

MVP uses manual review and manually triggered updates, not scheduled ingestion.

The reliable release path is ingestion-first: `npm run pipeline` reads enabled Source Registry entries, collects public sources, creates Source Records, Tool Card drafts, minimal normalizer/deduper output, manual override artifacts, intervention requests, automatic review, release admission, promotion candidates, and a promotion plan, then generates release artifacts only from candidates that pass promotion checks. Source-code seed Tool Cards are not production release inputs.

The feedback loop is not part of the MVP reliable release path. Future feedback writes first produce feedback records and summary reports, then enter Review Summary and evaluation; they never directly rewrite release artifacts.

## Deferred Scope

- Complex accounts and multi-tenant access.
- Online installation marketplace or one-click third-party execution.
- Enterprise procurement, approval, and fine-grained governance.
- Large-scale real-time crawling and whole-Web monitoring.
- Advanced visualization dashboards.
- Complete security audits of third-party tools.
- Closed-source paid data dependencies.
- Paid services or long-running infrastructure beyond free tiers.
- Automatic collection from community directories, awesome lists, or news.
- User feedback loop.
- Full Provider runtime configuration UI, browser loading of `provider_registry.json`, and direct-to-provider/proxy decisions; these remain Backlog.

## Prohibited Product Directions

- Do not turn popularity rankings into recommendations.
- Do not trust unknown sources to increase coverage.
- Do not automatically install or run high-risk tools.
- Do not guess critical fields.
- Do not make news summaries, trends, or marketing copy the core product.

## Requirements Acceptance Matrix

| ID | Capability | Current status | Primary input | Primary output | Verification |
| --- | --- | --- | --- | --- | --- |
| FR-01 | Source registration | Controlled GitHub topic/npm metadata and official sources integrated | Source URL and metadata | Source Registry | Validator, automatic review, promotion gate |
| FR-02 | Raw snapshot | v0.2 draft path writes locally | Source response | Raw Snapshot | Hash, timestamp, replay |
| FR-03 | Tool Card | v0.2 defaults to ingested candidates | Source Record/review evidence/override | Normalized card | Schema, provenance, promotion |
| FR-04 | Taxonomy | MVP tags used by Tool Cards | Tool Card fields | Multidimensional tags | Taxonomy tests |
| FR-05 | Rating | `rating_rules.v0.1-draft` implemented | Tool Card, rules version | Rating Result | Unit tests, eval diff |
| FR-06 | Search | Basic search/API/UI implemented | Query and filters | Results | Golden search cases |
| FR-07 | Recommendation | BYOK LLM-backed baseline passed | Task context, API key, model | Recommendation Result | Golden queries |
| FR-08 | Agent output | JSON schema implemented; Markdown not systematic | Recommendation Result | JSON/Markdown | Schema validation |
| FR-09 | MCP query | `/api/mcp` deployed with smoke | MCP/API call | Query response | Contracts + 4/4 smoke |
| FR-10 | Web UI | Tools and Evaluation served by Worker Static Assets; Recommend is integrated into Tools | Index and task | Browse/recommend/evaluate | Manual + `pages:build` |
| FR-11 | Evaluation | `all-v0.5.0`: provider 24/24, critical safety 4/4, MCP 4/4 | Data, ratings, provider | Eval Report | CI release gate |
| FR-12 | Reports | Eval report implemented; ecosystem report absent | Structured data | Markdown | Source-citation check |
| FR-13 | Corrections | Override and break-glass approval implemented | Request and public evidence | Override Record | Provenance and audit |

## Current Implementation Notes

- `recommend_tools` uses a BYOK LLM provider; local code handles provider routing, prompt context, schema normalization, known Tool ID validation, and high-risk action protection. No local keyword recommender remains.
- OpenAI, MiniMax, and DeepSeek use OpenAI-compatible Chat Completions routing.
- Vite development mounts `/api/*` through the same handler as the Workers API.
- `npm run ingest` implements the minimal draft path; `npm run pipeline` consumes candidates that pass release admission and promotion checks.
- Without `AGENT_RADAR_LLM_API_KEY`, recommendation evaluation emits a blocked summary; this is not a recommendation-quality pass.
- `all-v0.3.3` established the 53-card, 24/24 provider-evaluation, critical-safety 4/4 baseline.
- `all-v0.5.0` passed production release and verification with feedback processing/rating, provider evaluation 24/24, critical safety 4/4, and MCP smoke 4/4; all 53 Rating Results bind to production feedback snapshot `sha256:7321dea6d8c039b7258323880ea710d9d6df4dadfee5995f1fbcf81f0846d69d`.

## Maintenance Rules

- New requirements state target user, trigger, and acceptance method.
- Do not place merely possible future ideas directly into MVP.
- Schema, rating, recommendation, or safety-boundary changes update related docs together.
- If Requirements and Roadmap conflict, return to Product Brief for scope, then adjust Roadmap.
