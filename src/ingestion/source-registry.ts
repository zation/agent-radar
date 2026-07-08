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
  }

  return errors;
}

function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value);
}
