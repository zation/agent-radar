# 07 Source Registry

## Purpose

This document defines Agent Radar data sources, collection methods, trust levels, schedules, and operating constraints. It governs source expansion, collection priority, and data quality.

The goal is not to collect everything that is technically accessible. Agent Radar discovers and validates AI tools through lawful, low-cost, and explainable sources.

## Source Principles

- Prefer official and publicly verifiable sources.
- Controlled automation currently includes official sources, manually maintained sources, `github-topic-mcp`, `npm-modelcontextprotocol-sdk`, and reviewed exact-repository sources. Every output must still pass parsing, validation, deduplication, automatic review, release admission, and the promotion check.
- Never bypass authentication, CAPTCHAs, paywalls, access controls, or terms of service.
- Source trust affects field confidence and rating inputs; it does not prove tool quality.
- Community lists, Awesome lists, news, blogs, and launch posts remain outside controlled automatic collection. Any future admission must use the same release gates.
- Every source must define its frequency, constraints, and failure policy.
- High-risk or destructive changes, including expanding collection boundaries, enabling an unadmitted source, or publishing incomplete evidence, require human confirmation before the GitHub `production` environment gate is approved.

## `SourceDefinition` Schema

```yaml
id:
name:
url:
source_type:
covered_tool_types:
collection_method:
recommended_frequency:
trust_level:
field_coverage:
rate_limits:
terms_notes:
access_review:
  robots_txt:
  terms:
  reviewed_by:
  reviewed_at:
  notes:
parser:
profile:
failure_policy:
enabled:
owner:
last_reviewed_at:
```

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `id` | string | yes | Stable source ID |
| `name` | string | yes | Source name |
| `url` | string | yes | Source entry point |
| `source_type` | enum | yes | `official_registry`, `official_docs`, `github`, `package_registry`, `community_list`, `news`, or `manual` |
| `covered_tool_types` | array | yes | Tool types covered by the source |
| `collection_method` | enum | yes | `api`, `http`, `git_clone`, `manual`, or `rss` |
| `recommended_frequency` | enum | yes | `daily`, `weekly`, `monthly`, or `manual` |
| `trust_level` | enum | yes | Trust level defined by the security model |
| `field_coverage` | array | yes | Fields available from the source |
| `rate_limits` | string | no | Rate-limit constraints |
| `terms_notes` | string | yes | Terms and usage constraints |
| `access_review` | object | for enabled sources | Robots and terms review record |
| `parser` | string | no | Parser name |
| `profile` | object | no | Reviewed source-level mapping for fields that generic metadata cannot infer reliably |
| `failure_policy` | string | yes | Failure behavior |
| `enabled` | boolean | yes | Whether automatic collection is enabled |
| `owner` | string | no | Maintainer or owning module |
| `last_reviewed_at` | datetime | yes | Most recent source review |

`profile` is not a manually seeded Tool Card. It must bind to one public source and describe only field mappings that the source can support, such as:

- `tool_id`, `name`, `type`, and `tags`.
- `primary_purpose`, `use_cases`, and `not_for`.
- `permissions`, `security`, and `auth_required`.
- `docs_url`, `homepage_url`, and `maintenance`.

Profiles let official pages, exact GitHub repositories, and package metadata enter normalization, deduplication, and release evaluation without asking an LLM to guess permissions or risks. A `profile` change creates a source-registry review requirement.

## Source Registry Diff and Review Persistence

`source_registry_diff.json` is the source-configuration change input for the single-Worker reviewed-bundle release workflow. Every changed source lists `changed_fields`. Fields that affect collection scope, access boundaries, parser behavior, or downstream trust also create `review_requirements`:

```yaml
changed:
  - id:
    changed_fields:
    review_requirements:
      - field:
        reason:
        confirmation_required: true
```

Review requirements are generated for `enabled`, `url`, `source_type`, `collection_method`, `recommended_frequency`, `trust_level`, `field_coverage`, `rate_limits`, `terms_notes`, `access_review`, `parser`, and `profile`.

The reviewed bundle and GitHub Actions summary present these high-impact changes before the GitHub `production` environment gate. The artifact is a review aid: it neither trusts a new source automatically nor bypasses source admission or the promotion check.

Review persistence does not use per-field confirmation JSON. Persistence consists of the reviewed-bundle artifacts, their checksums, and GitHub `production` environment approval. The stable correlation keys are the reviewed-bundle ID or artifact name, commit SHA, manifest and checksum, workflow run URL, and deployment URL. Production evidence and the approval summary must preserve these keys so an approval resolves to exactly one evidence bundle.

## Source Types

### Official Registries

Official protocol, platform, or ecosystem registries, directories, and marketplaces provide high-confidence lists and identity, documentation, installation, and maintainer evidence. Their trust is usually `official`, but official inclusion is not a security audit.

### Official Documentation and Repositories

Documentation sites, READMEs, releases, and repository metadata published by a tool author or maintaining organization validate installation, permissions, use cases, license, and maintenance. Trust is normally `official` or `well_known_org`. Author descriptions may be promotional and still require field-level evidence.

### GitHub

Public repositories, organizations, releases, READMEs, and controlled topic searches provide discovery, maintenance, community, and license signals. `github-topic-mcp` is enabled through the public GitHub Search API; other topic sources require source admission first.

A topic, star count, repository, or package is only a discovery signal. It does not establish trust or permit release. Repository drafts must pass every standard release gate.

### Package Registries

npm, PyPI, Docker Hub, Homebrew, and similar registries validate package names, installation, versions, and release dates. Typical trust values are `active_open_source`, `commercial`, or `unknown`.

Package existence is not evidence of project trust and cannot independently support release or recommendation. Supply-chain risk is modeled separately.

### Community Directories and Awesome Lists

These community-maintained lists can discover candidates and peer groups. They are disabled for the MVP because fields and update schedules are inconsistent, and they cannot independently support a high-confidence recommendation.

### News, Blogs, and Launch Posts

Hacker News, Product Hunt, blogs, and announcements may reveal ecosystem changes. They are disabled for the MVP and may serve only as weak discovery signals, never as direct rating evidence.

### Manual Sources

Maintainers may add tools, correct fields, or record review results to fill gaps that a parser cannot determine safely. Trust depends on public evidence URLs, maintained provenance, and auditable override evidence. Every change must preserve its source and reason.

## Baseline Source Examples

This document defines the source policy. The executable registry in `src/ingestion/source-registry.ts` implements the currently collected source set. The following examples document the principal source classes and controlled enablement policy.

### Model Context Protocol Official Resources

```yaml
id: mcp-official-resources
name: Model Context Protocol official resources
url: https://modelcontextprotocol.io/
source_type: official_docs
covered_tool_types: [mcp]
collection_method: http
recommended_frequency: weekly
trust_level: official
field_coverage: [name, docs_url, usage, protocol_context]
rate_limits: "Respect robots rules and use a reasonable request rate"
terms_notes: "Collect public documentation and links only"
access_review:
  robots_txt: reviewed
  terms: reviewed
  reviewed_by: agent-radar
  reviewed_at: 2026-07-06T00:00:00Z
  notes: "Collect public documentation and links only"
parser: mcp_docs_parser
failure_policy: "Preserve the previous version and mark it stale"
enabled: true
last_reviewed_at: 2026-07-06T00:00:00Z
```

### GitHub Topic: MCP

```yaml
id: github-topic-mcp
name: GitHub topic mcp
url: https://github.com/topics/mcp
source_type: github
covered_tool_types: [mcp, cli, framework]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [name, description, repo_url, stars, license, last_commit_at]
rate_limits: "GitHub API rate limits"
terms_notes: "Use the public API only; send results through automatic review and release gates"
access_review:
  robots_txt: reviewed
  terms: reviewed
  reviewed_by: agent-radar
  reviewed_at: 2026-07-08T00:00:00Z
  notes: "Use public topic and API surfaces only; send no authorization header, cookie, or private token"
parser: github_topic_parser
failure_policy: "Skip the run when rate-limited and preserve the previous stable data"
enabled: true
last_reviewed_at: 2026-07-08T00:00:00Z
```

The crawler maps the topic URL to GitHub Search API repository metadata and preserves rate-limit response metadata. Resulting drafts enter cross-source normalization and all release gates.

### GitHub Topic: AI Agent

```yaml
id: github-topic-ai-agent
source_type: github
parser: github_topic_parser
enabled: false
```

This topic remains disabled because its discovery noise is high.

### npm Model Context Protocol SDK

```yaml
id: npm-modelcontextprotocol-sdk
name: npm @modelcontextprotocol/sdk
url: https://registry.npmjs.org/@modelcontextprotocol/sdk
source_type: package_registry
covered_tool_types: [cli, framework, mcp]
collection_method: api
recommended_frequency: weekly
trust_level: active_open_source
field_coverage: [name, description, repo_url, homepage_url, package_url, license, latest_version, last_release_at]
rate_limits: "Respect public npm registry API limits"
terms_notes: "Query confirmed package names only and send results through every release gate"
parser: npm_package_parser
failure_policy: "Preserve the previous version and mark it stale"
enabled: true
last_reviewed_at: 2026-07-08T00:00:00Z
```

### Disabled Discovery Sources

```yaml
- id: pypi-ai-tools
  source_type: package_registry
  parser: pypi_package_parser
  enabled: false
- id: awesome-ai-agents
  source_type: community_list
  parser: awesome_list_parser
  enabled: false
```

### Manual Review

```yaml
id: manual-review
name: Manual review records
url: internal://manual-review
source_type: manual
covered_tool_types: [mcp, skill, agent, framework, cli, prompt, rules, service]
collection_method: manual
recommended_frequency: manual
trust_level: well_known_org
field_coverage: [all_reviewed_fields]
rate_limits: "Not applicable"
terms_notes: "A public evidence URL is required"
parser: manual_record_parser
failure_policy: "Reject records without evidence"
enabled: true
last_reviewed_at: 2026-07-06T00:00:00Z
```

## Source Priority and Conflicts

Resolve field conflicts in this order:

1. Official documentation or repository.
2. Package-registry version and installation data.
3. Documentation from a trusted organization.
4. Active open-source repository metadata.
5. Manual review with public evidence.
6. Community directory.
7. News, blogs, and launch posts.

Manual review is not unconditionally authoritative. Package registries may be newer than a README for version and installation facts. Interpretive fields such as use cases should combine documentation and concrete examples.

| Conflict | Resolution |
| --- | --- |
| Different names | Preserve one canonical name and all aliases |
| License disagreement | Prefer the official repository license, then package metadata |
| Installation disagreement | Prefer the newest official documentation and package registry |
| Maintenance disagreement | Combine recent releases, commits, and issue activity |
| Type disagreement | Apply the taxonomy entry-point rule |
| Permission disagreement | Use the more conservative risk interpretation and require review |

## Collection Frequency

| Source type | Recommended frequency |
| --- | --- |
| Official registry | weekly |
| Official documentation | weekly or monthly |
| GitHub topic | `github-topic-mcp` weekly; others disabled by default |
| Package registry | `npm-modelcontextprotocol-sdk` weekly; others require admission |
| Community directory | disabled for the MVP |
| News and launch posts | disabled for the MVP |
| Manual review | manual |

High-frequency collection is allowed only for stable, lawful, low-cost sources.

## Source Admission

Before adding a source, answer:

- Which tool types or fields does it serve?
- Is it publicly accessible, and is automated collection allowed?
- Does it require login, cookies, tokens, or payment?
- What are its field quality, expected noise, and duplicate rates?
- Can its failure affect the main pipeline?
- What parser maintenance does it require?

Prohibited sources include pages that require bypassing authentication, CAPTCHAs, or access controls; sources that explicitly prohibit automation; leaked secrets, internal documents, or user data; unapproved paid sources; and oral claims without preservable evidence.

## Relationship to the Pipeline

- The Source Registry defines crawler inputs.
- `trust_level` contributes to Tool Card confidence and ratings.
- `field_coverage` sets parser and normalizer expectations.
- `failure_policy` governs ingestion fallback.
- Source quality affects evaluation coverage and freshness.

## Maintenance Rules

- Every new source must document its purpose, trust, access review, and rate limits.
- Every source change must update its review date and generate auditable diff evidence.
- Before removing a source, assess affected Tool Cards and fields.
- Treat source legality and high-risk permission evidence conservatively.
