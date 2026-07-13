# README Public Positioning and Development Guide Implementation Plan

> 状态：已批准
>
> 实现提交：无
>
> 当前状态来源：[`README.md`](../../../README.md)、[`DEVELOPMENT.md`](../../../DEVELOPMENT.md)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn README into an external product introduction and move detailed local development instructions into root-level `DEVELOPMENT.md`.

**Architecture:** README becomes a concise navigation and positioning surface backed by existing authoritative domain documents. `DEVELOPMENT.md` owns local setup and daily development workflows, while `docs/12-deployment-and-ops.md` remains authoritative for production operations. Contract tests lock the document boundary and the strict language gate expands from 17 to 18 documents.

**Tech Stack:** Markdown, TypeScript 5.5, Node.js test runner, existing strict public-language validator.

## Global Constraints

- Remove the `Current Stage` heading and release-history narration from README.
- Keep README focused on prospective users, product value, trust, safety, and usage surfaces.
- Create root-level `DEVELOPMENT.md`; do not place the guide under `docs/`.
- Keep production release, Cloudflare, D1, monitoring, and rollback procedures authoritative in `docs/12-deployment-and-ops.md`.
- Do not modify Roadmap stage facts.
- Add `DEVELOPMENT.md` to the unchanged strict language rule with no allowlist.
- Delete this Plan and its source Spec after implementation and verification, as explicitly requested by the user.

---

### Task 1: Lock the Public README and Development Guide Boundary

**Files:**
- Modify: `tests/public-language.test.ts`

**Interfaces:**
- Consumes: `PUBLIC_DOCUMENT_PATHS` from `src/validation/public-language.ts`.
- Produces: contract assertions for 18 documents, root-level `DEVELOPMENT.md`, README promotion boundaries, and development-guide ownership.

- [ ] **Step 1: Add failing document-boundary assertions**

Update the existing public-path test to require:

```ts
assert.equal(PUBLIC_DOCUMENT_PATHS.length, 18);
assert.deepEqual(PUBLIC_DOCUMENT_PATHS.slice(0, 3), ["README.md", "DEVELOPMENT.md", "AGENTS.md"]);
assert.ok(paths.has("DEVELOPMENT.md"));
```

Add a focused repository contract:

```ts
test("README promotes the product and delegates local development", async () => {
  const [readme, development] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("DEVELOPMENT.md", "utf8"),
  ]);

  assert.doesNotMatch(readme, /^## Current Stage$/m);
  assert.match(readme, /\[Development Guide\]\(DEVELOPMENT\.md\)/);
  assert.doesNotMatch(readme, /AGENT_RADAR_LLM_API_KEY=/);
  assert.match(development, /^# Development Guide$/m);
  assert.match(development, /^## Local Setup$/m);
  assert.match(development, /^## Development Commands$/m);
  assert.match(development, /docs\/12-deployment-and-ops\.md/);
});
```

- [ ] **Step 2: Run the focused test and observe failure**

```bash
npm run build && node --test dist/tests/public-language.test.js
```

Expected: failure because the public path count is still 17 and `DEVELOPMENT.md` does not exist.

### Task 2: Rewrite README and Create DEVELOPMENT.md

**Files:**
- Modify: `README.md`
- Create: `DEVELOPMENT.md`
- Modify: `src/validation/public-language.ts`

**Interfaces:**
- `README.md` links to `DEVELOPMENT.md`, `AGENTS.md`, the product docs, security docs, deployment docs, and Roadmap.
- `DEVELOPMENT.md` owns prerequisites, local setup, `.env`, local services, development commands, generated data, code entry points, verification, and troubleshooting.
- `PUBLIC_DOCUMENT_PATHS` begins with `README.md`, `DEVELOPMENT.md`, and `AGENTS.md` and contains exactly 18 entries.

- [ ] **Step 1: Rewrite README as a product introduction**

Use this section order:

```text
# Agent Radar
positioning and value statement
## Why Agent Radar
## What You Get
## How It Works
## Who It Is For
## Trust and Safety
## Ways to Use Agent Radar
## Documentation
## Development and Contributing
```

Keep claims consistent with the Product Brief: Agent Radar is a structured, explainable, task-oriented rating and recommendation knowledge base, not a news feed, awesome list, security scanner, installation marketplace, or autonomous execution service.

- [ ] **Step 2: Create the detailed root development guide**

Use this section order:

```text
# Development Guide
## Prerequisites
## Local Setup
## Local Development Stack
## Development Commands
## Data and Evaluation Workflows
## Project Entry Points
## Verification
## Troubleshooting
## Production Operations
```

Move and clarify the existing README facts for `npm install`, `.env.example`, `npm run dev`, the Vite and Wrangler addresses, local D1, ingestion, pipeline, provider evaluation, Web build, generated artifacts, and primary source entry points. Link production release details to `docs/12-deployment-and-ops.md` without copying the release workflow.

- [ ] **Step 3: Add DEVELOPMENT.md to the strict language boundary**

Update the root entries in `PUBLIC_DOCUMENT_PATHS` to:

```ts
export const PUBLIC_DOCUMENT_PATHS = [
  "README.md",
  "DEVELOPMENT.md",
  "AGENTS.md",
  // existing docs/00-14 entries remain unchanged
] as const;
```

- [ ] **Step 4: Run focused verification**

```bash
npm run build && node --test dist/tests/public-language.test.js
npm run language:check
```

Expected: all focused contracts pass and the language CLI reports 18 documents and 48 Golden Query fields.

### Task 3: Review, Verify, and Remove Temporary Records

**Files:**
- Delete: `docs/superpowers/specs/2026-07-13-readme-public-positioning-design.md`
- Delete: `docs/superpowers/plans/2026-07-13-readme-public-positioning.md`
- Review: `README.md`
- Review: `DEVELOPMENT.md`

**Interfaces:**
- The final repository contains the product README, development guide, tests, and language-boundary change, but not this temporary Spec or Plan.

- [ ] **Step 1: Review documentation consistency**

Confirm that README claims agree with `docs/00-product-brief.md`, recommendation and safety claims agree with `docs/09-recommendation-engine.md` and `docs/11-security-and-trust.md`, and detailed production operations remain in `docs/12-deployment-and-ops.md`.

- [ ] **Step 2: Run complete verification**

```bash
npm run language:check
npm test
npm run lint
git diff --check
```

Expected: 18 public documents and 48 Golden Query fields pass the strict language gate; all tests and lint pass with no whitespace errors.

- [ ] **Step 3: Delete the temporary Spec and Plan**

Delete exactly:

```text
docs/superpowers/specs/2026-07-13-readme-public-positioning-design.md
docs/superpowers/plans/2026-07-13-readme-public-positioning.md
```

- [ ] **Step 4: Commit the final implementation**

```bash
git add README.md DEVELOPMENT.md src/validation/public-language.ts tests/public-language.test.ts
git add -u docs/superpowers/specs docs/superpowers/plans
git commit -m "docs: reposition README for external users"
```
