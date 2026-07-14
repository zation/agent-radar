# 02 User Workflows

## Document Purpose

This document describes how human developers, coding agents, project maintainers, and tool maintainers use Agent Radar. It aligns the product experience, Workers MCP API design, data fields, and safety boundaries.

Every workflow serves the primary path in `docs/00-product-brief.md`: given a development need, find an appropriate AI tool and explain why it is recommended, when it should not be used, and where the risks lie.

## Role Overview

| Role | Primary goal | Primary entry point | Successful outcome |
| --- | --- | --- | --- |
| Human developer | Select a tool for the current development task | Web UI, CLI, Markdown report | Receives explainable candidates and can act |
| Coding agent | Select or exclude tools before execution | MCP query, JSON API, local index | Receives structured decision context |
| Project maintainer | Maintain data, ratings, and evaluations | Git, ingestion scripts, review UI | Trusted data and stable recommendations |
| Tool maintainer | Correct Tool Cards and source evidence | Issue, PR, form | Tool is classified and explained accurately |

## Workflow 1: A Human Developer Finds a Tool

### Trigger

The user has a concrete development need, for example:

- "I want to integrate Stripe Checkout into a Next.js application."
- "I need a coding agent to read Gmail and summarize action items."
- "I want an agent or CLI that can add tests to a Python project."

### Normal Path

1. The user enters a task description, technology stack, runtime environment, and risk preference.
2. The system parses intent and extracts domain, preferred tool types, required permissions, and constraints.
3. The system retrieves candidates and ranks them by taxonomy, rating, risk, and maintenance status.
4. The user reviews preferred recommendations, alternatives, and candidates that are discouraged or lack evidence.
5. The user opens Tool details and reviews the Tool Card summary, recommendation rationale, unsuitable scenarios, installation or integration method, permissions and security risks, sources, and update time.
6. The user selects a tool or passes the result to a coding agent.

### Output Requirements

The recommendation page must include:

- `recommendation_level`: `recommended`, `consider`, `avoid`, or `no_reliable_match`.
- `fit_summary`: why the tool fits the current task.
- `risk_summary`: primary risks and permissions.
- `evidence`: source URLs, update time, and field evidence.
- `next_action`: read documentation, request confirmation, perform pre-installation checks, or choose an alternative.

### Failure Paths

| Condition | System behavior |
| --- | --- |
| No reliable candidate | Return "No reliable recommendation," with reasons and search directions |
| Candidate is stale | Lower confidence and request a source recheck |
| Risk exceeds preference | Recommend human confirmation or a lower-permission alternative |
| Tool-type conflict | Show classification evidence and uncertainty |
| Insufficient source evidence | Mark low confidence and exclude from preferred recommendations |

## Workflow 2: A Coding Agent Selects a Tool

### Trigger

Before executing a user task, a coding agent must decide whether to use an existing tool, Skill, MCP Server, CLI, or Framework.

### Normal Path

1. Extract `task`, `language_or_stack`, `runtime_environment`, `allowed_permissions`, `risk_tolerance`, and `existing_tools`.
2. Call `recommend_tools`.
3. Read candidates, recommendation levels, fit reasons, permission risks, unsuitable conditions, and whether human confirmation is required.
4. Use a low-risk, high-fit tool; ask first for medium/high-risk tools; or implement directly/request more context when no reliable tool exists.
5. Cite the recommendation evidence in the final response or execution plan.

### Agent Decision Rules

| Recommendation output | Agent behavior |
| --- | --- |
| `recommended_action: use` | May include it in the plan while still respecting runtime permissions |
| `recommended_action: compare` | Present trade-offs to the user or in the plan |
| `recommended_action: ask_human` | Request confirmation before installation or authorization |
| `recommended_action: avoid` | Do not use it; explain risk or mismatch |
| `recommended_action: no_reliable_match` | Do not force a recommendation; implement directly or continue searching |

### Failure Paths

| Condition | Agent response |
| --- | --- |
| MCP query fails | Fall back to the local static index or report that lookup is unavailable |
| Recommendation lacks evidence | Do not use it as execution authority |
| Secret or account authorization required | Ask the user for confirmation and a safe path |
| Installation method is unclear | Do not install automatically; cite documentation |
| Recommendation conflicts with project security policy | Project security policy wins |

## Workflow 3: A Project Maintainer Adds a Source

### Trigger

A maintainer finds a suitable public source, such as an official registry, GitHub topic, package-manager search, or trusted community list.

### Normal Path

1. Add a draft to the Source Registry.
2. Record source type, trust level, available fields, rate limits, and usage restrictions.
3. Implement or configure a low-risk collection method.
4. Run ingestion and save a Raw Snapshot.
5. Run parser and normalizer to produce a Source Record and Tool Card draft.
6. Run data-quality checks.
7. Run automatic review, release admission, and promotion checks; persist evidence and interventions.
8. Run recommendation and rating evaluations and confirm there is no material regression.
9. Submit the change, reproducible before/after evaluation evidence, and reviewed bundle. At release time, the GitHub `production` gate provides one human confirmation for the automatically reviewed batch. A formal cross-release Eval Diff remains Backlog.

### Failure Paths

| Condition | Handling |
| --- | --- |
| Source violates terms | Do not integrate it |
| Source field quality is low | Use only as a discovery signal, not strong rating evidence |
| Frequent rate limiting | Reduce frequency or use manual import |
| Unstable structure | Preserve snapshots and mark the parser unstable |
| Many duplicates | Adjust deduplication before admission |

## Workflow 4: A Project Maintainer Corrects a Bad Recommendation

### Trigger

A user, agent, or evaluation finds an unreasonable result, such as a high-risk tool ranked first, unintuitive peer ordering, or an irrelevant recommendation.

### Normal Path

1. Record the case as an Eval Case.
2. Classify the cause: incorrect Tool Card field, taxonomy error, unreasonable rating weight, recommendation parsing failure, or stale data.
3. Correct data or taxonomy first.
4. If rating or recommendation logic must change, update the rules and expected evaluation behavior first.
5. Run the relevant rating and recommendation regression checks, and capture reproducible before/after evidence. A formal cross-release Eval Diff remains Backlog.
6. Submit the correction and explain the before/after recommendation difference.

### Constraints

- Never hard-code ranking merely to pass one evaluation case.
- Never lower a risk level to increase recommendation rate.
- Large rating-weight changes require human confirmation.

## Workflow 5: A Tool Maintainer Corrects a Tool Card

### Trigger

A tool maintainer finds inaccurate description, classification, installation, maintenance, or risk information.

### Normal Path

1. Submit a correction with official documentation, repository, or release evidence.
2. Agent Radar maintainers verify the evidence.
3. Update the Source Record or manual correction record.
4. Regenerate the Tool Card, rating, and index.
5. Run related golden queries if ranking may change.

### Rejection Conditions

- Marketing claims without verifiable sources.
- Requests to remove justified risk warnings without evidence.
- Requests to convert popularity, funding, or promotion directly into a high score.

## Workflow 6: Conservative Output When No Tool Fits

### Trigger

No tool satisfies the task, risk preference, and evidence-quality requirements.

### Output

State that there is no reliable recommendation, identify missing conditions, suggest alternative search directions, say whether direct implementation is appropriate, and request additional human context when needed.

```json
{
  "recommended_action": "no_reliable_match",
  "reason": "Candidate tools require email and filesystem permissions, but source evidence is insufficient and no active-maintenance signal is available.",
  "fallback": "Implement the minimum behavior with a project-local script, or have a human name an already trusted email MCP Server."
}
```

## Workflow 7: High-Risk Tool Approval

### High-Risk Triggers

Human confirmation is mandatory when:

- The request involves filesystem writes, shell execution, browser control, email reads, database writes, cloud accounts, payment accounts, or secrets.
- An unknown or unmaintained source must execute code.
- The installation script is opaque.
- The tool sends data to a third party.

### Approval Output

The system and agent must explain required permissions, why the task may need them, lower-permission alternatives, and that least privilege still applies after confirmation.

## Flow

```text
Task input
  -> Intent parsing
  -> Candidate retrieval
  -> Taxonomy filtering
  -> Rating and risk synthesis
  -> Recommendation explanation
  -> High risk?
      -> Yes: request human confirmation or offer alternatives
      -> No: return actionable guidance
  -> User or agent feedback
  -> Evaluation case or data correction
```

## Relationship to Other Documents

- Requirements: `docs/01-requirements.md`.
- Architecture modules: `docs/03-system-architecture.md`.
- Tool Card fields: `docs/04-data-model.md`.
- Taxonomy rules: `docs/05-taxonomy.md`.
- Ratings and risk levels: `docs/06-rating-rules.md` and `docs/11-security-and-trust.md`.
- Recommendation input and output: `docs/09-recommendation-engine.md`.

## Maintenance Rules

- Every important capability should map to at least one user workflow.
- A workflow containing a high-risk action must link to the security document.
- New workflows must define trigger, normal path, failure path, and output requirements.
