# Development Guide

This guide covers local setup and the daily development workflow for Agent Radar. Product positioning belongs in [README.md](README.md); production deployment, release approval, monitoring, and rollback remain authoritative in [Deployment and Operations](docs/12-deployment-and-ops.md).

## Prerequisites

- Node.js 22, matching the release workflow runtime.
- npm, using the committed `package-lock.json`.
- A local checkout of the repository.
- Optional provider credentials for live recommendation evaluation.
- Wrangler access only when working on Cloudflare-specific behavior.

## Local Setup

Install dependencies:

```bash
npm install
```

Create a local environment file from the safe example:

```bash
cp .env.example .env
```

`.env` is git-ignored. Never commit API keys, OAuth secrets, session secrets, Cloudflare credentials, or production data.

Live recommendation and evaluation commands use the following optional local variables:

```dotenv
AGENT_RADAR_LLM_API_KEY=your-provider-key
AGENT_RADAR_LLM_MODEL=MiniMax M3
AGENT_RADAR_LLM_BASE_URL=https://api.minimaxi.com
```

Shell environment variables and CI secrets take precedence over `.env`. A provider base URL override changes only the endpoint; the selected model label still determines provider routing.

## Local Development Stack

Start the complete local application:

```bash
npm run dev
```

The command prepares the six artifacts required by the UI and Worker, builds the Web assets, applies local D1 migrations, and starts:

- Vite with React HMR at `http://127.0.0.1:5173`.
- Wrangler Worker API with local D1 at `http://127.0.0.1:8787`.
- A Vite proxy from same-origin `/api/*` requests to the local Worker.

The local stack never writes to production D1. The development GitHub OAuth callback is `http://127.0.0.1:5173/api/auth/github/callback`.

Run individual parts when a focused workflow is faster:

```bash
npm run dev:data
npm run dev:db
npm run dev:api
npm run dev:ui
```

`npm run dev:data` validates downloaded responses, rejects HTML fallbacks or malformed JSON/JSONL, and does not replace valid local data with an invalid response.

## Development Commands

| Command | Purpose |
| --- | --- |
| `npm run build` | Compile TypeScript into `dist/` |
| `npm test` | Compile, run the Node test suite, and enforce public-language rules |
| `npm run lint` | Run ESLint across the repository |
| `npm run stylelint` | Validate UI CSS and SCSS |
| `npm run language:check` | Check 18 public documents and 48 Golden Query fields for prohibited CJK text |
| `npm run pages:build` | Build the React/Vite static assets into `dist-pages/` |
| `npm run ingest` | Run controlled Source Registry ingestion |
| `npm run pipeline` | Generate reviewed data, ratings, indexes, evaluation, and reports |
| `npm run eval` | Run all provider-backed Golden Queries |
| `npm run release:check` | Validate a generated Eval Summary for release |
| `npm run mcp:smoke` | Validate a deployed MCP JSON-RPC endpoint |

For ordinary UI work, prefer `npm run dev` or `npm run dev:data`. The full pipeline is a strict release-quality path and may require provider credentials, live URL validation, previous reviewed baselines, and other release inputs.

## Data and Evaluation Workflows

### Ingestion

```bash
npm run ingest
```

Ingestion reads enabled Source Registry entries, stores reproducible Raw Snapshots under `data/raw/`, and produces Source Records, Tool Card drafts, release admission, promotion candidates, and promotion-check evidence. Intermediate ingestion files are generated data and are not long-lived source truth.

### Artifact Pipeline

```bash
npm run pipeline
```

The pipeline consumes candidates that passed the required gates and generates artifacts under `public/data/` and `public/reports/`, including Tool Cards, Rating Results, the search index, D1 seed, manifest, Golden Queries, Eval Summary, provenance, and quality evidence.

Generated `dist/`, `public/data/`, `public/reports/`, and `dist-pages/` content is reproducible output rather than source-controlled release truth. Immutable reviewed bundles and deployed Static Assets preserve release evidence.

### Provider Evaluation

```bash
npm run eval
```

Live evaluation requires `AGENT_RADAR_LLM_API_KEY`. It runs the 24 Golden Queries through the same recommendation and deterministic safety path used by runtime recommendations. Missing credentials, provider failures, schema errors, quality failures, or incomplete critical cases cannot satisfy a release gate.

## Project Entry Points

- `src/schema.ts`: shared data contracts.
- `src/worker.ts`: Cloudflare Worker entry point.
- `src/api/handler.ts`: HTTP API routing and handlers.
- `src/recommendation/`: recommendation, provider routing, and deterministic safety.
- `src/ingestion/`: collection, parsing, normalization, review, admission, and promotion.
- `src/rating/`: explainable rating logic.
- `src/eval/`: Golden Queries, evaluation runner, and release-summary validation.
- `src/pipeline/`: artifact generation and release data assembly.
- `src/ui/App.tsx`: Web application composition.
- `src/ui/`: Tools, Evaluation, details, data loading, and interaction behavior.
- `tests/`: contract, regression, pipeline, safety, API, and UI tests.

Read the relevant authority before changing a domain:

- [System Architecture](docs/03-system-architecture.md)
- [Data Model](docs/04-data-model.md)
- [Taxonomy](docs/05-taxonomy.md)
- [Rating Rules](docs/06-rating-rules.md)
- [Crawler and Ingestion](docs/08-crawler-and-ingestion.md)
- [Recommendation Engine](docs/09-recommendation-engine.md)
- [Evaluation Plan](docs/10-evaluation-plan.md)
- [Security and Trust](docs/11-security-and-trust.md)
- [Web UI](docs/14-web-ui.md)

Coding agents must read [AGENTS.md](AGENTS.md) before implementation.

## Verification

Run checks in proportion to the change. The standard repository verification is:

```bash
npm run language:check
npm test
npm run lint
npm run stylelint
npm run pages:build
git diff --check
```

Also run provider evaluation after recommendation, prompt, provider-routing, Golden Query, or deterministic-safety changes. Run the full pipeline after ingestion, promotion, rating, release-data, or artifact-contract changes.

## Troubleshooting

### The UI reports missing artifacts

Run:

```bash
npm run dev:data
```

The command prepares or retrieves the six runtime artifacts required by the current Tools and Evaluation surfaces.

### Provider evaluation is blocked

Confirm that `.env` contains a key and model accepted by the selected provider region. Authentication, rate-limit, overload, model, timeout, and schema failures remain typed provider errors; do not treat them as recommendation-quality success.

### A local port is already in use

The standard Vite and Wrangler commands use strict ports `5173` and `8787`. Stop the conflicting process before running `npm run dev`, `npm run dev:ui`, or `npm run dev:api` again.

### Local D1 state is missing or stale

Apply the committed migrations to the local database:

```bash
npm run dev:db
```

Do not use local development commands to mutate production D1.

### The strict pipeline fails locally

Read the emitted data-quality, URL-validation, admission, promotion, or provider failure instead of weakening the gate. Release-quality builds may depend on restored baselines and CI-only inputs that ordinary UI development does not need.

## Production Operations

Do not reproduce or improvise production release steps from local development commands. Use [Deployment and Operations](docs/12-deployment-and-ops.md) for the immutable tag workflow, reviewed bundle, GitHub production approval, Cloudflare Worker and D1 operations, smoke checks, production evidence, monitoring, and rollback.
