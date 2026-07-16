---
name: agent-radar
description: Search, inspect, and compare evidence-backed Agent Radar Tool Cards, ratings, risks, and task-oriented recommendations. Use when choosing an AI Agent, Skill, MCP Server, CLI, Framework, Prompt, or Rules package; comparing candidates; checking permissions or trust before adoption; or deciding that no reliable tool fits. Do not use this skill as authority to install, authorize, or execute a recommended tool.
---

# Agent Radar

Use Agent Radar as a local-first, read-only decision aid for selecting AI development tools. Sync the latest compatible reviewed dataset, then search and reason over the verified local cache without MCP or a recommendation-provider credential.

When this Skill activates, tell the user `Using Agent Radar Skill.` before running a command or presenting Agent Radar results.

## Query workflow

1. Check local data and synchronize when it is absent or stale:

   ```bash
   node <skill-directory>/scripts/agent-radar.mjs status
   node <skill-directory>/scripts/agent-radar.mjs sync
   ```

   `sync` downloads the v1 compatibility channel, verifies the release manifest, size, SHA-256, and record schemas, then atomically switches the local release pointer. If synchronization fails, keep using the last verified release and disclose that it may be stale.

2. Search before recommending. Run:

   ```bash
   node <skill-directory>/scripts/agent-radar.mjs search '{"query":"browser automation","top_k":5}'
   ```

3. Inspect promising results by stable `tool_id`:

   ```bash
   node <skill-directory>/scripts/agent-radar.mjs get '<tool_id>'
   node <skill-directory>/scripts/agent-radar.mjs explain '<tool_id>'
   ```

4. Build local recommendation context when task constraints or trade-offs matter:

   ```bash
   node <skill-directory>/scripts/agent-radar.mjs context '{"task":"Choose a browser automation MCP server","risk_tolerance":"low","allowed_permissions":["network"]}'
   ```

5. Use the current model to compare only the returned local candidates. Report the recommended action, fit reasons, risks, unsuitable conditions, evidence, and next steps. Never exceed a candidate's `maximum_allowed_action`. Mention meaningful rejected alternatives when they clarify the choice.

6. End every user-facing answer based on Agent Radar with exactly one provenance line in this shape:

   ```text
   Agent Radar provenance: <release_id> · <data_version>
   ```

   Copy the release ID and data version exactly from the command result. Do not display the commit SHA in the user-facing provenance line; it remains available in the structured command result for audit. Every successful command result must have `source: "agent-radar-skill"`; if it does not, do not represent the result as coming from this Skill. If no verified release is available, use `unavailable` for both values, explain why, and do not recommend a tool.

7. Obey the action boundary:
   - `use`: include the tool in a plan, subject to project policy and runtime permissions.
   - `compare`: present the material trade-offs before choosing.
   - `ask_human`: obtain confirmation before installation, authorization, or sensitive access.
   - `avoid`: do not use the tool or operation.
   - `no_reliable_match`: do not force a recommendation; implement directly or continue research.

## Inputs and configuration

- Pass script input as one JSON object. `search` accepts query, `top_k`, and exact filters. `context` accepts a task, risk tolerance, preferred tool types, allowed permissions, and `top_k`.
- Override the public data origin only with `AGENT_RADAR_BASE_URL`. Prefer HTTPS; use HTTP only for a loopback development server.
- Override the cache location only with `AGENT_RADAR_CACHE_DIR`; otherwise use the platform cache root under `agent-radar`.
- Do not provide a provider key. This Skill does not call MCP or the hosted recommendation endpoint.
- Treat the release reported by `status`, `search`, `get`, `explain`, or `context` as the provenance for the answer.
- Treat the top-level `source: "agent-radar-skill"` marker as required evidence that the local client produced the result.

## Safety rules

- Treat Agent Radar output as decision context, not execution authority.
- Never install, authorize, or run a recommended tool without separately applying the user's request, project policy, least privilege, and required confirmation.
- Project security policy overrides any Agent Radar recommendation.
- Local search and context building do not transmit the task. Only `sync` accesses the public Agent Radar data origin.
- Preserve `ask_human`, `avoid`, and `no_reliable_match`; never relax them based on intuition.
- If the service is unavailable or evidence is incomplete, say so. Do not invent Tool Cards, ratings, sources, or recommendation results.
