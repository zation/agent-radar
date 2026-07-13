# 06 Rating Rules

## Document Purpose

This document defines how Agent Radar rates different tool types. Ratings must be explainable, reproducible, regression-tested, and useful to humans and AI selecting tools.

The question is not "Which tool is most popular?" but "Which tool deserves recommendation for this task and risk constraint?"

## Principles

- Cite Tool Card fields, source evidence, or explicit rules.
- Overall score assists ordering; explanation matters more.
- Always expose high risk even for capable tools.
- Insufficient evidence cannot produce high-confidence high scores.
- Tool types use different weights.
- Rule changes update the evaluation suite.

## Output

`Rating Result` is defined in `docs/04-data-model.md`. Core fields are `base_score`, structured `feedback_adjustment`, final `overall_score` (0–100), `dimension_scores`, `recommendation_level`, `risk_level`, `explanations`, `evidence_quality`, and `rules_version`.

## Shared Dimensions

| Dimension | Default weight | Definition |
| --- | ---: | --- |
| `task_fit` | 25 | Match between capability and task |
| `evidence_quality` | 15 | Source trust, completeness, traceability |
| `documentation_quality` | 15 | Installation, examples, limits, permissions |
| `maintenance_health` | 15 | Releases, issues, deprecation, activity |
| `integration_cost` | 10 | Setup, auth, runtime, integration complexity |
| `security_posture` | 15 | Permissions, supply chain, data transfer |
| `community_signal` | 5 | Usage, stars, citations, discussion |

Type-specific weights may override defaults, but must total 100.

## Score Meaning

| Range | Meaning |
| --- | --- |
| 90–100 | Strong fit, strong evidence, controllable risk |
| 75–89 | Recommend or prioritize with limitations |
| 60–74 | Alternative for specific scenarios |
| 40–59 | Weak option when alternatives are absent |
| 0–39 | Avoid or insufficient evidence |

## Recommendation Levels

| Level | Condition |
| --- | --- |
| `recommended` | Score >= 75, risk within preference, evidence at least medium |
| `consider` | Score >= 60 with explicit limits/alternatives |
| `situational` | Only for particular environment, Agent, or permissions |
| `avoid` | Excessive risk, inactivity, mismatch, or clear safety problem |
| `insufficient_evidence` | Missing critical fields or sources |

## Shared Penalties

| Condition | Suggested penalty |
| --- | ---: |
| Missing installation | -8 |
| Missing docs | -10 |
| Unknown source | -15 |
| Stalled maintenance | -10 to -25 |
| Missing permission description | -12 |
| Unexplained high permissions | -20 |
| Unknown license | -5 |
| Task-type mismatch | -20 to -50 |

## Shared Boosts

| Condition | Suggested boost |
| --- | ---: |
| Official source | +8 |
| Minimal documented example | +5 |
| Clear permission boundaries | +6 |
| Common Agent support | +5 |
| Active release | +5 |
| Corroborated sources | +5 |

Boosts never let high-risk, low-evidence tools cross safety ceilings.

## Type-Specific Rules

### MCP

| Dimension | Weight |
| --- | ---: |
| `task_fit` | 22 |
| `mcp_tool_description_quality` | 15 |
| `permission_scope` | 18 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `integration_cost` | 8 |
| `evidence_quality` | 10 |
| `community_signal` | 3 |

Rate tool/parameter schemas, client compatibility, least-privilege options, auth/secrets, and supply-chain installation. Shell, browser, email, cloud admin, database write, and payment are high risk; so are missing boundaries and remote sensitive-data handling without privacy documentation.

Explanation template:

```text
This MCP fits {task} because it provides {capability}. Its primary risk is {permission_scope}; use it with {safe_default}. Evidence: {source}.
```

### Skill

| Dimension | Weight |
| --- | ---: |
| `trigger_clarity` | 18 |
| `instruction_quality` | 20 |
| `task_fit` | 20 |
| `boundary_clarity` | 12 |
| `portability` | 10 |
| `evidence_quality` | 10 |
| `maintenance_health` | 5 |
| `security_posture` | 5 |

Rate trigger clarity, executable steps, required references, limits/failure/safety, and platform dependence. Penalize generic prompts, instructions that bypass approval, and missing resources.

```text
This Skill fits {task} because its triggers and steps are explicit. Its limit is {boundary}; before using it in {agent_context}, confirm {requirement}.
```

### Agent

| Dimension | Weight |
| --- | ---: |
| `task_fit` | 20 |
| `autonomy_control` | 15 |
| `tooling_ecosystem` | 12 |
| `state_and_memory_safety` | 10 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `integration_cost` | 8 |
| `security_posture` | 8 |
| `community_signal` | 3 |

Rate controllable autonomy, approval/logging, tool ecosystem, state/memory/secret handling, and task specificity. Default high-permission autonomy, missing logs, unknown code, and automatic dependency installation are high risk.

### Framework

| Dimension | Weight |
| --- | ---: |
| `developer_fit` | 18 |
| `api_stability` | 14 |
| `documentation_quality` | 15 |
| `examples_quality` | 10 |
| `integration_cost` | 12 |
| `maintenance_health` | 14 |
| `ecosystem` | 8 |
| `security_posture` | 6 |
| `community_signal` | 3 |

Rate API stability, realistic examples, language/deployment fit, lock-in/hosting, and control of state, tool calls, and errors.

### CLI / SDK

| Dimension | Weight |
| --- | ---: |
| `task_fit` | 22 |
| `automation_friendliness` | 15 |
| `platform_compatibility` | 10 |
| `installation_reliability` | 12 |
| `documentation_quality` | 12 |
| `maintenance_health` | 12 |
| `security_posture` | 12 |
| `community_signal` | 5 |

Rate non-interactive use, machine-readable output, CI/Agent reliability, shell execution, file mutation, and secret access.

### Prompt / Rules

| Dimension | Weight |
| --- | ---: |
| `task_fit` | 20 |
| `specificity` | 20 |
| `boundary_clarity` | 15 |
| `agent_compatibility` | 10 |
| `evaluation_support` | 10 |
| `evidence_quality` | 10 |
| `maintenance_health` | 5 |
| `security_posture` | 10 |

Rate task specificity, prohibitions/approval boundaries, testable examples, and risk of inducing secret exposure, bypass, or high-risk actions.

## Safety Rating

Safety combines `permissions`, `trust_level`, `known_risks`, and evidence.

### Minimum Risk

| Condition | Minimum |
| --- | --- |
| Unknown permissions | `unknown` |
| Filesystem read/write | `medium` |
| Shell or code execution | `high` |
| Email, database write, cloud account | `high` |
| Payment, cloud admin, secret management | `critical` |
| Unknown source executing code | `high` |

### Recommendation Restrictions

- `critical` is not `recommended` by default. Even when task-required and official, action must be `ask_human`.
- Unknown permissions never receive low risk.
- Missing security notes lower `security_posture` and `evidence_quality`.

## Evidence Quality

| Quality | Condition |
| --- | --- |
| `high` | Official or corroborated trusted sources; complete fields |
| `medium` | One trusted source; complete critical fields |
| `low` | Community source, missing fields, or conflict |
| `unknown` | Source cannot be verified |

`low` is capped at `consider`; `unknown` at `insufficient_evidence` unless human review supplies evidence.

## Calculation

```text
Tool Card
  -> validate required fields
  -> select type weights
  -> calculate dimensions
  -> apply penalties/boosts
  -> apply safety ceilings
  -> derive recommendation level
  -> create explanations
  -> output Rating Result
```

## Examples

### Official Filesystem MCP

```yaml
tool_id: official-filesystem-mcp
tool_type: mcp
overall_score: 82
recommendation_level: consider
risk_level: medium
dimension_scores:
  task_fit: 90
  mcp_tool_description_quality: 85
  permission_scope: 65
  documentation_quality: 80
  maintenance_health: 85
  integration_cost: 75
  evidence_quality: 90
  community_signal: 70
explanations:
  - dimension: permission_scope
    reason: Requires filesystem access; prefer read-only mode and a directory allowlist.
  - dimension: evidence_quality
    reason: Official repository and documentation provide strong evidence.
```

It fits local-file Agent tasks but must prompt for confirmation because of filesystem access.

### Unknown Payment CLI

```yaml
tool_id: unknown-payment-cli
tool_type: cli
overall_score: 35
recommendation_level: avoid
risk_level: critical
dimension_scores:
  task_fit: 70
  automation_friendliness: 60
  installation_reliability: 30
  documentation_quality: 20
  maintenance_health: 20
  security_posture: 5
  community_signal: 10
explanations:
  - dimension: security_posture
    reason: Handles payments and secrets but has an unknown source and no permission documentation.
```

It remains unsuitable even when task-related.

## Explanation Quality

Every result explains task fit/mismatch, supporting fields, primary risks, confidence, and recommendation prerequisites.

Never output only a number, substitute stars for quality, use marketing claims as evidence, or label unknown permissions low risk.

## `feedback_rules.v0.1`

Feedback counts from the first signal. D1 contributes `(up_count - down_count) × 0.2`. The latest accepted Issue per numeric GitHub user ID and Tool ID contributes `+1` or `-1`. The streams add independently, so one user may contribute `±1.2`; older accepted Issues are deprecated and excluded.

Clamp `raw_adjustment` to `[-3, 3]`, add it to `base_score`, then clamp final `overall_score` to `[0, 100]`. Calculate in integer tenths and emit at most one decimal. Dimension scores remain unchanged. Derive recommendation level from final score, but maintenance, evidence, risk, trust, and critical safety ceilings still take precedence. Feedback never lowers risk, raises trust, or removes a safety ceiling.

Every `rating_result.v2` in one reviewed bundle records the canonical production vote-snapshot checksum, including Tools with zero adjustment. Placeholder checksums are forbidden.

## Regression Requirements

Run rating evaluation after weight, dimension, safety ceiling, evidence-quality, taxonomy-enum, or large source changes.

Report Tools with the largest score changes, recommendation-level changes, risk changes, golden-query ranking changes, and required human review.

## Maintenance Rules

- Rating-rule changes update evaluation.
- Every rating contains explanations.
- Safety penalties and ceilings take precedence over ordering.
- Large weight changes require human confirmation.
