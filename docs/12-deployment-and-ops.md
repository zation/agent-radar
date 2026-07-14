# 12 Deployment and Operations

## Purpose

This document defines Agent Radar's low-cost deployment, release, monitoring, failure handling, and rollback model.

The goal is replayable data generation, verifiable recommendation releases, and an agent-queryable interface without premature platform complexity.

## Operating Principles

- Use the Cloudflare free stack: Worker Static Assets, Worker API, and D1 SQLite.
- Run schema, data-quality, safety, and provider-backed recommendation evaluation before release.
- Record data, rules, index, release, and commit versions.
- Persist script, rule, LLM evaluation, automatic review, release admission, and promotion evidence in one immutable reviewed bundle.
- Use the GitHub `production` environment gate as the only normal human release confirmation. `approval_override` is evidence-backed break glass only.
- Review and deploy the same object. Production checks out the same immutable tag and SHA, restores reviewed static assets, and never regenerates data after approval.
- Preserve the previous stable release after failure.
- Introduce no paid service without explicit cost, alternative, and rollback review.

## Environments

### Local Development

Local development uses files, JSON or JSONL, Wrangler local D1 with the production-compatible schema, Vite HMR, and a local Worker. It supports parser fixtures, small Tool Card samples, rating, recommendation, and UI work.

### Production

One Cloudflare Worker deployment serves Web, versioned static artifacts, read-only HTTP API, stateless Streamable HTTP MCP, and D1-backed feedback. A release is triggered by an immutable `all-v*` tag or a manual workflow selection of an existing `all-v*` tag.

## Single-Worker Architecture

```text
enabled Source Registry
  -> crawl, parse, and normalize
  -> release admission and promotion check
  -> validate Tool Cards
  -> rate and apply bounded feedback adjustment
  -> build static index and D1 seed
  -> run 24 provider-backed golden queries
  -> build immutable reviewed bundle
  -> GitHub production environment approval
  -> deploy the reviewed assets and same-ref Worker
  -> seven-check deployed MCP smoke and production evidence
  -> evidence-bound GitHub OIDC Registry publication
```

The Worker named `agent-radar` serves:

```text
/                  Web UI
/assets/*          Web assets
/data/*            Release artifacts
/reports/*         Evaluation reports
/api/search_tools
/api/get_tool_card
/api/recommend_tools
/api/explain_rating
/api/mcp_manifest
/api/mcp
/api/version
```

The API reads artifacts from its own deployment. It does not depend on a mutable external `latest` URL. JSON and JSONL remain review, replay, and rollback evidence; D1 stores the public feedback serving state and may serve as a query cache without replacing release artifacts.

Historical Cloudflare Pages workflows are not part of production and have no dual-track compatibility layer.

## Release Identity

`all-vX.Y.Z` represents one complete data, Web, API, and MCP release attempt. Never reuse a failed or superseded tag; increment the patch version. A tag becomes a verified production release only after reviewed-bundle checks, production approval, deployment, smoke checks, and production evidence all succeed. For a Registry release, `all-vX.Y.Z` maps exactly to Registry version `X.Y.Z`; an existing conflicting Registry version is never overwritten.

`all-v0.6.4` is the current verified baseline. Release All run `29307115828` and production deployment `5435538293` bind commit `f7902af30e2d566c0a7900a8e03ed00e9067a856`, reviewed bundle `agent-radar-all-29307115828`, production evidence, and the Worker endpoint. Provider evaluation passed 24/24, critical safety passed 4/4, and MCP smoke passed 7/7. Registry workflow run `29307691850` uploaded `mcp-registry-publication-evidence-29307115828` after independently confirming the active/latest official `io.github.zation/agent-radar@0.6.4` record.

Until separate tracks are intentionally introduced, `all-v*` is the only production release entry point.

## Generated Artifacts

`npm run pipeline` generates release artifacts locally or in CI. Regenerable `public/data`, `public/reports`, `dist`, and `dist-pages` are not source-controlled release truth; GitHub artifacts and deployed Static Assets preserve them.

| Artifact | Example | Purpose |
| --- | --- | --- |
| Source Registry | `public/data/source_registry.json` | Source review |
| Tool Cards | `public/data/tool_cards.jsonl` | Catalog data |
| Ratings | `public/data/ratings.jsonl` | Rating explanations and feedback checksum |
| Search Index | `public/data/search_index.json` | Retrieval |
| Golden Queries | `public/data/golden_queries.json` | Evaluation definitions |
| Eval Summary | `public/data/eval_summary.json` | Release evaluation status |
| D1 Seed | `public/data/d1_seed.sql` | Versioned read-model seed |
| Manifest | `public/data/manifest.json` | Data, schema, rule, index, and release versions |
| Artifact Manifest | `dist-pages/artifact-manifest.json` | Critical checksums and build evidence |

The reviewed bundle also includes provider configuration without secrets, field provenance v1 and v2, conflicts, URL validation v1 and v2, data-quality report, Review Summary v2, discovery and intervention artifacts, automatic review, release admission, promotion evidence, MCP examples, and the smoke checklist.

## Local Commands

```bash
npm test
npm run lint
npm run stylelint
npm run language:check
npm run ingest
npm run pipeline
npm run eval
npm run pages:build
npm run dev
npm run dev:data
npm run dev:api
npm run dev:ui
npm run release:build
npm run promotion:check
npm run data-quality:check
npm run review-summary:check
npm run mcp:smoke
npm run preview:build
```

- `npm test` builds TypeScript and runs the Node suite.
- `npm run language:check` scans the explicit 17-file public-document boundary and rejects Han characters, CJK punctuation, and fullwidth forms. `npm test` runs the same gate, so `release:build` inherits it.
- `npm run ingest` executes the controlled ingestion path.
- `npm run pipeline` generates data, D1 seed, and reports.
- `npm run eval` executes all 24 golden queries and exits nonzero with `blocked_no_key` if no provider key exists.
- `npm run pages:build` builds Vite output into `dist-pages`; the legacy command name avoids migration noise.
- `npm run dev` prepares validated local artifacts, builds assets, applies local migrations, and runs Vite on `127.0.0.1:5173` plus Wrangler on `127.0.0.1:8787`.
- `npm run dev:data` validates HTTP responses, HTML fallbacks, JSON, and JSONL before replacing local artifacts.
- `npm run dev:api` loads `.env` explicitly and runs the local Worker with D1.
- `npm run release:build` runs tests, pipeline, release checks, and Web build.
- `npm run preview:build` runs ingestion and pipeline once, then finalizes the same evidence without a second network collection.
- `npm run promotion:check`, `data-quality:check`, and `review-summary:check` validate immutable candidate artifacts and exit nonzero on blockers.
- `npm run mcp:smoke` validates the deployed Streamable HTTP read-only boundary with seven contract checks.
- `npm run validate:mcp-registry -- --release-tag all-vX.Y.Z` validates the remote-only metadata and immutable version mapping.

## Configuration and Secrets

| Variable | Required | Purpose |
| --- | --- | --- |
| `AGENT_RADAR_LLM_API_KEY` | for provider eval or optional Worker fallback | Explicit server credential; request header takes precedence |
| `AGENT_RADAR_LLM_MODEL` | repository variable | Provider model; default `deepseek-v4-flash`; Release All also deploys it as a Worker variable |
| `AGENT_RADAR_LLM_BASE_URL` | repository variable when using a regional/custom endpoint | OpenAI-compatible endpoint base override injected into Release All and the Worker runtime |
| `AGENT_RADAR_CHECK_URLS` | no | Enable live Tool Card URL checks |
| `AGENT_RADAR_MCP_BASE_URL` | local smoke only | External smoke target override |
| `CLOUDFLARE_API_TOKEN` | CI secret | Worker deploy and D1 migration |
| `CLOUDFLARE_ACCOUNT_ID` | CI secret | Cloudflare account |
| `CLOUDFLARE_PROJECT_NAME` | repository variable | Worker name, default `agent-radar` |
| `GITHUB_OAUTH_CLIENT_ID` | Worker variable | Public OAuth client ID |
| `GITHUB_OAUTH_CLIENT_SECRET` | Worker secret | OAuth exchange secret |
| `AGENT_RADAR_SESSION_SECRET` | Worker secret | At least 32 bytes for session and state signing |

Local `.env` is ignored by Git. System values override `.env`. Browsers never read `.env`; keys remain in local or Worker processes. Logs may include provider, endpoint, model, status code, and redacted errors, but never credentials or raw secret-bearing bodies.

Recommendation API keys are ephemeral. The browser calls the same Worker at `/api/recommend_tools`, keeps the key in component memory, and sends it only as `X-Agent-Radar-LLM-API-Key`; it does not call providers directly. MCP clients use the same optional secret header for `recommend_tools`. The Worker installs, authorizes, and executes no recommended tool.

## Build Once, Review Once, Deploy Reviewed Assets

Release All uses two jobs.

```text
immutable all-v* tag
  -> checkout exact SHA
  -> restore previous reviewed baselines
  -> read aggregate-only production feedback
  -> prepare read-only feedback input
  -> npm run preview:build
  -> data-quality, promotion, and Review Summary checks
  -> Worker dry run with reviewed assets
  -> upload agent-radar-all-<run_id>
  -> wait at GitHub environment: production
  -> download and verify the same bundle
  -> apply approved feedback writeback plan
  -> apply D1 migrations
  -> deploy same-ref Worker with reviewed dist-pages
  -> run MCP smoke
  -> bind the unique production deployment
  -> upload production release evidence
```

The build job forces live URL checks, attempts to restore the last successful Release All baselines, and records `no_baseline` explicitly when none exists. A failed source may preserve only its previous records when its policy allows stable fallback.

The production job does not rerun ingestion, pipeline, evaluation, URL checks, rating, or data-quality reporting.

### Reviewed Bundle Evidence

`agent-radar-all-<run_id>` contains `dist-pages`, full review Markdown under `artifacts/review`, and Wrangler dry-run output. The GitHub Actions summary presents compact release ID and SHA, data version, golden results, source-attention signals, interventions, admission blockers, promotion failures, missing provenance, and crawl failures before approval.

The artifact manifest records Git SHA, data version, eval model and categories, source diffs, crawl, overrides, discovery, intervention, provenance, automatic review, admission, promotion, timestamps, and critical checksums. The checksum-covered data manifest records rules and index versions.

### Production Evidence

After deployment, `agent-radar-mcp-smoke-<run_id>` contains:

- `mcp-smoke-result.json` with initialization, tool listing, read-only calls, and boundary checks.
- `production-release-evidence.json` binding repository, run, SHA, tag, unique production deployment ID, bundle name, manifest SHA, D1 seed and feedback snapshot checksums, Worker and MCP endpoints, and smoke summary.

The workflow resolves exactly one deployment for the current repository, run, SHA, and tag. Evidence validation checks release metadata, manifest SHA binding, D1 checksum, endpoints, and all required smoke checks. Any ambiguity or mismatch fails production.

### MCP Registry Publication Evidence

`.github/workflows/publish-mcp-registry.yml` runs only after a successful `Release All` run or for an explicitly selected successful run ID. It downloads production evidence, source smoke, and the reviewed bundle before checkout; checks out the evidence SHA; rebuilds the production evidence from the reviewed manifest, D1 seed, and smoke result; requires exact endpoint/run/tag/SHA/checksum equality with `server.json`; revalidates `/api/version`; runs fresh MCP smoke against the metadata-derived endpoint; verifies the pinned `mcp-publisher` v1.8.0 archive checksum; validates `server.json`; and authenticates with GitHub OIDC only when publication is required.

`server.json` is remote-only and declares `io.github.zation/agent-radar`, one production `streamable-http` endpoint, the optional secret recommendation header, and no installable package. The publication workflow treats an active/latest identical record as idempotent success and a mismatch at the same name/version as an immutable conflict. After bounded official API polling, `mcp-registry-publication-evidence.json` records the source run/tag/SHA, production-evidence checksum, canonical metadata checksum, Registry active/latest status and timestamps, endpoint, repository, and query identity without request headers.

### Smithery Publication

`npm run publish:smithery` publishes the existing production Streamable HTTP endpoint as `zation/agent-radar` through the pinned `@smithery/cli@4.11.1` package. Run `npx --yes @smithery/cli@4.11.1 auth login` first when the local Smithery session is not authenticated.

The command sends a flat config schema in the deployment payload. `llmApiKey` is optional and is transported as the `X-Agent-Radar-LLM-API-Key` request header, so Smithery can render configuration UI without changing the public MCP tool input schema or putting the credential in a query parameter. The command contains no Smithery token or LLM provider key. Smithery publication is a separate directory release and does not replace the evidence-bound official MCP Registry workflow.

## Feedback Release Order

1. Restore the previous reviewed Tool Cards as the valid feedback Tool-ID boundary.
2. Query production D1 with aggregate-only SQL for per-Tool up, down, and row counts.
3. In the read-only build job, prepare `feedback_build_input.v1`, classify new Issues, and include four feedback artifacts and checksums in the reviewed bundle.
4. Obtain GitHub `production` environment approval.
5. Restore and verify the same bundle, then apply `feedback_processing_plan.v1` with `issues: write`.
6. Only after every Issue action succeeds, apply D1 migrations and deploy.
7. Record feedback rules, vote-snapshot checksum, and processing-plan checksum in production evidence.

Votes and Issues created after the build snapshot wait for the next release. Missing production D1 input, GitHub or LLM read failure, classification failure, or checksum mismatch blocks build. Issue state drift, missing write permission, or comment, label, or close failure blocks deployment.

## Release Gates

All of these must pass:

- Public-document language validation, schema and Source Registry validation.
- `data_quality_report.v1` and `review_summary.v2`, including checksums and no blocking item.
- 24/24 provider-backed golden queries and 4/4 critical safety cases.
- Index build, automatic review, release admission, and promotion check.
- Artifact manifest generation and critical checksums.
- Immutable reviewed-bundle upload and exact restoration.
- One GitHub `production` environment approval.
- D1 migration and approved feedback writeback.
- Deployed MCP smoke and validated production evidence.
- For Registry releases, pinned publisher validation, GitHub OIDC publication or identical-record idempotency, official API polling, and Registry publication evidence.

A missing provider key cannot support a quality claim. Authentication, rate limit, model, endpoint, or schema failure is a provider or configuration failure and must not be hidden by changing expected results.

Warnings may include isolated low-priority source failure, small optional-field gaps, and noncritical ranking changes.

## Monitoring and Alerts

Monitor source success, rate limits, parser warnings, discovered and updated Tools, completeness, staleness, unknown permissions, duplicates, low confidence, golden pass rate, no-match rate, high-risk recommendations, build duration, artifact size, API latency, and rollback frequency.

Block release on critical safety failure, schema failure, manifest mismatch, missing core data, or a material unknown-permission increase. Require review for widespread Top-1 changes, raised high-risk recommendation levels, noisy low-confidence sources, and repeated collection failures.

## Rollback

1. Identify the last stable `all-v*` manifest, Worker deployment ID, and bundle checksum.
2. Prefer Cloudflare Worker deployment rollback. If unavailable, check out the prior immutable ref, restore its reviewed `dist-pages`, and deploy without regenerating data.
3. Restore the matching D1 seed or prior active database when serving data requires it.
4. Mark the failed release `retracted` and record the cause.
5. Add or update an evaluation case to prevent recurrence.

Do not roll back only the index while leaving unmatched data and ratings unless the manifest explicitly supports that composition.

## Retention, Cost, and Failure Policy

Retain raw snapshots for 30 days, all release manifests, critical evaluation reports, migrations, overrides, and release records. Object storage requires a separate free-tier and lifecycle review.

Prefer static files, Worker Static Assets, Workers, D1, then R2 only if the free allowance is sufficient. Any new infrastructure proposal documents why static storage is insufficient, maximum cost, alternatives, migration, and rollback.

| Failure | Response |
| --- | --- |
| One source fails | Preserve its prior data and mark stale |
| Every core official source fails | Block release and investigate |
| Parsers fail broadly | Roll back parser or preserve prior data |
| Ratings become anomalous | Block release and preserve evidence |
| API is unavailable | Roll back the Worker; serve only clearly labeled stable static data if safe |
| Data is contaminated | Roll back the manifest and add data or security evaluation |

## Maintenance Rules

- Optimize for replayability, rollback, and observable evidence.
- Never bypass safety or provider evaluation during release.
- Keep MCP and HTTP tool operations read-only unless the security contract is explicitly revised.
- Document cost and operational burden before adding infrastructure.
