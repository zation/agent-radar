# 11 Security and Trust

## Purpose

This document defines how Agent Radar identifies and communicates tool risk. MCP servers, Skills, Agents, CLIs, and Frameworks may access files, browsers, databases, cloud services, email, accounts, and money, so security is a core product boundary.

Agent Radar is not a security scanner or audit platform. It conservatively represents risk during tool selection and prevents agents from treating unknown tools as trusted by default.

## Principles

- Never install or run an unknown tool automatically.
- Unknown permissions cannot be labeled low risk.
- High-risk permissions require human confirmation.
- Source trust is not a security guarantee.
- Explanations state permissions, data flow, and uncertainty.
- Never collect, store, or emit tokens, private keys, cookies, or private user data.

## Risk Classes

### Supply Chain

Risks include malicious dependencies, install-script execution, package confusion, repository takeover, and unverifiable release artifacts. Relevant fields are `install_methods`, `repo_url`, `package_urls`, `maintenance`, and `security.known_risks`.

Unknown trust plus code execution defaults to `avoid`. Opaque installation never produces an automatic installation instruction.

### Excessive Permissions

Filesystem writes, shell, browser, database, cloud, and other access may exceed the task's needs. Recommendations list permissions, propose minimum scope, and return `ask_human` or `avoid` when access exceeds tolerance.

### Prompt Injection

Web pages, email, documents, issues, Skills, prompts, and rules may contain hostile instructions. Browser, email, document, and web-collection tools are at least medium risk. Untrusted content must remain data, not instructions.

For v0.4 feedback processing:

- GitHub Issue titles, bodies, comments, user names, and links are untrusted input.
- Data Build deterministically validates the dedicated label, Issue Form fields, Tool Card key, and vote type before sending only minimum fields to an LLM.
- The LLM may return only schema-validated `accepted`, `rejected`, or `needs-human-review`. It has no tools and cannot mutate the repository.
- GitHub writes use fixed code paths and are limited to comments, processing labels, and closing `tool-feedback` Issues in `zation/agent-radar`.
- Security disputes, rating-rule disputes, evidence conflicts, and insufficient information produce `needs-human-review` and leave the Issue open.

### Secret Exposure

API keys, tokens, cookies, SSH keys, and environment values may leak into model context, third-party services, or logs. `secrets` access is at least high risk. Prefer test keys, short-lived tokens, minimum scope, and keeping live secrets outside agent context.

BYOK credentials authenticate one recommendation request only. HTTP and MCP request bodies contain no `api_key`; a request credential may appear only in the secret `X-Agent-Radar-LLM-API-Key` header. The Worker prefers that request-scoped value, then an explicitly injected server fallback, and otherwise returns a typed missing-credential error. Credentials never enter artifacts, logs, responses, browser share state, tool schemas, or evaluation output.

The remote MCP boundary is stateless and read-only for tool execution and installation. Before SDK dispatch, the Worker enforces the production Host allowlist, Origin policy, POST-only method policy with CORS preflight, and a fixed UTF-8 request-byte limit. Registry metadata marks the recommendation header optional and secret; publication evidence omits request headers entirely.

### Data Exfiltration

Hosted or API tools may send files, code, email, or database records off-device. Recommendations state when data leaves the local environment. Sensitive and enterprise use should prefer official, local, or lower-permission alternatives.

### Remote Code Execution

Shell commands, dependency installation, generated code, and remote scripts are at least high risk. Unknown trust plus `shell` or `code_execution` requires `avoid` or a stricter no-match result.

### Accounts, Production, and Money

Email, cloud accounts, payment, database writes, and production systems are sensitive. Payment and cloud administration are at least critical. Database writes are critical; database reads and email access are at least high. These operations require `ask_human` or a more conservative action.

## Permission Model

The schema authority is `docs/04-data-model.md`.

| Scope | Example | Minimum default risk |
| --- | --- | --- |
| `filesystem` | Read or write project files | read: medium; write: high |
| `network` | Call an external API | medium |
| `browser` | Control a browser | medium |
| `email` | Read or send email | high |
| `database` | Query or mutate data | read: high; write: critical |
| `cloud` | Manage hosted resources | high through critical |
| `payment` | Charge, refund, or transfer money | critical |
| `shell` | Execute commands | high |
| `code_execution` | Run code or scripts | high |
| `secrets` | Read API keys or tokens | high through critical |
| `unknown` | Unclear access | unknown; never low-risk recommendation |

| Access | Risk implication |
| --- | --- |
| `read` | Confidentiality and exfiltration risk |
| `write` | Destructive or state-change risk |
| `read_write` | Both read and write risk |
| `execute` | Arbitrary execution risk |
| `admin` | Highest privilege risk |
| `unknown` | Apply the conservative boundary |

## Trust Levels

| Level | Meaning | Constraint |
| --- | --- | --- |
| `official` | Maintained by the authoritative project or vendor | Still inspect permissions and data flow |
| `well_known_org` | Maintained by an established organization | Higher evidence confidence, not a security guarantee |
| `active_open_source` | Active public project | Inspect maintenance and community evidence |
| `individual` | Individually maintained | Recommend cautiously |
| `commercial` | Commercial service | Inspect exfiltration, terms, and lock-in |
| `unknown` | Unverified origin | Exclude from high-confidence recommendation |

## Risk Levels

| Level | Meaning | Recommendation behavior |
| --- | --- | --- |
| `low` | Trusted evidence, limited permission, and small impact | May recommend with conditions |
| `medium` | Limited permission or external API | May recommend with permissions and safe defaults |
| `high` | Sensitive data, execution, writes, or account access | Default to `ask_human` |
| `critical` | Money, cloud admin, secrets, or production writes | Never automatic; explicit confirmation required |
| `unknown` | Cannot determine the boundary | Exclude from low-risk recommendation |

## Deterministic Risk Floors

| Condition | Minimum risk |
| --- | --- |
| Unknown source | medium |
| Unknown permissions | unknown |
| Read local files | medium |
| Write local files | high |
| Shell or code execution | high |
| Browser automation | medium |
| Email access | high |
| Database read | high |
| Database write | critical |
| Cloud administration | critical |
| Payment operation | critical |
| Secret access | high |

Missing permissions, remote install scripts, default context upload, stalled maintenance on a privileged tool, rules that bypass confirmation, and credible security reports raise risk.

Official evidence, configurable minimum permissions, read-only mode, allowlists, documented data flow, security audits, and signed releases may reduce uncertainty, but never below the deterministic floor.

## Human Approval

The deterministic safety assessment in Recommendation Result v2 emits stable reason codes, an approval reason, `confirmation_questions`, and `safe_defaults`. Questions are guidance for a coding agent or read-only Web display. They are not approval records, authorization state, or permission to execute.

Human confirmation is required before:

- Installing or running an unknown tool.
- Executing shell commands, code, or remote scripts.
- Reading or writing files, email, databases, or cloud resources.
- Accessing payment, secrets, production accounts, or production state.
- Sending private code or documents to a third party.
- Changing core schema semantics or major rating weights.

```json
{
  "requires_human_approval": true,
  "approval_reason": "The tool reads email content containing personal data.",
  "safe_defaults": ["Use read-only access", "Limit mailbox labels", "Do not log message bodies"]
}
```

## Deterministic Data Release Gates

No LLM, Review Summary, or human-readable explanation can waive these failures:

- Critical provenance below 100 percent.
- Any unresolved critical semantic conflict, duplicate, validation error, intervention, or blocked promotion.
- A critical URL with embedded credentials, an unacceptable target, HTTP 404 or 410, or persistent permanent failure.
- Reliable Tool Card count outside 50 through 150.
- A checksum mismatch between `review_summary.v2` inputs and the reviewed bundle.

The URL checker accesses only public HTTP or HTTPS URLs and sends no cookie, authorization, API key, or browser session. Credential-bearing and non-HTTP URLs are skipped and may block by risk. Manual redirect validation rejects HTTPS downgrade, loops, excessive hops, private or reserved IPv4 and IPv6, non-public DNS results, and unreviewed cross-site targets. Reviewed official migrations use an explicit code allowlist. HTTP 401 or 403, HTTP 429, and first transient failures remain explainable warnings, never false reachable results.

Source profiles add reviewed field semantics but cannot use stars, topics, or package existence to lower permission or security risk.

The local Codex network proxy may map through `198.18/15` only when a developer explicitly sets `AGENT_RADAR_ALLOW_BENCHMARK_PROXY_DNS=true` for a local exercise. Release All never sets it; production treats the reserved range as non-public.

## GitHub OAuth and Feedback Boundaries

OAuth requests no scope and reads only public GitHub user ID and login. The access token is used once for identity lookup and is not retained.

Session and ten-minute OAuth state cookies use Web Crypto HMAC-SHA256 with `HttpOnly; Secure; SameSite=Lax; Path=/`. Sessions last 30 days and are not stored in D1. Vote mutation requires a valid session, same-origin `Origin`, JSON content type, and a fixed limit of 30 mutations per GitHub user ID per minute.

Errors must not reveal OAuth code, token, secret, cookies, or raw GitHub or D1 response bodies. D1 stores no Issue reason or other feedback free text, and public APIs expose no voter list.

## Security Explanations

```text
Medium: This tool needs {permission}. Limit its scope to {scope_limit} and verify {source} before use.

High: This tool can access or modify {sensitive_scope}. Do not enable it automatically; confirm permissions, data flow, and alternatives first.

Critical: This tool can affect {critical_scope}, including money, production, secrets, or cloud resources. Use only after explicit confirmation in a minimum-permission environment.

Insufficient evidence: Permission or source evidence is incomplete. Treat the result as low confidence and do not install or run it automatically.
```

## Default Distrust Behavior

For an unknown tool, Agent Radar does not install, run, provide secrets, grant file, browser, email, database, or cloud access, accept author claims as security conclusions, or treat popularity as trust evidence.

`risk_level` above tolerance changes the action to `ask_human` or `avoid`. Critical risk cannot produce `use`. Unknown permissions cannot enter a low-risk recommendation. High-risk candidates state risks and safe next steps.

## Collection Boundaries

Collection excludes private repositories, user email or files, authenticated browser pages, access-control bypasses, and leaked-secret content. Suspected tokens are not stored verbatim and create a security event. Sources with unclear terms remain disabled.

## Security Evaluation

Release evaluation includes:

- Unknown trust plus code execution produces `avoid`.
- Email access plus low tolerance produces `ask_human`.
- Payment plus unknown source produces `avoid` at critical risk.
- Unknown permissions never become low risk.
- Instructions to bypass safety rules produce `avoid`.

Any critical safety failure blocks release.

## Maintenance Rules

- Prefer conservative risk over higher recommendation coverage.
- Permission, installation, and execution automation defaults to minimum privilege.
- A new permission scope requires synchronized data-model, rating, recommendation, and evaluation updates.
- Security boundaries override ranking optimization.
- Feedback adjustment cannot lower risk, raise trust, or bypass a critical safety gate.
- Feedback titles, bodies, reasons, comments, URLs, and user names remain untrusted. The classifier has no tools and returns only a fixed state, reason code, and public summary of at most 240 characters.
- Build artifacts exclude user-level D1 rows, original Issue reasons, full prompts, raw provider responses, tokens, cookies, and environment values.
- GitHub read and write paths are fixed to `zation/agent-radar`; build has `issues: read`, while deploy receives `issues: write` only after production approval.
- Writeback rechecks `updated_at` and processing labels and uses a hidden marker for idempotency. Any drift or required write failure blocks deployment.
