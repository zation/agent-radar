# 03 System Architecture

## v0.3 P2 Recommendation-Safety Component

`src/recommendation/safety.ts` runs after LLM candidate normalization and before Recommendation Result v2 assembly. It reads the query, Tool Cards, Ratings, and candidates and deterministically produces risk, reason codes, human-confirmation details, and action ceilings. Web, HTTP API, MCP, and build-time golden evaluation reuse the same recommendation path.

## Document Purpose

This document defines Agent Radar's modules, data flows, interface boundaries, and deployment shape. It guides code structure, technology choices, and module evolution.

The goal is not a complex platform. It is a low-cost, replayable, evaluable AI tool rating and recommendation knowledge base.

## Architecture Principles

- Data first: Raw Snapshot, Source Record, Tool Card, Rating Result, and Recommendation Result remain traceable.
- Replaceable modules: collection, parsing, rating, recommendation, and presentation connect through files or explicit interfaces.
- Cloudflare free stack first: TypeScript, JSON, Cloudflare D1 SQLite, and one Worker with Static Assets.
- Replayable: the same data and rules versions reproduce ratings and recommendations.
- Conservative by default: recommend and explain; never automatically install, execute, or authorize third-party tools.

## Logical Architecture

```text
Source Registry
  -> Crawler
  -> Raw Snapshot Store
  -> Parser
  -> Source Record Store
  -> Normalizer
  -> Tool Card Store
  -> Taxonomy Classifier
  -> Rating Engine
  -> Search Index Builder
  -> Recommendation Engine
  -> Cloudflare Worker Static Assets + HTTP API + MCP Streamable HTTP + Reports
  -> Eval Runner
  -> Feedback / Override Records
```

## Core Modules

### Source Registry

Responsibility: record collectable sources, trust, collection policy, and constraints. MVP/v0.2 enables official sources and reviewed public metadata sources. Controlled GitHub topic and npm metadata still pass validation, automatic review, and promotion gates; community directories and news remain disabled.

Inputs: source URL, type, frequency, usage restrictions, and trust assessment.

Output: `SourceDefinition`.

Dependencies: `docs/07-source-registry.md` and source trust levels in the security document.

Failure handling: reject automatic collection without a legality/access record; downgrade repeatedly failing sources to manual review.

Tests: schema, URL format, frequency enum, and trust enum.

### Crawler

Responsibility: fetch public data according to source configuration and save raw snapshots.

Inputs: `SourceDefinition` and previous crawl state.

Outputs: `Raw Source Snapshot` and crawl logs.

Dependencies: network access, rate-limit policy, and snapshot storage.

Failure handling: retry network failures, back off on rate limiting, and leave structural changes to the parser.

Tests: HTTP fixtures and error-snapshot persistence.

### Raw Snapshot Store

Responsibility: store immutable raw data for parser replay.

Inputs: crawler content and request metadata.

Outputs: snapshot path/object reference and content hash.

Storage: MVP uses `data/raw/<source_id>/<date>/<hash>.json` or `.html`; production may use object storage or R2.

Failure handling: never overwrite a hash collision; stop admission for the current source on write failure.

Tests: immutability and hash/content consistency.

### Parser

Responsibility: transform source-specific formats into Source Records.

Inputs: Raw Snapshot and parser version.

Outputs: `Source Record` and parse errors.

Dependencies: source-specific logic and the data-model document.

Failure handling: one record failure does not stop the whole source; preserve unparsed fields in `raw_fields`; record parser failure on structural change.

Tests: source fixtures and structural-regression cases.

### Normalizer

Responsibility: merge, deduplicate, and normalize Source Records into Tool Cards.

Inputs: Source Records, manual override records, and deduplication rules.

Outputs: Tool Card and field-level provenance.

Dependencies: `docs/04-data-model.md` and `docs/05-taxonomy.md`.

Failure handling: retain competing sources and lower confidence on critical conflicts; incomplete records remain drafts and cannot enter reliable recommendations.

Tests: field mapping, conflict merge, and deduplication.

### Taxonomy Classifier

Responsibility: add primary type and multidimensional tags.

Inputs: Tool Card draft and taxonomy rules.

Outputs: classified Tool Card plus classification confidence and explanation.

Failure handling: conflicts become `needs_review`; an unknown primary type excludes preferred recommendation.

Tests: classification fixtures and mixed CLI/Framework boundaries.

### Rating Engine

Responsibility: create ratings and explanations from shared and type-specific rules.

Inputs: Tool Card, rating-rules version, and security-risk rules.

Output: `Rating Result`.

Dependencies: `docs/06-rating-rules.md` and `docs/11-security-and-trust.md`.

Failure handling: missing evidence lowers evidence quality; missing high-risk fields receive a conservative risk level.

Tests: dimension units, example snapshots, and rating regression.

### Search Index Builder

Responsibility: build indexes for search, filtering, and recommendation retrieval.

Inputs: Tool Cards and Rating Results.

Outputs: static search index, Cloudflare D1 SQLite tables, and publishable static JSON.

Storage: MVP uses D1 FTS/LIKE plus build-time static JSON. Extend D1 first; evaluate another search service only when free public-site queries cannot meet requirements.

Failure handling: schema mismatch stops index publication; a single indexing failure enters the data-quality report.

Tests: golden search cases and index-field completeness.

### Recommendation Engine

Responsibility: call an LLM with task context, Tool Cards, Rating Results, and risk preference, then validate and normalize its output into an auditable `Recommendation Result`.

Inputs: Recommendation Query, Tool Cards, Rating Results, risk preference, and user-provided LLM API key/model.

Output: `Recommendation Result`.

Dependency: `docs/09-recommendation-engine.md`.

Failure handling: missing key/model returns a recoverable error; unknown `tool_id` enters `rejected_candidates`; insufficient candidates return `no_reliable_match`; local safety never normalizes high risk to direct `use`.

Tests: fake-client contracts, real-provider golden queries, and explanation review.

### Cloudflare Worker HTTP/MCP API

Responsibility: expose read-only HTTP and stateless `/api/mcp` Streamable HTTP from the same Worker. The MCP route uses `@modelcontextprotocol/server@2.0.0-beta.3` with Web Standard request handling rather than a handwritten JSON-RPC dispatcher.

Inputs: HTTP API requests or MCP Streamable HTTP JSON-RPC messages.

Outputs: JSON Tool Cards and recommendations.

MVP tools: `search_tools`, `get_tool_card`, `recommend_tools`, and `explain_rating`. `src/api/tool-contracts.ts` is the shared schema and annotation authority for HTTP, manifest, and MCP surfaces; every public input property, including nested filter properties, carries a human- and agent-readable description in the generated JSON Schema. `src/api/tool-service.ts` owns transport-neutral business behavior.

Runtime boundary: same Static Assets deployment as Web and data artifacts; read-only for tool execution/installation; incomplete parameters return recoverable errors. `recommend_tools` receives a request credential through `X-Agent-Radar-LLM-API-Key`, then an explicit server fallback, and never through tool arguments. Host, Origin, method, CORS, and UTF-8 byte-size guards execute before the SDK handler.

Tests: schema contracts, recursive public-parameter description coverage, request/response examples, and seven deployed smoke checks covering initialization, tool listing, three representative read calls, missing recommendation credential, and write-method rejection using the URL reported by Wrangler deploy.

### Web UI

Responsibility: human browsing, search, recommendation, and evaluation transparency.

Inputs: static index, Tool Cards, Rating Results, Golden Queries, and Eval Summary.

Outputs: Tools workspace, Tool details, recommendation state, and Evaluation view.

Failure handling: display release errors for version mismatch; keep low-confidence fields visible; treat missing evaluation results as failures.

Tests: rendering, interaction, responsive drill-in, and data contracts.

### Eval Runner

Responsibility: run data-quality, rating, recommendation, safety, and regression evaluation.

Inputs: Tool Cards, Rating Results, Recommendation Results, and Eval Cases.

Outputs: Eval Report and critical safety gate. Eval Diff remains Backlog.

v0.7 adds internal token-usage evidence beside the Eval Report. The OpenAI-compatible provider adapter normalizes response-level input, cached-input, output, and total token counts through an optional observer; it does not add usage to `RecommendationResult`. The Eval Runner owns case and retry identity, records one attempt for every actual provider request, and gives the build pipeline a concurrency-safe collector. The collector emits sorted `eval_token_usage.v1` evidence, while HTTP, MCP, Web, and the Eval Summary keep their existing contracts.

Failure handling: critical failures block release; non-critical failures produce a risk report. Missing or malformed provider usage becomes non-blocking `unavailable` evidence. Invalid usage artifact schema, release identity, ordering, arithmetic, case identity, manifest summary, or checksum blocks reviewed-bundle finalization.

Tests: runner self-tests, retry/concurrency usage accounting, artifact tamper detection, public-contract leakage checks, and report fixtures.

## Data Flows

### Ingestion

```text
source definition -> crawl -> raw snapshot -> parse source record
  -> normalize tool card -> classify -> validate -> store
```

### Rating and Indexing

```text
tool card -> rating engine -> rating result -> index builder
  -> static index -> search/recommendation
```

### Recommendation Query

```text
task query -> intent extraction -> candidate retrieval -> hard filters
  -> score composition -> risk adjustment -> explanation -> recommendation result
```

### Feedback Improvement

```text
v0.4 Web UI
  -> GitHub OAuth identity
  -> D1 unique Tool Card vote
  -> optional prefilled GitHub Issue Form
  -> Release All reviewed bundle build
  -> deterministic validation + constrained LLM triage
  -> accepted/rejected/needs-human-review
  -> immutable vote and accepted-Issue snapshot
  -> feedback_rules.v0.1 adjustment
  -> rating/eval/review
  -> production approval and release
```

v0.4 P1 added GitHub OAuth, signed session cookies, and vote writes to the production Worker. Users submit free-text reasons directly to GitHub; D1 never stores them. Sessions are 30-day stateless HMAC-signed HttpOnly cookies. D1 stores current votes and fixed-window mutation counts only. v0.4 P2 processes feedback during the existing `Release All` reviewed-bundle build and adds no separate Data/MCP/Web release workflow.

## Storage Guidance

| Data | MVP storage | Later option |
| --- | --- | --- |
| Source Registry | JSON | D1 table |
| Raw Snapshot | Filesystem + Git LFS or object reference | R2/S3 |
| Source Record | JSONL + D1 | D1 table |
| Tool Card | JSONL artifact + D1 seed | D1 table |
| Rating Result | JSONL artifact + D1 seed | D1 table |
| Search Index | Static JSON in same Worker deployment | Optimized D1 index |
| Eval Case | JSON | D1 table |
| Eval Report | Markdown/JSON | Dashboard |
| GitHub User / Session | No OAuth-token storage | HMAC cookie with user ID, public username, expiry |
| Tool Card Vote | None before v0.4 | v0.4 P1 D1, unique `github_user_id + tool_id` |
| Feedback Reason | None before v0.4 | GitHub Issue, never copied to D1 |

## Technology Choices

### MVP

- Language: TypeScript.
- Data: JSON source/release artifacts plus Cloudflare D1 SQLite-compatible read model and seed; v0.2 production reads static artifacts from the same Worker.
- Local development: SQLite-compatible D1 schema and migrations.
- Updates: manually triggered build/import.
- Web/API/MCP: one Worker with Static Assets.
- Cost: free tiers only; no paid services.

### Production Evolution

- API: Cloudflare Workers.
- Object storage: evaluate R2 only when necessary and within free limits.
- Database: Cloudflare D1 SQLite.
- Search: evolve D1 and static JSON first.

## Module Boundary Rules

- Crawler never makes recommendation decisions.
- Parser never rates.
- Normalizer never discards original evidence.
- Rating Engine never mutates Tool Cards.
- Recommendation Engine never bypasses safety; LLM output passes local schema, known-ID, and high-risk action validation.
- Web UI never implements recommendation logic different from the API.
- Eval Runner evaluates and never silently changes expected results.
- Eval token accounting observes provider requests and never changes recommendation, safety, or pass/fail decisions.

## Release Pipeline

```text
checkout
  -> validate source registry
  -> crawl selected sources
  -> parse snapshots
  -> normalize tool cards
  -> validate schema
  -> classify
  -> rate
  -> build index
  -> run eval
  -> release admission + promotion check
  -> persist auto-review results in immutable reviewed bundle
  -> GitHub production environment approval
  -> deploy reviewed bundle to one Cloudflare Worker
  -> MCP deploy-output smoke
  -> persist production release evidence
```

Normal review does not generate per-item approval requests. Scripts, rules, LLM evaluation, automatic review, release admission, and promotion-check results remain in the reviewed bundle. The GitHub `production` environment gate is the only routine human release confirmation. `Approval Record` is evidence-backed break-glass only; high-risk execution, destructive actions, and safety-boundary changes still require confirmation.

`all-v0.6.4` is the current verified production baseline. Release All run `29307115828`, commit `f7902af30e2d566c0a7900a8e03ed00e9067a856`, and deployment `5435538293` bind the reviewed bundle and production evidence; real-provider golden evaluation 24/24, critical safety 4/4, and deployed `/api/mcp` smoke 7/7 passed. Registry workflow run `29307691850` independently bound and verified the active/latest official remote record.

## v0.4 P2 Feedback Processing

The `Release All` build first queries production D1 for Tool-level aggregate counts and reads Tool Feedback Issues from the fixed `zation/agent-radar` repository with `issues: read`. A deterministic parser validates fields, Tool IDs, votes, and label state. Only unprocessed open Issues enter `feedback_classifier.v0.1`, one isolated request per Issue, maximum concurrency 4, maximum 50 new Issues per release, and one retry.

The build emits `feedback_vote_snapshot.v1`, `feedback_classification.v1`, `feedback_processing_plan.v1`, and `feedback_summary.v1`; Rating Engine then emits `rating_result.v2`. GitHub writes never occur during build. After production approval, the deploy job uses `issues: write` to recheck `updated_at`, processing labels, and the hidden idempotency marker; it must finish comment/label/close before D1 migration and Worker deployment.

Feedback resolves against the previous published reviewed Tool Cards because users can submit feedback only for production Tools. The pipeline sends the same final ratings to search, recommendation, HTTP API, MCP, D1 seed, and Web artifacts.

## Extension Points

- New source: add SourceDefinition and parser.
- New tool type: update taxonomy, Tool Card constraints, rating rules, and evaluation cases.
- New rating dimension: update rules, Rating Result schema, and evaluation.
- New recommendation strategy: update recommendation engine and golden queries.
- New output channel: reuse the same Recommendation Result.

## Relationship to Other Documents

- Data structures: `docs/04-data-model.md`.
- Taxonomy: `docs/05-taxonomy.md`.
- Rating rules: `docs/06-rating-rules.md`.
- Sources and ingestion: `docs/07-source-registry.md` and `docs/08-crawler-and-ingestion.md`.
- Recommendation: `docs/09-recommendation-engine.md`.
- Evaluation: `docs/10-evaluation-plan.md`.
- Safety: `docs/11-security-and-trust.md`.

## Maintenance Rules

- Before adding a module, explain why existing modules cannot own the responsibility.
- Reflect actual code, not an unimplemented blueprint.
- Module-boundary changes update requirements, data model, and evaluation together.
