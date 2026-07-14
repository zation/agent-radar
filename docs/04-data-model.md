# 04 Data Model

## Document Purpose

This document defines Agent Radar's core data structures: Raw Source Snapshot, Source Record, Tool Card, Rating Result, Recommendation Result, Eval Case, and review/feedback artifacts. It is the shared contract for ingestion, rating, search, recommendation, evaluation, and agent queries.

Fields must be reviewable by humans and directly usable by coding agents without hidden context.

## Principles

- Every critical conclusion has source or rule evidence.
- Normalized and raw fields remain separate to prevent irreversible loss.
- Missing and uncertain values are explicit, never guessed.
- Every record carries timestamps, schema version, and confidence where applicable.
- Ratings and recommendations reference Tool Cards and never rewrite them.
- Human corrections are override records and never replace raw snapshots.

## Common Conventions

### ID

String, stable, readable, lowercase kebab-case or namespaced. Examples: `mcp-filesystem-server`, `skill-openai-docs`. Do not derive unique IDs from mutable titles.

### Timestamps

ISO 8601 UTC, for example `2026-07-06T12:00:00Z`. Applies to `created_at`, `updated_at`, `last_checked_at`, `fetched_at`, and `rated_at`.

### Confidence

`high` means official or corroborated evidence; `medium` means one trusted or trusted-community source; `low` means incomplete, indirect, or conflicting evidence; `unknown` means it cannot be assessed.

### Source Evidence

Field evidence uses `evidence_refs` to reference Source Records or manual corrections.

```json
{
  "field": "install_methods",
  "source_record_ids": ["github-openai-agents-sdk-20260706"],
  "confidence": "high",
  "notes": "Taken from the installation section of the official README."
}
```

## Raw Source Snapshot

An immutable copy of collected source data.

| Field | Type | Required | Example | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | yes | `github-topic-ai-agent-20260706-abc123` | Snapshot ID |
| `schema_version` | string | yes | `raw_snapshot.v1` | Schema |
| `source_id` | string | yes | `github-topic-ai-agent` | Registry ID |
| `source_url` | string | yes | `https://github.com/topics/ai-agent` | Requested URL |
| `fetched_at` | datetime | yes | `2026-07-06T12:00:00Z` | Fetch time |
| `fetch_method` | enum | yes | `http` | `http`, `api`, `manual`, `file_import` |
| `status` | enum | yes | `success` | `success`, `partial`, `failed` |
| `http_status` | number | no | `200` | HTTP status |
| `content_type` | string | no | `application/json` | Response type |
| `content_hash` | string | yes | `sha256:...` | Raw hash |
| `content_path` | string | yes | `data/raw/...json` | Storage |
| `request_meta` | object | no | `{ "etag": "..." }` | Secret-free metadata |
| `error` | object | no | `{ "code": "rate_limited" }` | Failure |

Never store tokens, cookies, or private headers; never overwrite raw content for the same hash; preserve failed-parse snapshots and errors.

## Source Record

A source-local structured record parsed from a Raw Snapshot without cross-source merging.

| Field | Type | Required | Example | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | yes | `github-repo-example-agent-20260706` | Record ID |
| `schema_version` | string | yes | `source_record.v1` | Schema |
| `snapshot_id` | string | yes | `github-topic-ai-agent-...` | Snapshot |
| `source_id` | string | yes | `github-topic-ai-agent` | Source |
| `record_type` | enum | yes | `repository` | `repository`, `package`, `registry_entry`, `doc_page`, `list_item`, `manual` |
| `name` | string | yes | `Example Agent` | Source name |
| `description` | string | no | `An agent framework...` | Description |
| `urls` | array | yes | `["https://github.com/org/repo"]` | URLs |
| `raw_fields` | object | yes | `{ "stars": 1200 }` | Preserved source fields |
| `parsed_fields` | object | no | `{ "license": "MIT" }` | Parsed fields |
| `source_confidence` | enum | yes | `medium` | Source confidence |
| `parsed_at` | datetime | yes | `2026-07-06T12:05:00Z` | Parse time |
| `parser_version` | string | yes | `github_repo_parser.v1` | Parser |
| `warnings` | array | no | `["missing_license"]` | Warnings |

Preserve source fields where possible without secrets. Record uncertainty in warnings rather than silently dropping it.

### Dynamic Skill Source Records

`github_skill_topic_parser.v1` retains `source_record.v1` and adds parser-owned fields under `parsed_fields`:

- `tool_id`: stable repository-and-Skill-directory ID.
- `canonical_identity`: the exact GitHub manifest blob URL.
- `repo_url`, `docs_url`, and `skill_manifest_path`.
- repository stars, license, activity, and topics when present.
- `generated_tool_profile`: deterministic normalized draft inputs; this is not a reviewed Registry `source_profile`.
- `skill_signals`: trigger, actionable-step, boundary, heading, code-block, resource, missing-resource, platform-dependency, and dangerous-instruction evidence.

One eligible manifest produces one Source Record and one Tool Card identity, even when several Skills share a repository. Raw manifest bodies remain in Raw Snapshot/Source Record ingestion evidence and do not enter Tool Cards, Rating Results, search documents, recommendation provider context, or public recommendation results.

## Tool Card

The central normalized recommendation record.

### Top-Level Fields

| Field | Type | Required | Example | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | yes | `model-context-protocol-filesystem` | Stable ID |
| `schema_version` | string | yes | `tool_card.v1` | Schema |
| `name` | string | yes | `Filesystem MCP Server` | Name |
| `type` | enum | yes | `mcp` | Primary type |
| `secondary_types` | array | no | `["cli"]` | Secondary types |
| `summary` | string | yes | `Provides filesystem tools through MCP.` | Summary |
| `source_urls` | array | yes | `["https://github.com/..."]` | Evidence sources |
| `repo_url` | string | no | `https://github.com/org/repo` | Repository |
| `homepage_url` | string | no | `https://example.com` | Homepage |
| `docs_url` | string | no | `https://example.com/docs` | Documentation |
| `package_urls` | array | no | `["https://www.npmjs.com/package/..."]` | Packages |
| `license` | string | no | `MIT` | License |
| `primary_purpose` | string | yes | `local_file_access` | Main purpose |
| `use_cases` | array | yes | `["read project files"]` | Appropriate use |
| `not_for` | array | yes | `["untrusted repositories"]` | Inappropriate use |
| `tags` | array | yes | `["filesystem", "local", "mcp-server"]` | Tags |
| `supported_agents` | array | no | `["codex", "claude-code"]` | Verified agents |
| `runtime_requirements` | object | no | `{ "node": ">=20" }` | Runtime |
| `install_methods` | array | yes | below | Installation |
| `auth_required` | enum | yes | `none` | `none`, `api_key`, `oauth`, `account`, `unknown` |
| `permissions` | array | yes | below | Permissions |
| `maintenance` | object | yes | below | Maintenance |
| `security` | object | yes | below | Security |
| `maturity` | enum | yes | `stable` | `experimental`, `beta`, `stable`, `deprecated`, `unknown` |
| `evidence_refs` | array | yes | evidence IDs | Field evidence |
| `last_checked_at` | datetime | yes | `2026-07-06T12:00:00Z` | Last check |
| `confidence` | enum | yes | `high` | Overall confidence |
| `created_at` | datetime | yes | `2026-07-06T12:00:00Z` | Created |
| `updated_at` | datetime | yes | `2026-07-06T12:00:00Z` | Updated |

### `type`

`mcp`, `skill`, `agent`, `framework`, `cli`, `prompt`, `rules`, `dataset`, and `service` retain the definitions in `docs/05-taxonomy.md`.

### `install_methods`

```json
[{
  "method": "npm",
  "command": "npm install @example/tool",
  "docs_url": "https://example.com/docs/install",
  "confidence": "high"
}]
```

`method` is `npm`, `pip`, `brew`, `docker`, `source`, `hosted`, `manual`, or `unknown`. Leave uncertain commands empty. Preserve docs URL and confidence.

### `permissions`

```json
[{
  "scope": "filesystem",
  "access": "read_write",
  "required": true,
  "notes": "Needs explicit directory allowlist."
}]
```

`scope`: `filesystem`, `network`, `browser`, `email`, `database`, `cloud`, `payment`, `shell`, `code_execution`, `secrets`, or `unknown`.

`access`: `read`, `write`, `read_write`, `execute`, `admin`, or `unknown`. `required` states whether the primary capability needs it; `notes` explains the permission.

### `maintenance`

```json
{
  "status": "active",
  "last_release_at": "2026-06-01T00:00:00Z",
  "last_commit_at": "2026-06-20T00:00:00Z",
  "issue_activity": "active",
  "maintainer_type": "official",
  "signals": ["recent_release", "docs_updated"]
}
```

`status`: `active`, `slow`, `inactive`, `deprecated`, `unknown`. `issue_activity`: `active`, `limited`, `inactive`, `unknown`. `maintainer_type`: `official`, `company`, `community`, `individual`, `unknown`.

### `security`

```json
{
  "risk_level": "medium",
  "trust_level": "official",
  "known_risks": ["filesystem_write"],
  "requires_human_approval": true,
  "security_notes": "Use a directory allowlist and avoid untrusted repositories."
}
```

`risk_level`: `low`, `medium`, `high`, `critical`, `unknown`. `trust_level`: `official`, `well_known_org`, `active_open_source`, `individual`, `commercial`, `unknown`.

### Agent Decision Fields

Optional `ai_decision_notes` may enter agent context directly.

```json
{
  "when_to_use": ["Need structured access to local project files through MCP."],
  "when_to_avoid": ["The repository is untrusted or filesystem access is not approved."],
  "questions_to_ask_human": ["Which directories may the tool access?"],
  "safe_defaults": ["read-only access", "directory allowlist"]
}
```

## Rating Result

The Rating Engine output for a Tool Card.

| Field | Type | Required | Example | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | yes | `rating:model-context-protocol-filesystem:20260706` | Rating ID |
| `schema_version` | string | yes | `rating_result.v2` | Schema |
| `tool_id` | string | yes | `model-context-protocol-filesystem` | Tool |
| `tool_type` | enum | yes | `mcp` | Type |
| `rules_version` | string | yes | `rating_rules.v0.2` | Rules |
| `base_score` | number | yes | `82` | Pre-feedback score |
| `feedback_adjustment` | object | yes | below | Reviewed feedback adjustment and evidence |
| `overall_score` | number | yes | `82.2` | Final 0–100 score |
| `recommendation_level` | enum | yes | `recommended` | Recommendation |
| `risk_level` | enum | yes | `medium` | Risk |
| `dimension_scores` | object | yes | `{ "task_fit": 90 }` | Dimensions |
| `explanations` | array | yes | below | Explanations |
| `penalties` | array | no | `["missing_docs"]` | Penalties |
| `boosts` | array | no | `["official_source"]` | Boosts |
| `evidence_quality` | enum | yes | `high` | Evidence |
| `rated_at` | datetime | yes | `2026-07-06T12:00:00Z` | Time |

Recommendation levels: `recommended`, `consider`, `situational`, `avoid`, `insufficient_evidence`.

`feedback_adjustment` contains `d1`, `accepted_issues`, `raw`, `applied`, fixed `cap: 3`, `rules_version: feedback_rules.v0.1`, `vote_snapshot_checksum`, and `accepted_issue_ids`. `overall_score` equals the clamped final score after applying `feedback_adjustment.applied` to `base_score`.

`rating_rules.v0.2` keeps `rating_result.v2`. Skill results use `trigger_clarity`, `instruction_quality`, `task_fit`, `boundary_clarity`, `portability`, `evidence_quality`, `maintenance_health`, and `security_posture`. Other current tool types retain the compatibility-policy dimension semantics from v0.1 while sharing risk, feedback, recommendation-ceiling, and result construction logic.

```json
[{
  "dimension": "documentation_quality",
  "score": 85,
  "reason": "Official documentation covers installation, permissions, and examples.",
  "evidence_refs": ["source-record-1"]
}]
```

## Recommendation Query

```json
{
  "task": "Integrate Stripe Checkout into a Next.js application.",
  "language_or_stack": ["typescript", "next.js"],
  "environment": ["local_dev", "web_app"],
  "preferred_tool_types": ["skill", "mcp", "framework"],
  "allowed_permissions": ["network", "filesystem_read"],
  "risk_tolerance": "medium",
  "existing_tools": ["codex"],
  "output_format": "json"
}
```

`task` is required. Missing optional context lowers intent confidence. `risk_tolerance` is `low`, `medium`, or `high`.

## Recommendation Result

v0.3 P2 made `recommendation_result.v2` the only dynamic recommendation contract. It adds `release { release_id, commit_sha }` and `safety_assessment` to query, candidates, and action; there is no v1 compatibility output or negotiation. Safety includes overall risk, stable reason codes, human-confirmation requirement/reason/items, safe defaults, and the least restrictive permitted action.

| Field | Type | Required | Example | Meaning |
| --- | --- | --- | --- | --- |
| `id` | string | yes | `rec-20260706-abc123` | ID |
| `schema_version` | string | yes | `recommendation_result.v2` | Breaking schema |
| `release` | object | yes | `{ "release_id": "all-v0.4.4", "commit_sha": "0b9fc48c" }` | Deployed release identity |
| `query` | object | yes | Recommendation Query | Input |
| `query_understanding` | object | yes | `{ "intent": "payment_integration" }` | Intent |
| `recommended_action` | enum | yes | `compare` | Next action |
| `safety_assessment` | object | yes | structured assessment | Deterministic risk and action ceiling |
| `candidates` | array | yes | below | Candidates |
| `rejected_candidates` | array | no | entries | Rejections |
| `no_match_reason` | string | no | `...` | No-match reason |

`safety_assessment` contains `risk_level`, stable `reason_codes`, `requires_human_approval`, optional `approval_reason`, `confirmation_questions`, `safe_defaults`, and `maximum_allowed_action`. Candidate objects additionally contain the resolved Tool name and tags. Rejected candidates contain a known `tool_id` and reason.

```json
{
  "tool_id": "stripe-checkout-skill",
  "rank": 1,
  "recommendation_level": "recommended",
  "fit_score": 88,
  "risk_level": "medium",
  "why": ["Matches the Next.js and Stripe Checkout task."],
  "risks": ["Requires payment-provider credentials."],
  "not_for": ["Do not use for custom payment orchestration."],
  "next_steps": ["Read official Stripe docs before handling live keys."],
  "evidence_refs": ["source-record-1", "rating:stripe-checkout-skill"]
}
```

Actions: `use`, `compare`, `ask_human`, `avoid`, and `no_reliable_match`.

## Eval Case

Used to evaluate search, rating, and recommendation quality.

```json
{
  "id": "golden-nextjs-stripe-checkout",
  "schema_version": "eval_case.v1",
  "category": "recommendation",
  "query": {
    "task": "Integrate Stripe Checkout into a Next.js application.",
    "language_or_stack": ["typescript", "next.js"],
    "risk_tolerance": "medium"
  },
  "expected": {
    "must_include_tags": ["payment", "next.js"],
    "must_warn_permissions": ["payment", "secrets"],
    "acceptable_tool_types": ["skill", "framework", "docs"],
    "should_not_recommend": ["unknown_payment_agent"]
  },
  "review_notes": "Prefer official or highly trusted sources and never recommend unknown payment automation."
}
```

`category`: `recommendation`, `safety`, or `rating`. `query` is input, `expected` is testable behavior, and `review_notes` is human rationale. Every case also contains `severity`, `owner`, and `updated_at`.

## Override Record

```json
{
  "id": "override-tool-x-license-20260706",
  "schema_version": "override_record.v1",
  "target_type": "tool_card",
  "target_id": "tool-x",
  "field": "license",
  "new_value": "Apache-2.0",
  "reason": "The official repository updated its LICENSE file.",
  "evidence_urls": ["https://github.com/org/tool-x/blob/main/LICENSE"],
  "created_by": "maintainer",
  "created_at": "2026-07-06T12:00:00Z"
}
```

Never override critical fields without sources. Overrides are reversible and require related evaluation when they affect rating/recommendation. Applied Override IDs enter draft `evidence_refs` so the validator can resolve `override-*`.

## v0.3 P1 Trust Artifacts

P1 did not change `tool_card.v1` semantics. It added:

- `tool_card_field_value_provenance.v2`: every candidate source, raw preview, normalized value, parser/normalizer version, selection, and rationale; critical coverage is 100%. v1 remains during migration.
- `tool_card_conflict_report.v1`: canonical identity, sources, conflict type, selection rule, and unresolved critical conflicts. Critical conflicts create intervention and block release.
- `tool_card_url_validation.v2`: field-path URL status `reachable`, `permanent_failure`, `auth_required`, `rate_limited`, `transient_error`, or `skipped`, plus method, final URL, time, and failure history. v1 remains during migration.
- `data_quality_report.v1`: coverage, required fields, provenance, confidence, unknowns, duplicates, conflicts, URLs, review status, and stable hard-gate reason codes.
- `review_summary.v2`: release summary ordered as blockers, warnings, then changes; each item has object ID, evidence path, and action. It references input checksums; final manifest records the summary checksum without a cycle.

Both v1/v2 migration files enter the reviewed bundle and manifest until consumers migrate.

## Review Summary v1 (Historical Per-Object Model)

The current release path uses release-level `review_summary.v2`. v1 preserves historical semantics only and never replaces safety gates or production approval.

```json
{
  "id": "review-summary:mcp-github:20260708",
  "schema_version": "review_summary.v1",
  "target_type": "tool_card_draft",
  "target_id": "mcp-github",
  "generated_by": "rules+llm",
  "recommended_action": "needs_review",
  "confidence": "medium",
  "evidence": [{"kind": "official_docs", "url": "https://github.com/modelcontextprotocol/servers", "summary": "Official repository documents installation and permissions."}],
  "risk_findings": [{"scope": "cloud", "severity": "high", "reason": "GitHub write scopes may affect repositories."}],
  "missing_fields": ["security.data_flow"],
  "duplicate_signals": ["same_repo_url:mcp-github-server"],
  "feedback_summary_ref": "feedback-summary:mcp-github:20260708",
  "review_required_reasons": ["high_risk_permissions", "possible_duplicate"],
  "generated_at": "2026-07-08T00:00:00Z"
}
```

`target_type`: `tool_card_draft`, `tool_card`, `promotion_candidate`, `source_record`. `generated_by`: `rules`, `llm`, `rules+llm`, `human`. `recommended_action`: `promote`, `keep_draft`, `needs_review`, `reject`, `retire`.

Evidence must reference collected sources/artifacts. LLM summaries retain input artifact IDs, URLs, or evidence refs. `promote` never bypasses validator, security, or eval gates. High-risk permissions, trust increases, risk reductions, and retirement enter the human intervention queue.

## Feedback Data

v0.4 P1 stores raw online votes in D1 `feedback_votes`: primary key `github_user_id + tool_id`, `vote` restricted to `up/down`, plus latest public username and timestamps. `feedback_rate_limits` stores one fixed minute window and mutation count per GitHub user. Cancel deletes the current row. OAuth token, session, Issue reason, and other free text never enter D1.

Normalized feedback is review/evaluation input and never directly rewrites Tool Cards.

```json
{
  "id": "feedback-rec-20260708-abc123",
  "schema_version": "feedback_record.v1",
  "target_type": "recommendation_result",
  "target_id": "rec-20260708-abc123",
  "tool_id": "mcp-github",
  "source": "web_ui",
  "signal": "down",
  "outcome": "failed",
  "reason_codes": ["permission_too_broad", "install_failed"],
  "notes": "Required broader GitHub token scopes than expected.",
  "created_at": "2026-07-08T00:00:00Z"
}
```

`target_type`: `tool_card`, `recommendation_result`, `eval_case`. `source`: `web_ui`, `mcp_api`, `agent_runtime`, `maintainer`. `signal`: `up`, `down`, `correction`, `issue`. `outcome`: `worked`, `partial`, `failed`, `unsafe`, `not_tried`. Common `reason_codes` include `wrong_tool`, `permission_too_broad`, `docs_outdated`, `install_failed`, `risk_missing`, and `better_alternative`.

Never store private code, email, tokens, secrets, full prompts, or browser content. Notes are short and publicly shareable. Feedback may trigger review but never alone raises trust.

## Feedback Summary

```json
{
  "id": "feedback-summary:mcp-github:20260708",
  "schema_version": "feedback_summary.v1",
  "target_type": "tool_card",
  "target_id": "mcp-github",
  "window": {"from": "2026-07-01T00:00:00Z", "to": "2026-07-08T00:00:00Z"},
  "counts": {"up": 12, "down": 3, "worked": 8, "failed": 2, "unsafe": 1},
  "top_reason_codes": ["permission_too_broad", "docs_outdated"],
  "recommended_review_action": "needs_review",
  "generated_at": "2026-07-08T00:00:00Z"
}
```

Small samples are weak signals. Negative or `unsafe` feedback may trigger human intervention or a new Eval Case. Summaries enter Review Summary, evaluation report, and release review.

## Feedback Artifacts and Rating Result v2

- `feedback_vote_snapshot.v1`: Tool-level counts, row count, time, and canonical checksum; no user identity or row-level vote.
- `feedback_classification.v1`: Issue number/URL, sanitized checksum, classifier/model, tri-state decision, fixed reason code, public-safe summary, and time; no raw reason, full prompt, or provider response.
- `feedback_processing_plan.v1`: expected `updated_at`, original labels, fixed comment, hidden marker, label changes, final state, optional replacement Issue.
- `feedback_summary.v1`: per-Tool D1/Issue/raw/applied adjustment, accepted Issue IDs, `feedback_rules.v0.1`, and vote-snapshot checksum.
- `rating_result.v2`: preserves dimensions, risk, evidence, and explanation; adds `base_score` and `feedback_adjustment`; `overall_score` is final.

All four feedback artifacts belong to the reviewed bundle and are checksum-bound by artifact manifest and production evidence.

## Schema Versioning and Migration

Small additive fields retain major version while updating docs/schema. Semantic changes increment major version, such as `tool_card.v2`. Removal requires deprecation before migration.

Every migration documents reason, affected fields, automatic conversion, human-review list, and impact on ingestion, rating, recommendation, and evaluation.

## Minimum MVP Tool Card

```yaml
id:
schema_version:
name:
type:
summary:
source_urls:
repo_url:
homepage_url:
docs_url:
license:
primary_purpose:
use_cases:
not_for:
tags:
supported_agents:
install_methods:
auth_required:
permissions:
maintenance:
security:
ai_decision_notes:
last_checked_at:
confidence:
created_at:
updated_at:
```

## Maintenance Rules

- Field-semantic changes update ingestion, rating, recommendation, and evaluation docs together.
- Field deletion requires a migration strategy.
- New fields state generation, quality requirements, and agent-decision use.
- Permission, security, installation, and authentication data remains source-traceable.
