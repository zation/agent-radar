import type { SourceDefinition } from "../schema.js";
import { isSupportedSourceParser } from "./parser.js";

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
    access_review: {
      robots_txt: "not_applicable",
      terms: "reviewed",
      reviewed_by: "agent-radar",
      reviewed_at: "2026-07-07T00:00:00Z",
      notes: "Internal manual source; source URLs on Tool Cards remain the public evidence boundary."
    },
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
    access_review: {
      robots_txt: "reviewed",
      terms: "reviewed",
      reviewed_by: "agent-radar",
      reviewed_at: "2026-07-07T00:00:00Z",
      notes: "Disabled discovery source; use public GitHub topic/API surfaces only after noise review."
    },
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
