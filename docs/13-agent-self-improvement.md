# 13 Agent Self-Improvement

## Purpose

This document defines how a coding agent may discover problems, propose changes, modify documentation, code, or data, and verify a safe Agent Radar improvement.

Self-improvement is not unsupervised self-modification. It is a low-risk workflow constrained by schemas, evaluation, security boundaries, and human approval.

## Principles

- Every change is replayable, explainable, and reversible.
- Classify the problem before selecting an allowed action.
- Low-risk documentation, parser, data, and evaluation work may proceed automatically.
- Schema semantics, major rating changes, high-risk sources, and tool execution require confirmation.
- Every change produces tests, evaluation, or an evidence-backed comparison.

## Triggers

| Trigger | Example | Typical response |
| --- | --- | --- |
| Crawl failure | A public API shape changes | Fix parser fixture and failure handling |
| Parse failure | License mapping is wrong | Correct field mapping |
| Data-quality decline | Unknown permissions increase | Add evidence or downgrade eligibility |
| Recommendation error | A high-risk tool ranks first | Add an eval case and fix the guard |
| Rating error | A deprecated tool remains recommended | Correct rules or data |
| Schema gap | Hosted exfiltration cannot be represented | Propose a reviewed schema change |
| User feedback | Wrong type, bad fit, missing permission, failed install | Add feedback evidence or a review task; never directly raise trust |
| Safety failure | Payment does not require approval | Fix deterministic safety and evaluation |
| CI failure | Test, eval, preview, or release gate fails | Collect redacted evidence and prepare a minimum fix |

## Future Controlled CI Repair

```text
CI failure
  -> collect public repository link, SHA, workflow and job IDs, failed command, redacted log, and artifact summary
  -> classify test, eval, schema, pipeline, or preview failure
  -> ask an LLM for diagnosis and a minimum plan
  -> apply an allowed fix on an isolated branch
  -> run relevant verification
  -> open a draft PR
  -> human review and merge
```

Only public repository context and redacted failure evidence may leave the workflow. Never send secrets, tokens, `.env`, private data, local files, browser data, or email.

Automatic PRs are limited to tests, parser fixtures, field mapping, documentation, evaluation cases, and obvious low-risk pipeline defects. Schema semantics, major weights, lowered risk, raised trust, release policy, dependencies, and infrastructure become approval tasks. PR descriptions include trigger, failure, scope, verification, residual risk, and required confirmation.

## Allowed Automatic Work

### Documentation

Clarify fields, repair links, update examples from confirmed rules, and add maintenance guidance without changing product boundaries or weakening safety.

### Parsers

Repair a source-shape change or field mapping, add fixtures, and preserve original fields. Do not bypass source restrictions. Run parser tests and data-quality checks.

### Data

Use public official evidence to add documentation, license, installation, deprecation, duplicates, and evidence references. Prefer conservative risk fields.

### Evaluation

Turn a real error into an Eval Case, no-match case, safety assertion, or explanation check. Do not hard-code expectations merely to match current behavior.

### Feedback

Aggregate Web, MCP or API, and runtime outcomes into versioned summaries. Convert negative evidence into data-quality, misranking, or safety tasks. Promote useful scenarios into golden or safety cases and generate review summaries for drafts and promotion candidates.

Feedback processing stores no private code, email, token, secret, full prompt, or browser content. Small samples remain weak signals. Unsafe, omitted-permission, production, payment, email, database, and cloud-account reports require human review. LLM summaries must cite collected evidence.

## Work Requiring Human Confirmation

- Deleting substantial historical data.
- Changing core schema field semantics.
- Changing rating rules or weights materially.
- Trusting an unknown source automatically.
- Adding a high-risk source.
- Adding a paid service, closed dependency, or persistent infrastructure.
- Installing or running a third-party tool automatically.
- Lowering a security risk level.
- Changing Human Approval rules.

## Structured Improvement Task

```yaml
id: task-fix-gmail-risk-20260706
type: fix_recommendation_safety
trigger:
  source: eval_failure
  eval_case_id: gq-gmail-task-summary
problem:
  summary: Gmail recommendation did not require human confirmation.
  evidence:
    - "recommended_action was use"
    - "permissions include email"
suspected_cause:
  - recommendation guard does not enforce email approval
allowed_actions:
  - inspect_recommendation_rule
  - add_safety_eval
  - adjust_recommendation_guard
requires_human_approval: false
verification:
  - run safety eval
  - run the related golden query
```

## Workflow

```text
detect problem
  -> classify risk and domain
  -> collect source, review, evaluation, and feedback evidence
  -> decide whether automatic work is allowed
  -> create a task record
  -> use a branch or isolated workspace
  -> make the smallest verifiable change
  -> run tests and evaluation
  -> inspect the diff and evidence
  -> request approval when required
  -> submit the change
  -> observe later evaluation
```

## Change Report

Every self-improvement report states what changed, affected files or data, rationale, trigger evidence, related Tool Cards, Eval Cases, or Source Records, commands run, results, before and after behavior, residual risk, and whether human review is required.

## Eval Diff Backlog

Cross-release Eval Diff is not implemented and is not a release dependency. A future format may include data and rules versions, recommendation and risk-level changes, Top-1 changes per case, critical failures, and review requirements.

## Branch and Commit Rules

Prefer one small branch and one problem per change. Use descriptive commits such as `fix: correct mcp permission mapping`. Do not mix a schema redesign, parser repair, and rating-weight change.

Before committing, inspect the diff, run relevant tests or evaluation, and verify that no secret or private data is present.

## Safety Guardrails

An agent must not:

- Use private tokens for collection.
- Run an unknown tool as validation.
- Lower risk to make evaluation pass.
- Remove provenance.
- Change expected results silently.
- Add user files, email, or browser data to a dataset.
- Install tools, raise trust, lower risk, or publish unknown Tool Cards from feedback alone.

An agent preserves raw snapshots, marks uncertainty, asks for high-risk confirmation, chooses minimum verifiable changes, and treats feedback as review and evaluation input rather than standalone fact.

## Approval Requests

An approval request gives the objective, impact, risks, alternatives, recommendation, and one explicit decision. Ask a concrete question such as: "May the minimum risk for payment permission change from high to critical?" Avoid vague requests such as "Continue?"

## Maturity

### MVP

Documentation, low-risk parser repair, data-quality checks, manual evaluation comparisons, and agent-created draft PRs with verification.

### v0.2

Generated misranking tasks, added Eval Cases, recommendation-change reports, minimum feedback summaries, and Review Summary evidence without automatic gate waivers.

### v0.3

Provenance, URL checks, cross-source conflicts, Review Summary, data-quality gates, deterministic recommendation safety, structured Human Approval, and critical safety release gates. Cross-release Eval Diff remained backlog.

### v0.4

GitHub OAuth and D1 votes, optional structured Issue Form detail, feedback Issue classification into `accepted`, `rejected`, and `needs-human-review`, versioned feedback snapshots and rating inputs, latest-per-user-and-Tool Issue handling, and bounded adjustment from -3 through 3. Human review focuses on safety, rule disputes, evidence conflicts, and `needs-human-review`.

### v1.0

A stable configurable workflow with complete audit logs and rollback.

## Maintenance Rules

- High-risk changes always require a human or explicit approved policy.
- Every agent change remains replayable, explainable, and reversible.
- Update allowed scope and verification before adding an automatic action.
- Any relaxation of a security boundary requires human confirmation.
