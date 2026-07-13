# 08 Crawling and Ingestion

## Purpose

This document defines collection, parsing, deduplication, normalization, validation, and storage. It guides crawler, parser, normalizer, deduper, validator, and release-pipeline implementation.

The system optimizes for replayability, explainability, and auditability, not maximum crawl volume.

## Current Implementation

The v0.3 P1 data-trust baseline is complete. Default release data is built from enabled Source Registry entries, cross-source normalization, data-quality checks, and release admission. The verified production exercise produced 53 reliable Tool Cards.

The release pipeline is:

```text
src/ingestion/source-registry.ts
  -> crawl enabled sources
  -> parse Source Records
  -> normalize Tool Card drafts
  -> normalization evidence + provenance v2 + conflict report
  -> validate + deduplicate + URL checker v2
  -> automatic review
  -> release admission
  -> generate promotion candidates
  -> promotion check
  -> data quality report
  -> Rating Engine
  -> Search Index Builder
  -> Eval Runner
  -> public/data/*.json|jsonl
  -> public/data/d1_seed.sql
```

`npm run pipeline` reads the Source Registry and executes ingestion, normalization, deduplication, release admission, and the promotion check. Only candidates that pass release gates become reliable Tool Cards. Source-code seed cards are not production release inputs.

`npm run ingest` produces:

```text
data/crawl_plan/source_crawl_plan.json
data/crawl_audit/crawl_audit.json
data/raw/<source_id>/<YYYY-MM-DD>/<hash>.json
data/source_records/<source_id>.jsonl
data/discovery_candidates/tool_repositories.json
data/tool_card_drafts/<source_id>.jsonl
data/approvals/approval_records.json
data/intervention_requests/tool_card_drafts.json
data/intervention_requests/tool_card_drafts.jsonl
data/field_provenance/tool_card_fields.json
data/field_provenance/tool_card_fields.v2.json
data/conflicts/tool_card_conflicts.json
data/dedup/tool_card_duplicates.json
data/review_queue/tool_card_drafts.json
data/release_admission/tool_card_drafts.json
data/promotion_candidates/tool_cards.json
data/promotion_candidates/promotion_plan.json
data/promotion_candidates/promotion_check.json
```

### Enabled Collection and Parsers

Controlled enabled inputs include GitHub topic discovery, npm package metadata, exact GitHub repository metadata, and official documentation pages.

- `github_topic_parser` parses public GitHub Search API repository payloads and records rate-limit response metadata. Collection sends no authorization header, cookie, or private token.
- `github_repo_parser` handles a reviewed exact public repository and avoids relying only on incidental topic-search coverage.
- `npm_package_parser` extracts package name and URL, repository and homepage URLs, license, latest version, and last release time.
- `official_docs_parser` extracts only the fixed page title and description and copies the reviewed `SourceDefinition.profile` into the Source Record. It does not infer permission facts from body text.
- `manual_seed_parser` remains available for tests and manual fixtures but is not a default release source.

Repository and package records enter `tool_discovery_candidates.v2` and generate conservative Tool Card drafts. Public metadata may support repository, package, license, stars, last commit or release, topics or keywords, maintenance, and medium-risk security notes. It never upgrades a community repository or package to official or high trust automatically.

GitHub topics, stars, repositories, and packages are discovery signals only. Every candidate must pass parsing, validation, deduplication, automatic review, release admission, and promotion checks.

### Normalization, Review, and Promotion

The minimum cross-source normalizer groups evidence by canonical repository or package key and merges evidence references, source URLs, and package URLs. The review queue reports duplicate signals against published Tool Cards and same-batch drafts. Intervention artifacts distinguish `published_duplicates` from `draft_duplicates` and include validation context.

Automatic review emits `tool_card_auto_review.v1` with a suggested action, evidence URLs, primary risks, missing fields, reasons for review, and a release-admission scorecard. A reviewed exact-source profile can explain optional upstream metadata gaps, such as description or license, but parser warnings still count in the quality report. Unprofiled discovery collections such as `awesome-*` are rejected as individual tools and do not create unresolved interventions.

Default release admission requires an automatic-review recommendation of `promote` and no unresolved duplicates, critical conflicts, missing required fields, or other review reasons. `approval_record.v1` is only a break-glass `approval_override`, never the normal review path.

Discovery candidates use `pending_production_gate` and `review_in_production_gate` to describe bundle-level review concerns instead of requesting item-by-item approval. High risk alone does not prevent a profile-backed card from entering the catalog. Execution remains guarded by `security.requires_human_approval` and recommendation outcomes such as `ask_human` and `no_reliable_match`.

Promotion candidates copy eligible drafts and their `auto_review` or `approval_override` evidence into a separate artifact. The promotion plan identifies the target artifact, candidate path, recommended release action, and pre-release checks. The promotion check dry-runs duplicate-ID and Tool Card validation checks. `npm run pipeline` consumes only candidates that pass that check.

### Overrides, Approval Records, and Interventions

An Override Record may correct draft normalization only. It never overwrites a Raw Snapshot or Source Record and never publishes directly. It requires `reason`, `created_by`, and at least one `evidence_urls` entry. Applied override IDs enter draft `evidence_refs` so validation can audit their context.

An `approval_record.v1` is a break-glass input. It records `approved`, `rejected`, or `needs_changes` only when automatic review cannot close a case and a maintainer explicitly overrides it. It requires `reviewer`, `reason`, `source_record_id`, and `reviewed_at`.

For unresolved drafts, ingestion emits `tool_card_intervention_requests.v1` with `pending_intervention`, `duplicate_review_required`, and `blocked_validation` summaries. Items include `suggested_action: resolve_before_release`, published and draft duplicate IDs, validation errors and warnings, and the Source Record ID. The JSONL form supports quick lookup from reviewed-bundle materials. The system does not emit approval templates or require per-item confirmation JSON.

### Provenance, Conflicts, and URL Validation

During migration, ingestion emits both `tool_card_field_value_provenance.v1` and v2. Version 2 preserves every candidate Source Record for each critical field, including field path, value summary, parser and normalizer versions, transformation type, selection state, and reason. Selection order is override, direct official evidence, exact repository or package, controlled discovery, confidence, then freshness. Unexplained critical semantic conflicts enter `tool_card_conflict_report.v1`. Version 1 preserves the original single-source summary semantics.

URL checker v2 receives history explicitly or restores it from the previous reviewed artifact. Without history it records that no baseline exists; it never silently reads arbitrary workspace files. Checks use bounded concurrency, per-request timeout, limited retry, and one minimal GET fallback when HEAD is unsupported. Requests never send cookies, authorization, or API keys.

Redirects are validated one hop at a time. HTTPS downgrade, private or non-public addresses, and unreviewed cross-site targets are blocked. A small explicit allowlist covers reviewed official domain migrations. Each Tool Card field path retains its own result and history.

### Stable-Data Fallback and Semantic Diffs

Release All restores the previous reviewed bundle's Source Registry, Data Quality Report, and ingestion Source Records. If a source with `preserve previous stable data` fails, only that source falls back to its prior records. The crawl audit and Review Summary retain the failure signal; an empty response must not silently remove reliable cards.

Source Registry and Tool Card semantic diffs compare against the previous reviewed bundle. Build timestamps and refreshed evidence references are not treated as content changes.

### Data-Quality and Immutable-Bundle Gates

Before rating, indexing, or D1 seed generation, `npm run pipeline` requires `data_quality_report.v1` to meet all of these gates:

- Reliable Tool Cards: 50 through 150.
- Critical provenance coverage: 100 percent.
- Unresolved critical conflicts: zero.
- Unresolved duplicates: zero.
- Blocking URLs: zero.
- Pending interventions: zero.
- Blocked promotion candidates: zero.

Failures emit stable reason codes and evidence paths inside the bundle.

The ingestion terminal JSON summary reports snapshots, Source Records and IDs, discovery candidates, interventions, field-value provenance, automatic review, release admission, promotion candidates, and the promotion plan. The reviewed-bundle manifest and review Markdown also include discovery, intervention, and automatic-review summaries.

`npm run promotion:check -- dist-pages/data/promotion_candidates/promotion_check.json` checks the exact immutable reviewed-bundle artifact. A blocked candidate produces a nonzero exit code. The command reads only; it does not mutate release data.

The release pipeline also emits:

- `data/source_registry.json` with `source_registry.v1`, current definitions, and base validation.
- `data/source_registry_diff.json` with added, removed, and changed sources plus field-level review requirements.
- `data/source_registry_review.json` with pending requirement summaries.
- `data/source_registry_review_requests.json` with actions such as `review_in_production_gate`.
- `data/tool_card_validation.json` and `data/tool_card_field_provenance.json` with validation and evidence coverage.

These are reviewed-bundle evidence. They do not enable sources, raise trust, or require per-field confirmation records. Failed Tool Card validation blocks artifact generation.

## Current Limits

The following capabilities remain partial:

- Crawl Plan generation currently emits a minimum artifact with `ready`, `disabled`, or `blocked` state.
- General external HTTP and API throttling and retry are incomplete; the GitHub topic path records rate-limit metadata.
- Parser coverage currently centers on `manual_seed_parser`, `github_topic_parser`, `github_repo_parser`, `npm_package_parser`, and `official_docs_parser`.
- Cross-source normalization, deduplication, and override auditing currently cover minimum repository and package keys and duplicate signals against published and same-batch drafts.
- Source Registry validation checks enabled parser support, owner, `last_reviewed_at`, and robots and terms reviews, then emits field-level production-gate evidence.
- Reviewed-bundle Markdown currently shows discovery, interventions, automatic review, blocked release-admission reasons, promotion details, the promotion plan, and promotion-check results.
- Ecosystem-specific semantic validation can expand further. Current output already includes schema provenance, field-value provenance v1 and v2, conflict reports, and URL validation v1 and v2. Set `AGENT_RADAR_CHECK_URLS=true` for live URL checks.

The remaining sections define the target contract. They do not claim that every capability is fully implemented.

## Review Loop

The auditable release guardrail is:

```text
Source Records
  -> automatic evidence summary
  -> rules and LLM review summary
  -> Tool Card drafts
  -> user and recommendation feedback summary
  -> release-admission scorecard
  -> promotion candidates
  -> whole-bundle review at the GitHub production gate
```

Code rules, LLM-backed evaluation, automatic review, promotion checks, and GitHub `production` environment approval jointly perform review. Normal review persistence lives in the immutable reviewed bundle, manifest and checksums, GitHub run, SHA and tag, and deployment evidence. Humans review the whole bundle at the environment gate; they do not complete item-by-item approval JSON.

### Automatic Evidence Review

Automatic review may use:

- Official documentation, READMEs, registry entries, package metadata, and releases.
- GitHub stars, recent commits, release frequency, issue activity, licenses, and topics.
- Package download, version, update, and maintenance signals.
- Community references as weak signals only.
- Known permission risks involving tokens, file writes, shell, email, databases, payments, cloud accounts, or production access.

`review_summary` must include a suggested action from `promote`, `keep_draft`, `needs_review`, `reject`, or `retire`; primary evidence URLs; risks and missing fields; duplicates and parser or validator warnings; confidence; and reasons for production-gate attention.

An LLM may reason only from collected Source Records, the draft, ratings, and feedback summary. It must not present uncited external knowledge as fact, waive high-risk execution approval, or replace the production gate.

### User Feedback

Future Web UI and MCP or API feedback should support recommendation votes, unsuitable-result reports, Tool Card corrections, installation or documentation failures, unexpected permissions, and structured outcomes such as `worked`, `failed`, `partial`, or `unsafe`.

Feedback never mutates a Tool Card, rating, or recommendation rule directly. It first enters review material and evaluation reports to reveal errors, create intervention evidence, adjust fields, or add golden queries.

### Release-Admission Scorecard

The scorecard combines evidence quality and completeness, maintenance freshness, security and permission clarity, feedback usefulness and failure rates, recommendation errors, duplicates, and source conflicts.

| Action | Meaning | Reliable release |
| --- | --- | --- |
| `promote` | Evidence is sufficient, risk is explainable, and feedback is healthy | Low or medium risk may enter candidates, still behind the release gate |
| `keep_draft` | Basic information exists but evidence is insufficient | no |
| `needs_review` | Risk, duplication, feedback, or sources are disputed | no; fail closed and preserve reasons in the bundle |
| `reject` | Out of scope or unacceptable risk | no |
| `retire` | A released tool is unavailable or has sustained negative evidence | no; removal requires human confirmation |

`needs_review` is fail closed. The production gate can inspect the blocker but cannot clear it. Only a valid `approval_record.v1` can act as a break-glass override.

The production gate emphasizes high-risk permissions, reduced risk levels, raised source trust, sharp negative-feedback increases, disagreement between LLM and rule review, conflict between community and official evidence, and large automatic promotion or retirement batches.

## Target Process

```text
Source Registry
  -> Crawl Plan
  -> Crawler
  -> Raw Snapshot Store
  -> Parser
  -> Source Record Store
  -> Deduper
  -> Normalizer
  -> Tool Card Validator
  -> Rating Engine
  -> Search Index
  -> Eval Runner
  -> Publish
```

## Run Modes

Daily incremental and weekly full runs are not scheduled in the MVP. Maintainers trigger collection, import, rating, indexing, and release manually.

- Daily incremental is intended for high-priority official sources, known repository and package updates, stale links, and retries.
- Weekly full is intended for official and manual sources plus controlled `github-topic-mcp` and `npm-modelcontextprotocol-sdk` metadata. Community directories stay disabled.
- Monthly quality review samples automatic-review and bundle evidence, retires stale sources, and produces quality reports.
- Manual runs add sources, fix parsers, investigate recommendation errors, and verify releases.

## Crawl Plan and Crawler

```yaml
id:
run_type: daily_incremental | weekly_full | monthly_review | manual
source_ids:
started_at:
rules:
  respect_rate_limits: true
  max_failures_per_source:
  retry_policy:
```

Every run records a data version, may select a subset of sources, and must exclude disabled sources.

The crawler stores public content as immutable Raw Snapshots. It respects Source Registry limits, sends no user secret, cookie, or private token, records failures, and performs no field inference.

| Failure | Behavior |
| --- | --- |
| Network timeout | Retry with exponential backoff |
| HTTP 429 | Stop that source for the run and record `rate_limited` |
| HTTP 404 | Mark the source or tool as potentially unavailable |
| HTTP 5xx | Retry, then retain stable prior data |
| Content-type change | Store the snapshot and let the parser report the incompatibility |

Raw content is immutable, includes source ID, date, and content hash in its path, stores the hash in metadata, and excludes sensitive request metadata:

```text
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.json
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.html
data/raw/<source_id>/<YYYY-MM-DD>/<content_hash>.meta.json
```

## Parser, Deduper, and Normalizer

A source-specific parser converts Raw Snapshots to Source Records. It preserves original fields, performs no cross-source merge or rating, never represents guesses as facts, emits warnings and errors, and records its version. Every parser requires fixtures, and source-shape changes must fail clearly.

Deduplication signals, in order, are canonical repository URL, package name plus registry, homepage URL, reciprocal official links, similar name plus maintainer, and similar name plus description. Strong matches may merge automatically. Weak matches emit `possible_duplicates`, block promotion, and enter production-gate review. Uncertain records remain separate drafts.

Canonical URLs remove trailing slashes, normalize GitHub casing and `.git` suffixes, and retain the validated canonical redirect target.

The normalizer merges Source Records into Tool Cards:

| Field | Merge rule |
| --- | --- |
| `name` | Prefer the official name and preserve aliases |
| `summary` | Prefer official documentation; preserve evidence for manual rewriting |
| `type` | Apply the taxonomy |
| `source_urls` | Merge all supporting sources |
| `license` | Prefer the official repository license |
| `install_methods` | Prefer official documentation and package registries |
| `permissions` | Merge conservatively; unknown evidence never lowers risk |
| `maintenance` | Combine repository, release, and package metadata |
| `security` | Derive from permissions, source trust, and security rules |
| `confidence` | Combine completeness and source quality |

Factual conflicts preserve all sources, select by source priority, and emit warnings. Risk conflicts use the more conservative conclusion. Classification conflicts become `needs_review`.

## Tool Card Validation

Schema validation checks required fields, enum values, URLs, and timestamps. Quality validation requires nonempty `source_urls`, `use_cases`, and `not_for`; at least one installation method or explicit `unknown`; an explicit permissions array; and acceptable freshness.

Reliable recommendation eligibility requires at least `medium` overall confidence, complete critical fields, a known risk level, at least one trusted source, and no `deprecated` or `needs_review` status unless the query explicitly asks for it.

## Storage and Incremental Updates

MVP storage uses JSON artifacts and Cloudflare D1 SQLite:

```text
data/source_records/*.jsonl
data/tool_cards/*.jsonl
data/ratings/*.jsonl
data/index/*.json
data/evals/*.json
migrations/*.sql
```

JSON and JSONL remain source and release artifacts. D1 is the query store for the public site and Worker MCP API. Each run creates a new version, a release pointer selects the stable version, and rollback to the prior version remains possible.

Incremental triggers include content-hash, repository release or commit, package version, manual override, parser version, and normalizer version changes. Unchanged snapshots are not reparsed. Parser changes may replay existing snapshots. Rating-rule changes rerun rating and indexing; recommendation-rule changes rerun recommendation evaluation.

## Quality Metrics and Logging

| Metric | MVP threshold |
| --- | --- |
| Required-field completeness | at least 90 percent |
| Source coverage | track official or multi-source share |
| Possible duplicate rate | continuously decrease |
| Stale-record rate | at most 20 percent |
| Parser failure rate | at most 10 percent |
| Low or unknown confidence share | continuously track |

Low critical-field completeness blocks the reliable recommendation index. Rising parser failure retains the prior index and raises an alert. Missing high-risk fields exclude affected tools from recommendation.

Every pipeline run logs run ID, data version, sources, success and failure counts, candidate additions and changes, parser warnings, validator failures, and evaluation summary. Logs must never include tokens, cookies, private URLs, or private user data.

## Manual MVP Release

```text
checkout
  -> install dependencies
  -> validate Source Registry
  -> crawl enabled sources
  -> parse, normalize, validate, and deduplicate
  -> run automatic review and release admission
  -> generate promotion candidates and plan
  -> run promotion check
  -> rate, index, and evaluate
  -> upload the reviewed bundle and review materials
  -> obtain GitHub production environment approval
  -> deploy the same immutable bundle to the single Cloudflare Worker
  -> run deployed Worker MCP smoke checks
  -> record release evidence with run, SHA, tag, and checksums
```

The MVP has no automatic schedule. Maintainers release by pushing an immutable `all-v*` tag. `workflow_dispatch` may select only an existing `all-v*` tag; branches and other references are rejected. The project introduces no paid runner, paid database, or closed data source. A failed promotion check blocks reviewed-bundle upload and deployment.

Cost controls include source-count limits, ETags or content hashes, lower frequency for low-priority sources, and replaying snapshots instead of refetching them.

Isolated failures in non-MVP candidate sources, individual 404 pages, low-priority rate limits, and missing noncritical fields need not block the whole pipeline. Schema failure, mass Tool Card ID changes, loss of every core official source without fallback, missing security fields at scale, severe golden-query regression, or index and data version mismatch must block release.

Intervention or production-gate attention includes possible duplicates, classification conflicts, unknown permissions on powerful tools, rating changes beyond thresholds, recommendation upgrades from `avoid` or `consider` to `recommended`, and deprecated tools.

## Related Documents and Maintenance

- Source definitions: `docs/07-source-registry.md`.
- Data contracts: `docs/04-data-model.md`.
- Taxonomy: `docs/05-taxonomy.md`.
- Rating rules: `docs/06-rating-rules.md`.
- Security: `docs/11-security-and-trust.md`.
- Evaluation thresholds: `docs/10-evaluation-plan.md`.

Parsers must preserve raw fields whenever possible. A single source failure should not stop the pipeline unless all core sources are unavailable. Any ingestion-rule change must document its impact on existing Tool Cards, ratings, and indexes. Treat source legality and high-risk permission data conservatively.
