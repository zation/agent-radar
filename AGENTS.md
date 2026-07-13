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

- Product or scope changes: `docs/00-product-brief.md`, `docs/01-requirements.md`, `docs/15-roadmap.md`
- Architecture or module changes: `docs/03-system-architecture.md`
- Data structure changes: `docs/04-data-model.md`, `docs/05-taxonomy.md`
- Rating changes: `docs/06-rating-rules.md`, `docs/10-evaluation-plan.md`
- Ingestion changes: `docs/07-source-registry.md`, `docs/08-crawler-and-ingestion.md`
- Recommendation logic changes: `docs/09-recommendation-engine.md`, `docs/10-evaluation-plan.md`
- Security-related changes: `docs/11-security-and-trust.md`
- Self-improvement logic changes: `docs/13-agent-self-improvement.md`

## Document Responsibilities and Priority

- `README.md` and `docs/00-14` are the authoritative sources for current product, requirement, architecture, and domain implementation facts. Update technical facts in the corresponding domain document; do not rely on a Roadmap, Spec, or Plan to redefine them.
- `docs/15-roadmap.md` is the single source of truth for the current development stage, priorities, milestones, and completion status. The Roadmap must link relevant Specs and Plans without duplicating complete designs or implementation steps.
- `docs/superpowers/specs/**` records design decisions for individual changes and answers why the change exists, what it does, and what it excludes. After approval, a Spec constrains implementation. After completion, add its status, implementation commit, and Roadmap link, then freeze it.
- `docs/superpowers/plans/**` records execution for an individual Spec and answers which files change, in what order, and how the work is verified. After execution, add its status and implementation commit, then freeze it; do not continue using it to track current project progress.
- If documents conflict, current domain facts come from `README.md` or the corresponding `docs/00-14` document, while current stage and progress come from `docs/15-roadmap.md`. Completed Specs and Plans are decision and execution history only and must not override current facts.

Every Spec and Plan must declare the following at the beginning:

- `Status`: `Draft`, `Approved`, `Completed`, or `Superseded`.
- `Implementation commits`: use `None` before completion and actual commit SHAs after completion.
- `Current status source`: link to `docs/15-roadmap.md` or the corresponding authoritative domain document.

When a feature is completed, update the corresponding authoritative domain document and Roadmap in the same change. Except for correcting an erroneous status, commit SHA, or link, do not modify a completed Spec or Plan; create a smaller new Spec/Plan for later iterations.

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
