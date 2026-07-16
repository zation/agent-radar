---
kind: backlog
id: rating-optimization-loop
status: ready
priority: high
domains:
  - rating
  - evaluation
  - self-improvement
created_at: 2026-07-16
---

# Rating Optimization Loop

## Problem

Only Skill currently has a dedicated implemented rating policy. MCP, Agent, Framework, and CLI use a compatibility policy, and the project has no formal cross-release Eval Diff or structured shadow workflow for proposed rating changes.

## Expected value

Automatically detect rating-quality problems, generate evidence-backed change candidates, compare them in shadow mode, and improve type-specific policies without weakening trust or safety boundaries.

## Constraints

- Do not apply material weights, schema semantics, trust changes, risk reductions, or approval relaxations without human confirmation.
- Do not optimize only for Golden Query pass rate, popularity, or feedback volume.
- Do not change evaluation expectations to fit current behavior.
- Unapproved candidates must not change public Rating Results.

## Promotion conditions

- Define representative rating benchmarks and immutable comparison inputs.
- Define cross-release rating and recommendation diffs.
- Define the rating-change candidate, approval classification, and rollback contract.
- Select the first Tool type for a dedicated shadow policy.
