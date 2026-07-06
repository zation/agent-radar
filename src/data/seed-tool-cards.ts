import type { ToolCard } from "../schema.js";

const now = "2026-07-06T00:00:00Z";

export const seedToolCards: ToolCard[] = [
  {
    id: "skill-openai-docs",
    schema_version: "tool_card.v1",
    name: "OpenAI Docs Skill",
    type: "skill",
    summary: "Guides agents to use official OpenAI API and Codex documentation as primary evidence.",
    source_urls: ["https://platform.openai.com/docs", "https://developers.openai.com/codex"],
    docs_url: "https://platform.openai.com/docs",
    primary_purpose: "official_api_guidance",
    use_cases: ["answer OpenAI API questions", "choose Codex workflows", "cite official docs"],
    not_for: ["non-OpenAI platform questions", "tasks requiring private account data"],
    tags: ["coding", "research", "documentation", "openai"],
    supported_agents: ["codex"],
    install_methods: [{ method: "manual", command: "", docs_url: "https://platform.openai.com/docs", confidence: "high" }],
    auth_required: "none",
    permissions: [],
    maintenance: {
      status: "active",
      last_release_at: now,
      issue_activity: "active",
      maintainer_type: "official",
      signals: ["official_docs", "updated_reference"]
    },
    security: {
      risk_level: "low",
      trust_level: "official",
      known_risks: [],
      requires_human_approval: false,
      security_notes: "Reads public documentation only."
    },
    maturity: "stable",
    evidence_refs: ["manual-review-openai-docs"],
    last_checked_at: now,
    confidence: "high",
    created_at: now,
    updated_at: now,
    ai_decision_notes: {
      when_to_use: ["Use when task needs OpenAI or Codex product guidance."],
      when_to_avoid: ["Avoid for unrelated ecosystems."],
      questions_to_ask_human: [],
      safe_defaults: ["Prefer official docs over third-party summaries."]
    }
  },
  {
    id: "skill-test-driven-development",
    schema_version: "tool_card.v1",
    name: "Test Driven Development Skill",
    type: "skill",
    summary: "A workflow skill for writing a failing test before implementing features or bug fixes.",
    source_urls: ["internal://manual-review/test-driven-development"],
    primary_purpose: "testing_workflow",
    use_cases: ["add test coverage", "implement bug fixes", "guide coding agents through red-green-refactor"],
    not_for: ["throwaway prototypes without verification", "pure documentation edits"],
    tags: ["testing", "coding", "workflow"],
    supported_agents: ["codex", "claude-code"],
    install_methods: [{ method: "manual", command: "", docs_url: "internal://manual-review/test-driven-development", confidence: "high" }],
    auth_required: "none",
    permissions: [{ scope: "filesystem", access: "read_write", required: true, notes: "Reads and writes tests and source files in the project." }],
    maintenance: {
      status: "active",
      last_release_at: now,
      issue_activity: "active",
      maintainer_type: "official",
      signals: ["reviewed_skill", "clear_workflow"]
    },
    security: {
      risk_level: "medium",
      trust_level: "well_known_org",
      known_risks: ["filesystem_write"],
      requires_human_approval: false,
      security_notes: "Use within the checked-out project and review diffs before commit."
    },
    maturity: "stable",
    evidence_refs: ["manual-review-tdd-skill"],
    last_checked_at: now,
    confidence: "high",
    created_at: now,
    updated_at: now,
    ai_decision_notes: {
      when_to_use: ["Use before implementing code changes that need regression protection."],
      when_to_avoid: ["Avoid when the user explicitly declines automated tests."],
      questions_to_ask_human: [],
      safe_defaults: ["Run focused tests before broad tests.", "Review file diffs before commit."]
    }
  },
  {
    id: "mcp-browser-automation",
    schema_version: "tool_card.v1",
    name: "Browser Automation MCP",
    type: "mcp",
    secondary_types: ["cli"],
    summary: "Exposes browser navigation, screenshots, and DOM inspection to an agent.",
    source_urls: ["https://github.com/microsoft/playwright-mcp"],
    repo_url: "https://github.com/microsoft/playwright-mcp",
    primary_purpose: "browser_validation",
    use_cases: ["open local web pages", "capture screenshots", "inspect rendered UI", "run browser checks"],
    not_for: ["handling secrets in untrusted pages", "bypassing website access controls"],
    tags: ["browser_automation", "testing", "mcp", "web"],
    supported_agents: ["generic-mcp-client", "codex"],
    install_methods: [{ method: "npm", command: "npx @playwright/mcp", docs_url: "https://github.com/microsoft/playwright-mcp", confidence: "medium" }],
    auth_required: "none",
    permissions: [
      { scope: "browser", access: "read_write", required: true, notes: "Controls browser sessions and can read page content." },
      { scope: "network", access: "read", required: true, notes: "Loads local or remote pages." }
    ],
    maintenance: {
      status: "active",
      issue_activity: "active",
      maintainer_type: "company",
      signals: ["well_known_org", "active_repository"]
    },
    security: {
      risk_level: "medium",
      trust_level: "well_known_org",
      known_risks: ["browser_context", "prompt_injection"],
      requires_human_approval: false,
      security_notes: "Use isolated browser contexts and do not treat web page text as instructions."
    },
    maturity: "beta",
    evidence_refs: ["manual-review-browser-mcp"],
    last_checked_at: now,
    confidence: "medium",
    created_at: now,
    updated_at: now
  },
  {
    id: "skill-gmail-triage",
    schema_version: "tool_card.v1",
    name: "Gmail Triage Skill",
    type: "skill",
    summary: "Guides an agent to summarize Gmail threads and extract action items with explicit authorization.",
    source_urls: ["internal://manual-review/gmail-triage"],
    primary_purpose: "email_task_summary",
    use_cases: ["summarize Gmail tasks", "triage inbox", "draft email follow-ups"],
    not_for: ["accessing mail without user approval", "processing highly sensitive mail without scope limits"],
    tags: ["communication", "email", "workflow"],
    supported_agents: ["codex"],
    install_methods: [{ method: "manual", command: "", docs_url: "internal://manual-review/gmail-triage", confidence: "medium" }],
    auth_required: "oauth",
    permissions: [{ scope: "email", access: "read", required: true, notes: "Reads email content and metadata." }],
    maintenance: {
      status: "active",
      issue_activity: "limited",
      maintainer_type: "official",
      signals: ["reviewed_skill"]
    },
    security: {
      risk_level: "high",
      trust_level: "well_known_org",
      known_risks: ["email_privacy", "prompt_injection"],
      requires_human_approval: true,
      security_notes: "Email content is sensitive; require explicit user approval and scope limits."
    },
    maturity: "stable",
    evidence_refs: ["manual-review-gmail-skill"],
    last_checked_at: now,
    confidence: "medium",
    created_at: now,
    updated_at: now
  },
  {
    id: "skill-stripe-checkout-guidance",
    schema_version: "tool_card.v1",
    name: "Stripe Checkout Guidance Skill",
    type: "skill",
    summary: "Guides agents through Stripe Checkout integration using official docs and test-mode defaults.",
    source_urls: ["https://docs.stripe.com/checkout", "https://docs.stripe.com/testing"],
    docs_url: "https://docs.stripe.com/checkout",
    primary_purpose: "payment_integration_guidance",
    use_cases: ["integrate Stripe Checkout", "plan Next.js payment work", "identify payment secret risks"],
    not_for: ["processing live refunds autonomously", "handling production payment operations without approval"],
    tags: ["payment", "web_app", "coding", "secrets"],
    supported_agents: ["codex", "generic-cli-agent"],
    install_methods: [{ method: "manual", command: "", docs_url: "https://docs.stripe.com/checkout", confidence: "high" }],
    auth_required: "api_key",
    permissions: [
      { scope: "network", access: "read_write", required: true, notes: "Uses Stripe API over the network." },
      { scope: "secrets", access: "read", required: true, notes: "Requires API keys; prefer test mode." },
      { scope: "payment", access: "write", required: true, notes: "Can affect payment flows if used with live keys." }
    ],
    maintenance: {
      status: "active",
      issue_activity: "active",
      maintainer_type: "official",
      signals: ["official_docs", "test_mode_docs"]
    },
    security: {
      risk_level: "critical",
      trust_level: "official",
      known_risks: ["payment", "secrets"],
      requires_human_approval: true,
      security_notes: "Use test keys first; live payment actions require human approval."
    },
    maturity: "stable",
    evidence_refs: ["manual-review-stripe-docs"],
    last_checked_at: now,
    confidence: "high",
    created_at: now,
    updated_at: now
  },
  {
    id: "agent-codex",
    schema_version: "tool_card.v1",
    name: "Codex",
    type: "agent",
    summary: "A coding agent that can inspect a workspace, edit files, run tests, and explain changes.",
    source_urls: ["https://developers.openai.com/codex"],
    docs_url: "https://developers.openai.com/codex",
    primary_purpose: "coding_agent",
    use_cases: ["modify code", "run test suites", "prepare implementation plans", "review diffs"],
    not_for: ["executing unapproved destructive commands", "handling secrets without explicit approval"],
    tags: ["coding", "testing", "agent", "workflow"],
    supported_agents: ["codex"],
    install_methods: [{ method: "hosted", command: "", docs_url: "https://developers.openai.com/codex", confidence: "high" }],
    auth_required: "account",
    permissions: [
      { scope: "filesystem", access: "read_write", required: true, notes: "Works in the user's workspace." },
      { scope: "shell", access: "execute", required: false, notes: "Can run commands when permitted by policy." }
    ],
    maintenance: {
      status: "active",
      issue_activity: "active",
      maintainer_type: "official",
      signals: ["official_product", "actively_maintained"]
    },
    security: {
      risk_level: "high",
      trust_level: "official",
      known_risks: ["filesystem_write", "shell_execution"],
      requires_human_approval: true,
      security_notes: "Review diffs and require approval for high-risk shell or secret access."
    },
    maturity: "stable",
    evidence_refs: ["manual-review-codex"],
    last_checked_at: now,
    confidence: "high",
    created_at: now,
    updated_at: now
  }
];
