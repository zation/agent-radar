import type { SourceDefinition } from "../schema.js";
import { isSupportedSourceParser } from "./parser.js";
import { curatedGithubSources } from "./curated-github-sources.js";

export const sourceRegistry: SourceDefinition[] = [
  {
    id: "github-topic-mcp",
    name: "GitHub topic mcp",
    url: "https://github.com/topics/mcp",
    source_type: "github",
    covered_tool_types: ["mcp", "cli", "framework"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "active_open_source",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub Search API only; results enter auto review and promotion gates before reliable release.",
    access_review: {
      robots_txt: "reviewed",
      terms: "reviewed",
      reviewed_by: "agent-radar",
      reviewed_at: "2026-07-08T00:00:00Z",
      notes: "Enabled for controlled public metadata discovery; no Authorization header, cookies, private repositories, or bypassed surfaces."
    },
    parser: "github_topic_parser",
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "npm-modelcontextprotocol-sdk",
    name: "npm @modelcontextprotocol/sdk",
    url: "https://registry.npmjs.org/@modelcontextprotocol/sdk",
    source_type: "package_registry",
    covered_tool_types: ["mcp", "framework", "cli"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "active_open_source",
    field_coverage: ["name", "description", "repo_url", "homepage_url", "package_url", "license", "latest_version", "last_release_at"],
    rate_limits: "npm registry public API rate limits",
    terms_notes: "Public npm registry package metadata only; package evidence enters normalizer, deduper, and promotion gates before release.",
    access_review: {
      robots_txt: "reviewed",
      terms: "reviewed",
      reviewed_by: "agent-radar",
      reviewed_at: "2026-07-08T00:00:00Z",
      notes: "Enabled for controlled public package metadata discovery; no Authorization header, cookies, private package scopes, or install execution."
    },
    parser: "npm_package_parser",
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-microsoft-playwright-mcp",
    name: "GitHub repository microsoft/playwright-mcp",
    url: "https://github.com/microsoft/playwright-mcp",
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "well_known_org",
    field_coverage: ["name", "description", "repo_url", "homepage_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; source profile constrains domain mapping before release gates.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private data or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "mcp-browser-automation",
      name: "Playwright MCP",
      type: "mcp",
      tags: ["browser_automation", "testing", "playwright", "web"],
      primary_purpose: "browser_automation_testing",
      use_cases: ["Open local or remote web pages, inspect rendered state, and capture screenshots for UI verification."],
      not_for: ["Unattended browsing of private user sessions or production accounts."],
      permissions: [
        { scope: "browser", access: "execute", required: true, notes: "Controls a browser session." },
        { scope: "network", access: "read_write", required: true, notes: "Loads web pages, local previews, and related assets." }
      ],
      security: {
        risk_level: "medium",
        trust_level: "well_known_org",
        known_risks: ["browser_session_access", "web_request_execution"],
        requires_human_approval: false,
        security_notes: "Use an isolated browser profile when pages contain sensitive data."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-google-gemini-cli",
    name: "GitHub repository google-gemini/gemini-cli",
    url: "https://github.com/google-gemini/gemini-cli",
    source_type: "github",
    covered_tool_types: ["cli", "agent"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "well_known_org",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; source profile maps CLI coding-agent permissions.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private data or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "cli-gemini-cli",
      name: "Gemini CLI",
      type: "cli",
      secondary_types: ["agent"],
      tags: ["coding", "testing", "cli", "typescript", "terminal"],
      primary_purpose: "terminal_coding_agent",
      use_cases: ["Modify code in a local project and run tests from a terminal workflow."],
      not_for: ["Unreviewed autonomous changes in sensitive repositories."],
      permissions: [
        { scope: "filesystem", access: "read_write", required: true, notes: "Reads and edits workspace files." },
        { scope: "shell", access: "execute", required: true, notes: "Runs project commands and tests." },
        { scope: "secrets", access: "read", required: false, notes: "May rely on provider credentials configured in the environment." }
      ],
      security: {
        risk_level: "high",
        trust_level: "well_known_org",
        known_risks: ["filesystem_write", "shell_execution"],
        requires_human_approval: true,
        security_notes: "Review file changes and command intent before accepting results."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-vercel-ai",
    name: "GitHub repository vercel/ai",
    url: "https://github.com/vercel/ai",
    source_type: "github",
    covered_tool_types: ["framework"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "well_known_org",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; source profile maps framework capabilities.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private data or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "framework-vercel-ai-sdk",
      name: "Vercel AI SDK",
      type: "framework",
      tags: ["framework", "typescript", "nextjs", "ai_sdk", "streaming", "tool_calling"],
      primary_purpose: "typescript_agent_app_framework",
      use_cases: ["Build TypeScript or Next.js AI applications with tool calls and streaming output."],
      not_for: ["Using provider API keys without secret management review."],
      auth_required: "api_key",
      permissions: [
        { scope: "network", access: "read_write", required: true, notes: "Calls model providers and application endpoints." },
        { scope: "secrets", access: "read", required: true, notes: "Uses model provider API keys." }
      ],
      security: {
        risk_level: "high",
        trust_level: "well_known_org",
        known_risks: ["provider_secret_handling", "tool_execution_surface"],
        requires_human_approval: true,
        security_notes: "Keep provider keys server-side and review tool execution boundaries."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-github-github-mcp-server",
    name: "GitHub repository github/github-mcp-server",
    url: "https://github.com/github/github-mcp-server",
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "official",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; profile marks GitHub cloud resource permissions.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private repositories or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "mcp-github-server",
      name: "GitHub MCP Server",
      type: "mcp",
      tags: ["github", "mcp", "pull_requests", "issues", "code_review"],
      primary_purpose: "github_repository_context",
      use_cases: ["Read GitHub pull requests and issues, summarize repository context, and prepare review notes."],
      not_for: ["Posting comments or mutating repositories without explicit confirmation."],
      auth_required: "oauth",
      permissions: [
        { scope: "cloud", access: "read_write", required: true, notes: "Accesses GitHub-hosted repositories, PRs, issues, and comments." },
        { scope: "secrets", access: "read", required: true, notes: "Uses GitHub tokens or OAuth credentials." }
      ],
      security: {
        risk_level: "high",
        trust_level: "official",
        known_risks: ["repository_access", "cloud_write_scope"],
        requires_human_approval: true,
        security_notes: "Prefer read-only GitHub scopes when summarizing; require approval before posting."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-neondatabase-mcp-server-neon",
    name: "GitHub repository neondatabase/mcp-server-neon",
    url: "https://github.com/neondatabase/mcp-server-neon",
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "well_known_org",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; profile marks database and cloud permissions.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private data or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "mcp-neon-postgres",
      name: "Neon Postgres MCP Server",
      type: "mcp",
      tags: ["database", "postgres", "cloud", "mcp"],
      primary_purpose: "postgres_database_operations",
      use_cases: ["Inspect and manage Postgres database context through an MCP server."],
      not_for: ["Direct production schema or data changes without human approval and backup planning."],
      auth_required: "api_key",
      permissions: [
        { scope: "database", access: "admin", required: true, notes: "Can inspect or modify Postgres database resources depending on token scope." },
        { scope: "cloud", access: "admin", required: true, notes: "Uses Neon cloud project credentials." },
        { scope: "secrets", access: "read", required: true, notes: "Requires database or cloud API credentials." }
      ],
      security: {
        risk_level: "critical",
        trust_level: "well_known_org",
        known_risks: ["production_database_change", "cloud_admin_scope"],
        requires_human_approval: true,
        security_notes: "Use read-only credentials where possible; production schema changes need explicit approval."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "github-repo-getsentry-sentry-mcp",
    name: "GitHub repository getsentry/sentry-mcp",
    url: "https://github.com/getsentry/sentry-mcp",
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: "well_known_org",
    field_coverage: ["name", "description", "repo_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub API rate limits",
    terms_notes: "Public GitHub repository metadata only; profile maps monitoring/debugging use.",
    access_review: reviewedPublicAccess("Public GitHub API metadata for an exact repository; no private data or Authorization header."),
    parser: "github_repo_parser",
    profile: {
      tool_id: "mcp-sentry-monitoring",
      name: "Sentry MCP",
      type: "mcp",
      tags: ["monitoring", "debugging", "production", "errors", "cloud"],
      primary_purpose: "production_error_debugging_context",
      use_cases: ["Read production error monitoring context and summarize likely crash causes."],
      not_for: ["Changing production configuration or exposing user data from error payloads."],
      auth_required: "api_key",
      permissions: [
        { scope: "cloud", access: "read", required: true, notes: "Reads hosted monitoring events and project context." },
        { scope: "secrets", access: "read", required: true, notes: "Uses monitoring API credentials." }
      ],
      security: {
        risk_level: "high",
        trust_level: "well_known_org",
        known_risks: ["production_telemetry_access", "possible_sensitive_error_payloads"],
        requires_human_approval: true,
        security_notes: "Limit access to the needed project and avoid sharing raw sensitive event data."
      },
      maturity: "stable"
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "docs-stripe-checkout",
    name: "Stripe Checkout documentation",
    url: "https://docs.stripe.com/checkout",
    source_type: "official_docs",
    covered_tool_types: ["skill"],
    collection_method: "http",
    recommended_frequency: "weekly",
    trust_level: "official",
    field_coverage: ["name", "description", "docs_url", "profile"],
    rate_limits: "Public docs site; crawl one fixed page weekly",
    terms_notes: "Public official documentation metadata only; profile marks payment and secret handling.",
    access_review: reviewedPublicAccess("Public official docs page; no login, cookies, or authenticated crawl."),
    parser: "official_docs_parser",
    profile: {
      tool_id: "skill-stripe-checkout-guidance",
      name: "Stripe Checkout Guidance",
      type: "skill",
      tags: ["payment", "checkout", "nextjs", "web_app"],
      primary_purpose: "payment_checkout_integration_guidance",
      use_cases: ["Integrate Stripe Checkout into a web application with payment and secret handling."],
      not_for: ["Automatically issuing refunds or changing live payment state without human approval."],
      auth_required: "api_key",
      permissions: [
        { scope: "payment", access: "write", required: true, notes: "Creates payment sessions or changes payment state." },
        { scope: "network", access: "read_write", required: true, notes: "Calls Stripe APIs." },
        { scope: "secrets", access: "read", required: true, notes: "Uses Stripe API keys." }
      ],
      security: {
        risk_level: "high",
        trust_level: "official",
        known_risks: ["payment_state_change", "secret_handling"],
        requires_human_approval: true,
        security_notes: "Use test mode first and require human approval for live payment configuration."
      },
      maturity: "stable",
      docs_url: "https://docs.stripe.com/checkout",
      homepage_url: "https://stripe.com",
      maintenance: { status: "active", issue_activity: "unknown", maintainer_type: "official", signals: ["official_docs"] }
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "docs-gmail-api",
    name: "Gmail API documentation",
    url: "https://developers.google.com/gmail/api/guides",
    source_type: "official_docs",
    covered_tool_types: ["skill"],
    collection_method: "http",
    recommended_frequency: "weekly",
    trust_level: "official",
    field_coverage: ["name", "description", "docs_url", "profile"],
    rate_limits: "Public docs site; crawl one fixed page weekly",
    terms_notes: "Public official documentation metadata only; profile marks email OAuth permissions.",
    access_review: reviewedPublicAccess("Public official docs page; no login, cookies, or authenticated crawl."),
    parser: "official_docs_parser",
    profile: {
      tool_id: "skill-gmail-task-summary",
      name: "Gmail Task Summary Guidance",
      type: "skill",
      tags: ["communication", "email", "gmail", "task_summary"],
      primary_purpose: "email_task_summarization_guidance",
      use_cases: ["Read Gmail messages with user-approved scopes and summarize follow-up tasks."],
      not_for: ["Reading private mailboxes without explicit OAuth consent and scope review."],
      auth_required: "oauth",
      permissions: [
        { scope: "email", access: "read", required: true, notes: "Reads Gmail message metadata or content." },
        { scope: "secrets", access: "read", required: true, notes: "Uses OAuth tokens." }
      ],
      security: {
        risk_level: "high",
        trust_level: "official",
        known_risks: ["personal_email_access", "oauth_token_handling"],
        requires_human_approval: true,
        security_notes: "Use minimal read-only scopes and require user confirmation before accessing mail."
      },
      maturity: "stable",
      docs_url: "https://developers.google.com/gmail/api/guides",
      homepage_url: "https://developers.google.com/gmail/api",
      maintenance: { status: "active", issue_activity: "unknown", maintainer_type: "official", signals: ["official_docs"] }
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  {
    id: "docs-openai-codex",
    name: "OpenAI Codex documentation",
    url: "https://developers.openai.com/codex",
    source_type: "official_docs",
    covered_tool_types: ["agent", "cli"],
    collection_method: "http",
    recommended_frequency: "weekly",
    trust_level: "official",
    field_coverage: ["name", "description", "docs_url", "profile"],
    rate_limits: "Public docs site; crawl one fixed page weekly",
    terms_notes: "Public official documentation metadata only; profile maps coding-agent workflow capabilities.",
    access_review: reviewedPublicAccess("Public official docs page; no login, cookies, or authenticated crawl."),
    parser: "official_docs_parser",
    profile: {
      tool_id: "agent-codex",
      name: "Codex",
      type: "agent",
      secondary_types: ["cli"],
      tags: ["coding", "testing", "agent", "code_review"],
      primary_purpose: "coding_agent_workflow",
      use_cases: ["Modify projects, run tests, and reason about implementation tasks with a coding agent."],
      not_for: ["Unreviewed autonomous changes to sensitive code or secrets."],
      auth_required: "account",
      permissions: [
        { scope: "filesystem", access: "read_write", required: true, notes: "Reads and edits workspace files." },
        { scope: "shell", access: "execute", required: true, notes: "Runs tests, builds, and project commands." },
        { scope: "secrets", access: "read", required: false, notes: "May need provider or deployment secrets depending on task." }
      ],
      security: {
        risk_level: "high",
        trust_level: "official",
        known_risks: ["filesystem_write", "shell_execution"],
        requires_human_approval: true,
        security_notes: "Review diffs and command effects before accepting changes."
      },
      maturity: "stable",
      docs_url: "https://developers.openai.com/codex",
      homepage_url: "https://openai.com/codex",
      maintenance: { status: "active", issue_activity: "unknown", maintainer_type: "official", signals: ["official_docs"] }
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-08T00:00:00Z"
  },
  ...curatedGithubSources
];

function reviewedPublicAccess(notes: string): NonNullable<SourceDefinition["access_review"]> {
  return {
    robots_txt: "reviewed",
    terms: "reviewed",
    reviewed_by: "agent-radar",
    reviewed_at: "2026-07-08T00:00:00Z",
    notes
  };
}

export function getEnabledSources(sources: SourceDefinition[]): SourceDefinition[] {
  return sources.filter((source) => source.enabled);
}

export interface SourceRegistryValidation {
  passed: boolean;
  errors: string[];
}

export interface SourceRegistryArtifact {
  schema_version: "source_registry.v1";
  generated_at: string;
  validation: SourceRegistryValidation;
  sources: SourceDefinition[];
}

export interface SourceRegistryDiff {
  schema_version: "source_registry_diff.v1";
  generated_at: string;
  summary: {
    added: number;
    removed: number;
    changed: number;
  };
  added: SourceDefinition[];
  removed: SourceDefinition[];
  changed: Array<{
    id: string;
    before: SourceDefinition;
    after: SourceDefinition;
    changed_fields: string[];
    review_requirements: SourceRegistryReviewRequirement[];
  }>;
}

export interface SourceRegistryReviewRequirement {
  field: string;
  reason: string;
  confirmation_required: boolean;
}

export function buildSourceRegistryArtifact(sources: SourceDefinition[], generatedAt: string): SourceRegistryArtifact {
  const errors = validateSourceRegistry(sources);

  return {
    schema_version: "source_registry.v1",
    generated_at: generatedAt,
    validation: {
      passed: errors.length === 0,
      errors
    },
    sources
  };
}

export function buildSourceRegistryDiff(previousSources: SourceDefinition[], currentSources: SourceDefinition[], generatedAt: string): SourceRegistryDiff {
  const previousById = new Map(previousSources.map((source) => [source.id, source]));
  const currentById = new Map(currentSources.map((source) => [source.id, source]));

  const added = currentSources.filter((source) => !previousById.has(source.id));
  const removed = previousSources.filter((source) => !currentById.has(source.id));
  const changed = currentSources
    .flatMap((after) => {
      const before = previousById.get(after.id);
      if (!before) return [];
      const changedFields = diffSourceFields(before, after);
      return changedFields.length > 0
        ? [{ id: after.id, before, after, changed_fields: changedFields, review_requirements: buildSourceReviewRequirements(changedFields) }]
        : [];
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  return {
    schema_version: "source_registry_diff.v1",
    generated_at: generatedAt,
    summary: {
      added: added.length,
      removed: removed.length,
      changed: changed.length
    },
    added: [...added].sort((a, b) => a.id.localeCompare(b.id)),
    removed: [...removed].sort((a, b) => a.id.localeCompare(b.id)),
    changed
  };
}

export function validateSourceRegistry(sources: SourceDefinition[]): string[] {
  const errors: string[] = [];
  const seenIds = new Set<string>();

  for (const source of sources) {
    if (seenIds.has(source.id)) errors.push(`${source.id}: duplicate source id`);
    seenIds.add(source.id);

    if (!source.id.trim()) errors.push("source id is required");
    if (!source.name.trim()) errors.push(`${source.id}: name is required`);
    if (!source.url.trim()) errors.push(`${source.id}: url is required`);
    if (source.covered_tool_types.length === 0) errors.push(`${source.id}: covered_tool_types is required`);
    if (source.field_coverage.length === 0) errors.push(`${source.id}: field_coverage is required`);
    if (!source.terms_notes.trim()) errors.push(`${source.id}: terms_notes is required`);
    if (!source.failure_policy.trim()) errors.push(`${source.id}: failure_policy is required`);
    if (!isIsoUtc(source.last_reviewed_at)) errors.push(`${source.id}: last_reviewed_at must be ISO 8601 UTC`);

    if (source.enabled && !source.parser?.trim()) {
      errors.push(`${source.id}: enabled source requires parser`);
    }
    if (source.enabled && !source.owner?.trim()) {
      errors.push(`${source.id}: enabled source requires owner`);
    }
    if (source.enabled) {
      errors.push(...validateAccessReview(source));
    }
    if (source.enabled && source.parser?.trim() && !isSupportedSourceParser(source.parser)) {
      errors.push(`${source.id}: parser ${source.parser} is not implemented`);
    }
  }

  return errors;
}

function diffSourceFields(before: SourceDefinition, after: SourceDefinition): string[] {
  const fields = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...fields].filter((field) => JSON.stringify(before[field as keyof SourceDefinition]) !== JSON.stringify(after[field as keyof SourceDefinition])).sort();
}

function buildSourceReviewRequirements(changedFields: string[]): SourceRegistryReviewRequirement[] {
  return changedFields.flatMap((field) => {
    const reason = sourceReviewReasonByField[field];
    return reason ? [{ field, reason, confirmation_required: true }] : [];
  });
}

const sourceReviewReasonByField: Record<string, string> = {
  access_review: "Access review changes affect robots, terms, and source safety assumptions.",
  collection_method: "Collection method changes can alter network access, rate limits, and parser assumptions.",
  enabled: "Source enablement changes crawl scope and require maintainer confirmation.",
  field_coverage: "Field coverage changes affect draft completeness and provenance expectations.",
  parser: "Parser changes affect how raw snapshots become Source Records and Tool Card drafts.",
  profile: "Source profile changes affect domain tags, permission mapping, safety notes, and downstream recommendation behavior.",
  rate_limits: "Rate limit changes affect crawler safety and source terms compliance.",
  recommended_frequency: "Frequency changes affect crawler load and source terms compliance.",
  source_type: "Source type changes affect trust and parser expectations.",
  terms_notes: "Terms notes changes affect allowed collection boundaries.",
  trust_level: "Trust level changes can affect confidence and downstream recommendation context.",
  url: "Source URL changes alter the collection surface and require access review."
};

function validateAccessReview(source: SourceDefinition): string[] {
  const errors: string[] = [];
  const review = source.access_review;

  if (!review) {
    return [`${source.id}: enabled source requires robots review`, `${source.id}: enabled source requires terms review`];
  }
  if (review.robots_txt !== "reviewed" && review.robots_txt !== "not_applicable") errors.push(`${source.id}: enabled source requires robots review`);
  if (review.terms !== "reviewed" && review.terms !== "not_applicable") errors.push(`${source.id}: enabled source requires terms review`);
  if (!review.reviewed_by.trim()) errors.push(`${source.id}: access review requires reviewer`);
  if (!isIsoUtc(review.reviewed_at)) errors.push(`${source.id}: access review reviewed_at must be ISO 8601 UTC`);
  if (!review.notes.trim()) errors.push(`${source.id}: access review notes are required`);

  return errors;
}

function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}
