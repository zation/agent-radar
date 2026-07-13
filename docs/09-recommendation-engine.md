# 09 Recommendation Engine

## Purpose

This document defines how Agent Radar recommends tools for a user need or coding-agent task. Recommendations must be explainable, auditable, and explicit about rejected alternatives.

The goal is not to return the most popular tool. It is to produce an actionable choice under task, environment, risk, and evidence constraints.

## Current Deterministic Safety Layer

After an LLM interprets the task and selects candidates, every dynamic recommendation passes through the same deterministic safety layer. The layer combines Tool Card permissions and trust, Rating risk, allowed permissions, and risk tolerance. It emits the structured `safety_assessment` in Recommendation Result v2 and may tighten the final action.

An LLM may be more conservative, but it cannot relax `ask_human`, `avoid`, or `no_reliable_match`. Web, HTTP API, MCP, and golden evaluation share this path. Responses bind to a release ID and commit SHA.

## Principles

- Task fit takes priority over popularity.
- Safety boundaries take priority over ranking optimization.
- Insufficient evidence produces a conservative outcome.
- Reasons cite Tool Card fields, Rating Results, or source evidence.
- No trustworthy candidate produces `no_reliable_match`.
- Output serves both human readers and agent decision making.

## Recommendation Query

```json
{
  "task": "Integrate Stripe Checkout into a Next.js application",
  "language_or_stack": ["typescript", "next.js"],
  "environment": ["local_dev", "web_app"],
  "preferred_tool_types": ["skill", "framework", "docs"],
  "allowed_permissions": ["network", "filesystem_read"],
  "risk_tolerance": "medium",
  "existing_tools": ["codex"],
  "budget": "free_or_low_cost",
  "output_format": "json",
  "top_k": 5,
  "api_key": "sk-example",
  "model": "gpt-4.1"
}
```

| Field | Required | Meaning |
| --- | --- | --- |
| `task` | yes | Natural-language task |
| `language_or_stack` | no | Languages, frameworks, and stack |
| `environment` | no | Local, CI, browser, cloud, IDE, or other context |
| `preferred_tool_types` | no | Preferred candidate types |
| `allowed_permissions` | no | Permission scopes the user permits |
| `risk_tolerance` | no | `low`, `medium`, or `high` |
| `existing_tools` | no | Tools already available to the agent or project |
| `budget` | no | Cost preference |
| `output_format` | no | `json` or `markdown` |
| `top_k` | no | Requested result count |
| `api_key` | conditional | BYOK key for this request; optional when `AGENT_RADAR_LLM_API_KEY` exists locally or on the server |
| `model` | no | Model name; otherwise use `AGENT_RADAR_LLM_MODEL` or the provider-registry default |
| `base_url` | unsupported in body | Use server-side `AGENT_RADAR_LLM_BASE_URL` for an OpenAI-compatible endpoint override |

The API key authenticates only the current provider request. It must never enter artifacts, logs, response bodies, or shareable browser state. System environment variables take precedence over repository-root `.env`. A base-URL override changes the endpoint only; it does not change provider type or model ID.

## LLM Recommendation Flow

The current implementation has no local keyword-scoring recommender. The LLM interprets the query, selects and ranks catalog candidates, explains its choices, and identifies rejected alternatives.

Local deterministic code:

- Builds context from Tool Cards, Rating Results, risks, and evidence.
- Restricts output to known `tool_id` values.
- Validates and normalizes output to Recommendation Result v2.
- Rejects unknown IDs or returns `no_reliable_match`.
- Enforces conservative handling for `high`, `critical`, and `unknown` risk.
- Applies the deterministic safety layer after LLM output.

### Query Understanding

```json
{
  "intent": "payment_integration",
  "task_domains": ["payments", "web_app"],
  "required_capabilities": ["stripe_checkout", "nextjs_integration"],
  "likely_permissions": ["network", "secrets"],
  "tool_type_hints": ["skill", "framework", "docs"],
  "risk_flags": ["payment", "api_keys"],
  "confidence": "medium"
}
```

Uncertainty lowers confidence rather than forcing an inference. Payment, email, database, cloud account, secret, and shell tasks require risk flags. Query understanding is part of the final explanation.

### Candidate Context

Candidate context includes Tool Card name, summary, purpose, use cases, tags, type, compatible agents, trust, and Rating dimensions. The LLM must preserve match reasons that identify capabilities, tags, scores, risks, or evidence.

### Hard Constraints

| Condition | Behavior |
| --- | --- |
| Deprecated tool | Exclude by default |
| Risk exceeds tolerance | Downgrade or require human confirmation |
| Critical fields missing | Exclude from reliable recommendation |
| Evidence quality is unknown | Mark `insufficient_evidence` |
| Local execution requested but tool is hosted only | Downgrade |
| Required permission is not allowed | `ask_human` or exclude |
| Stack is incompatible | Exclude or downgrade |

Important rejected candidates remain in `rejected_candidates` with reasons.

### Ranking

The LLM emits a `fit_score` from 0 through 100 by considering task fit, Rating Result, evidence quality, maintenance, integration fit, and safety fit. Local code does not maintain a second fixed ranking formula. When `fit_score` is invalid or absent, Rating overall score is a display fallback only.

- Risk above tolerance caps the action at `ask_human`.
- `critical` risk cannot produce `use`.
- Unknown permissions cap safety at 40.
- Unknown source evidence caps evidence at 30.
- Top results should include useful type diversity unless the task asks for one type.
- When a high-permission MCP is preferred, include a lower-permission documentation or manual alternative when available.

The implementation may recover catalog-backed candidates when an LLM over-rejects a covered task, but recovered candidates still pass all deterministic safety constraints. A low-tolerance task that combines payment and production database operations remains `no_reliable_match`. Explicit unknown-source code execution remains `avoid` even when the provider returns no candidates.

## Recommendation Result v2

```json
{
  "id": "recommendation-example",
  "schema_version": "recommendation_result.v2",
  "release": {
    "release_id": "all-v0.4.4",
    "commit_sha": "0b9fc48c"
  },
  "query": {
    "task": "Integrate Stripe Checkout into a Next.js application",
    "risk_tolerance": "medium"
  },
  "recommended_action": "ask_human",
  "query_understanding": {
    "intent": "payment_integration",
    "risk_flags": ["payment", "secrets"],
    "confidence": "medium"
  },
  "safety_assessment": {
    "risk_level": "critical",
    "requires_human_approval": true,
    "reason_codes": ["payment_operation", "secrets_access"],
    "confirmation_questions": ["Confirm that test-mode credentials and minimum permissions will be used."],
    "safe_defaults": ["Use test mode", "Keep secrets out of model context"],
    "maximum_allowed_action": "ask_human"
  },
  "candidates": [
    {
      "tool_id": "stripe-official-docs",
      "name": "Stripe Official Documentation",
      "rank": 1,
      "recommendation_level": "recommended",
      "fit_score": 88,
      "risk_level": "medium",
      "tags": ["payment", "nextjs"],
      "why": ["Official evidence covers Next.js and Stripe Checkout integration."],
      "risks": ["Payment credentials must remain outside agent context."],
      "not_for": ["Fully custom payment orchestration."],
      "next_steps": ["Read the official test-mode guide and begin with a test key."],
      "evidence_refs": ["source-record-stripe-docs", "rating:stripe-official-docs"]
    }
  ],
  "rejected_candidates": [
    {
      "tool_id": "unknown-payment-cli",
      "reason": "Unknown source with payment-secret access."
    }
  ]
}
```

The schema authority is `docs/04-data-model.md`. Candidate-level `recommendation_level` does not override the result-level deterministic action or safety assessment.

## Recommendation Actions

| Action | Condition | Agent behavior |
| --- | --- | --- |
| `use` | One candidate is clearly best and low or medium risk is controlled | Include it in an execution plan |
| `compare` | Candidates are close or tradeoffs matter | Present differences and choose |
| `ask_human` | High-risk access, accounts, or material uncertainty | Request confirmation first |
| `avoid` | Relevant options have unacceptable quality or risk | Do not use them |
| `no_reliable_match` | No reliable candidate exists | Do not force a recommendation |

Reject or downgrade a tool when it lacks core task fit, is deprecated, has insufficient evidence, requires excessive permissions, has opaque installation, lacks official support for secrets or sensitive operations, or has unreproducible documentation. Rejection must be explained, not silently hidden.

## Example Queries

### Python Test Coverage

A local Python test task should prefer a CLI, agent, or skill that can explain test strategy or safely generate tests. Explain filesystem writes and reject unknown code-execution tools.

### Gmail Task Summary

Reading Gmail in Codex requires explicit email capability and must produce `ask_human` or a more conservative action. Explain privacy and permission scope.

### Browser Screenshot Validation

Opening a local page and taking screenshots should surface browser automation, Playwright, MCP, or skill candidates. Explain browser control and local network access.

### Production Payment Refunds

A low-tolerance request to automate production refunds should prefer official guidance, reject unknown tools, require human confirmation, and classify the risk as at least high and normally critical.

## Markdown Presentation

```markdown
Recommended action: ask_human

Preferred candidate: <tool name>
Reason: <task, taxonomy, and rating evidence>
Primary risk: <permissions, secrets, or data transfer>
Use when: <safe conditions>
Do not use when: <excluded conditions>
Evidence: <source URL or evidence ID>
Next step: <action for the user or agent>
```

## Worker and MCP Interfaces

The Worker provides two agent-facing entry points:

- `/api/mcp_manifest` returns read-only tool definitions for simple HTTP JSON clients.
- `/api/mcp` is a minimal MCP JSON-RPC endpoint supporting `initialize`, `tools/list`, and read-only `tools/call`.
- `data/provider_registry.json` contains versioned provider runtime configuration, models, endpoints, instruction roles, and BYOK behavior, but no API key.
- `data/mcp_examples.json` contains JSON-RPC examples for initialization, listing, card lookup, and search.
- `data/mcp_smoke_checklist.json` defines deployed read-only smoke checks.
- `npm run mcp:smoke` reads `AGENT_RADAR_MCP_BASE_URL` and verifies the deployed endpoint. It discovers a current `tool_id` with `search_tools` before testing `get_tool_card`.

### Read-Only Tools

- `search_tools` accepts `query`, `filters`, and `top_k`; it returns summaries, matched fields, risks, and confidence.
- `get_tool_card` accepts `tool_id`; it returns the Tool Card, Rating Result, and evidence.
- `recommend_tools` accepts a Recommendation Query and returns a Recommendation Result.
- `explain_rating` accepts `tool_id` and optional `task`; it returns dimension explanations, adjustments, and safety risks.

## Evaluation and Maintenance

The engine must pass golden queries, no-reliable-match cases, high-risk permission cases, peer ranking cases, and explanation review. Without `AGENT_RADAR_LLM_API_KEY`, offline evaluation emits a blocked summary instead of running a retired local recommender.

Provider-backed evaluation runs at most two Golden Queries concurrently. Each provider request has a 60-second timeout so a stalled network call becomes a typed `provider_request_failed` result instead of blocking the release pipeline indefinitely. Evaluation retries one transient request failure after a five-second backoff; authentication, rate-limit, and model-configuration failures remain immediately actionable.

Failures identify affected queries, changed ranks or actions, and whether the cause is data, rating, provider output, schema normalization, or deterministic safety.

- Recommendation reasons cite concrete fields or ratings.
- No suitable tool produces `no_reliable_match`.
- Prompt, normalization, or safety-gate changes require provider evaluation.
- New output fields require synchronized updates to the data model and Worker MCP contract.
