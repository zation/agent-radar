# Agent Radar: Coding Agent Instructions

This file contains project-level operating instructions for coding agents such as Codex, Claude Code, Cursor, and OpenCode. Every agent working in this project must read this file and the relevant `docs/` documents before starting.

## Project Positioning

Agent Radar is a rating and recommendation system for AI Agents, Skills, MCP Servers, CLIs, Frameworks, and Prompts/Rules. Its core goal is not to summarize news, but to build a structured knowledge base that AI systems can use when selecting tools.

## Default Workflow

1. Read the documents relevant to the task.
2. Classify the task as product, architecture, data, ingestion, rating, recommendation, evaluation, security, or deployment work.
3. Prefer the smallest verifiable change.
4. Run the relevant tests, static checks, or evaluations after making changes.
5. Report the change summary, verification results, and unresolved risks.

## Required Documents

- Product or scope changes: `docs/00-product-brief.md`, `docs/01-requirements.md`, and the relevant active files under `docs/delivery/`
- Architecture or module changes: `docs/03-system-architecture.md`
- Data structure changes: `docs/04-data-model.md`, `docs/05-taxonomy.md`
- Rating changes: `docs/06-rating-rules.md`, `docs/10-evaluation-plan.md`
- Ingestion changes: `docs/07-source-registry.md`, `docs/08-crawler-and-ingestion.md`
- Recommendation logic changes: `docs/09-recommendation-engine.md`, `docs/10-evaluation-plan.md`
- Security-related changes: `docs/11-security-and-trust.md`
- Self-improvement logic changes: `docs/13-agent-self-improvement.md`

## Document Responsibilities and Priority

- `README.md` and `docs/00-14` are the authoritative sources for current product, requirement, architecture, and domain implementation facts. Update technical facts in the corresponding domain document; delivery documents must not redefine implemented facts.
- `docs/delivery/backlog/*.md` contains unapproved candidate work. A Backlog item records the problem, expected value, constraints, and promotion conditions; it is not an implementation commitment and must not have a Plan.
- `docs/delivery/vX.Y/pN-spec.md` records an active version increment's design decisions and answers why the change exists, what it does, and what it excludes. Once approved, a Spec constrains implementation.
- `docs/delivery/vX.Y/pN-plan.md` records execution for the matching Spec and answers which files change, in what order, and how the work is verified. Do not duplicate the Spec or use a separate version summary document.
- `docs/delivery/archived/vX.Y/**` contains frozen completed or superseded version history. v0.x files use legacy names and formats and are exempt from new frontmatter and pairing rules; only erroneous links, status facts, or commit SHAs may be corrected.
- `docs/delivery/archived/v0.x-roadmap.md` is a frozen historical snapshot. It is not a current status or priority source.
- If documents conflict, current domain facts come from `README.md` or the corresponding `docs/00-14` document. Current delivery scope and lifecycle come directly from active Spec and Plan frontmatter plus their directory location. Archived documents never override current facts.

New delivery documents use YAML frontmatter:

- Backlog: `kind: backlog`, stable `id`, `status` (`candidate`, `ready`, `blocked`, or `rejected`), `priority`, `domains`, and `created_at`.
- Spec: `kind: spec`, `version`, `increment`, `status` (`draft`, `approved`, `completed`, or `superseded`), and `implementation_commits`.
- Plan: `kind: plan`, `version`, `increment`, `status` (`draft`, `active`, `completed`, or `cancelled`), relative `spec`, and `implementation_commits`.

Promote a Backlog item by moving and expanding it into a versioned `pN-spec.md`, preserving its stable ID as `source_backlog_id`; do not keep a duplicate Backlog copy. Create the matching Plan only when implementation planning begins. When an increment completes, update the corresponding authoritative domain documents, record implementation commits, and mark its Spec and Plan terminal. When every increment in a version is terminal, move the whole version directory to `docs/delivery/archived/vX.Y/`. Except for correcting an erroneous status, commit SHA, or link, do not modify completed delivery documents.

Run `npm run docs:check` after delivery-document changes. Use `npm run docs:status` to derive the current Backlog and active-version status; do not commit a manually maintained status summary.

## Actions Allowed Without Additional Confirmation

- Create or update documentation drafts.
- Add low-risk ingestion source configuration.
- Fix parser errors, field-mapping errors, and duplicate-data problems.
- Add tests, evaluation cases, and golden queries.
- Tune low-risk rating weights and provide before/after evaluation evidence.
- Generate draft Tool Cards, with explicit sources and confidence.

## Actions Requiring Human Confirmation

- Delete substantial historical data.
- Change the semantics of core schema fields.
- Make large changes to rating rules or weights.
- Automatically trust tools from unknown sources.
- Introduce a new paid service, closed-source dependency, or long-running infrastructure.
- Perform any operation that may expose tokens, private keys, email, filesystem data, or browser data.

## Final Output Requirements

Every completed task response must include:

- What changed.
- Why it changed.
- How it was verified.
- Remaining risks or follow-up work.

## Regeneration Prompt

When this file needs to be generated or rewritten, use:

```text
Based on Agent Radar's current product goals, system architecture, and security boundaries, generate project-level instructions for coding agents. Explain the project's positioning, required documents, default workflow, actions allowed without additional confirmation, actions requiring human confirmation, verification requirements, and final output format. Write in clear, specific, actionable English.
```
