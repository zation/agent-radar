# README Public Positioning and Development Guide Design

- 状态：已批准
- 实现提交：无
- 当前状态来源：[README.md](../../../README.md)、[DEVELOPMENT.md](../../../DEVELOPMENT.md)

## Background

The current README mixes product positioning, completed-stage evidence, local development commands, provider configuration, artifact generation, and production release operations. This makes the repository entry point read like an internal status and operations document instead of a clear introduction for prospective users.

Agent Radar already has authoritative domain documents for workflows, architecture, evaluation, security, Web UI behavior, deployment, and the Roadmap. The README should introduce the product and route readers to those documents instead of duplicating their implementation detail.

## Goals

1. Make `README.md` primarily an external product introduction for people evaluating Agent Radar.
2. Remove the `Current Stage` section and other release-history or internal-progress narration from the README.
3. Move detailed local development instructions into a new root-level `DEVELOPMENT.md`.
4. Preserve accurate links to product, security, API/MCP, development, and contribution documentation.
5. Add `DEVELOPMENT.md` to the strict public-document language gate.

## Audience

The README primarily serves prospective users:

- Developers trying to choose an AI Agent, Skill, MCP Server, CLI, Framework, or Prompt/Rules package.
- Coding-agent users who need structured, evidence-backed tool-selection context.
- Platform teams evaluating Agent Radar as a public, agent-readable decision layer.

Maintainers and contributors are a secondary audience. Their detailed setup path starts in `DEVELOPMENT.md` and `AGENTS.md`.

## README Information Architecture

The rewritten README uses a product-landing-page structure:

1. **Hero and positioning** — what Agent Radar is and the decision problem it solves.
2. **Why Agent Radar** — why discovery lists, popularity, and vendor claims are insufficient for tool selection.
3. **What users get** — structured Tool Cards, explainable ratings, task-oriented recommendations, evidence, and safety boundaries.
4. **How it works** — a concise discover → normalize → rate → recommend → evaluate flow.
5. **Who it is for** — AI-first developers, coding-agent users, and platform teams.
6. **Trust and safety** — source provenance, confidence, permission visibility, conservative actions, and critical safety evaluation.
7. **Ways to use it** — Web UI, JSON/JSONL artifacts, HTTP API, and MCP JSON-RPC.
8. **Documentation and development** — focused links to product docs, `DEVELOPMENT.md`, `AGENTS.md`, and the Roadmap.

The README must not contain a `Current Stage` heading, completed-version chronology, production run IDs, deployment IDs, long command inventories, detailed `.env` configuration, or step-by-step release operations.

## DEVELOPMENT.md Responsibilities

The new root-level `DEVELOPMENT.md` is the detailed development manual. It covers:

- Prerequisites and dependency installation.
- Safe local `.env` setup and provider configuration.
- The default local development stack and service addresses.
- Focused commands for development, data preparation, ingestion, evaluation, tests, linting, and Web builds.
- Generated artifact behavior and the distinction between local development and production gates.
- Primary code entry points and links to architecture, data, evaluation, security, UI, and deployment documentation.
- Common local failure modes, including missing artifacts, missing provider credentials, occupied ports, and provider failures.

It does not duplicate production release procedures, Cloudflare deployment internals, D1 production operations, or rollback instructions. Those remain authoritative in `docs/12-deployment-and-ops.md`.

## Document Boundaries

| Document | Responsibility |
| --- | --- |
| `README.md` | External product positioning and navigation |
| `DEVELOPMENT.md` | Local development setup and daily development workflow |
| `AGENTS.md` | Project-level rules for coding agents |
| `docs/02-user-workflows.md` | Product workflow contracts and expected behavior |
| `docs/12-deployment-and-ops.md` | Production release, deployment, monitoring, and rollback |
| `docs/15-roadmap.md` | Stage history, priorities, milestones, and completion evidence |

The redesign does not change Roadmap facts or move production operations into the development guide.

## Strict Language Gate

`DEVELOPMENT.md` becomes the eighteenth explicitly approved public document. The language validator and its contract test must:

- Include the exact root path `DEVELOPMENT.md`.
- Expect 18 public documents.
- Continue checking the same prohibited Han, CJK punctuation, and fullwidth character classes.
- Preserve structured checking of all 48 Golden Query public fields.

No allowlist or weakened character rule is introduced.

## Verification

The implementation must run:

```bash
npm run language:check
npm test
npm run lint
git diff --check
```

Verification must confirm:

- `README.md` has no `Current Stage` heading.
- README product claims remain consistent with `docs/00-product-brief.md`, `docs/09-recommendation-engine.md`, and `docs/11-security-and-trust.md`.
- Detailed development instructions exist in `DEVELOPMENT.md` and README links to it.
- Production operations remain linked to `docs/12-deployment-and-ops.md` rather than copied.
- The strict gate reports 18 documents and 48 Golden Query fields.

## Out of Scope

- Product feature, schema, UI, API, MCP, rating, recommendation, or deployment changes.
- Roadmap milestone or completion-state changes.
- A runtime documentation site, localization system, or multilingual README.
- Rewriting authoritative domain documents unrelated to inconsistent links or document ownership.

## Completion Rule

When implementation is complete, update this Spec with status and implementation commit SHA, update the implementation Plan in the same way, and freeze both records. Because this is a documentation-organization change rather than a product stage, no Roadmap milestone update is required.
