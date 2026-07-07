import type { SourceDefinition } from "../schema.js";

export const sourceRegistry: SourceDefinition[] = [
  {
    id: "manual-agent-radar-seed",
    name: "Agent Radar manually reviewed seed tools",
    url: "internal://manual-review/seed-tool-cards",
    source_type: "manual",
    covered_tool_types: ["skill", "mcp", "agent"],
    collection_method: "manual",
    recommended_frequency: "manual",
    trust_level: "official",
    field_coverage: ["name", "type", "source_urls", "use_cases", "not_for", "permissions", "security", "confidence"],
    rate_limits: "local manual source",
    terms_notes: "Uses project-maintained seed data with explicit source URLs on each Tool Card.",
    parser: "manual_seed_parser",
    failure_policy: "failure blocks only ingestion draft generation; published MVP seed artifacts remain unchanged",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-07T00:00:00Z"
  },
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
    terms_notes: "Public API only; disabled for MVP to avoid noisy community discovery.",
    parser: "github_topic_parser",
    failure_policy: "skip this source and preserve previous stable data",
    enabled: false,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-07T00:00:00Z"
  }
];

export function getEnabledSources(sources: SourceDefinition[]): SourceDefinition[] {
  return sources.filter((source) => source.enabled);
}
