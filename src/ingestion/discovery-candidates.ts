import type { Confidence, SourceRecord } from "../schema.js";

export interface ToolDiscoveryCandidate {
  source_record_id: string;
  source_id: string;
  name: string;
  description?: string;
  repo_url?: string;
  stars?: number;
  license?: string;
  last_commit_at?: string;
  topics: string[];
  source_confidence: Confidence;
  review_status: "pending_production_gate";
  recommended_action: "review_in_production_gate";
}

export interface ToolDiscoveryCandidates {
  schema_version: "tool_discovery_candidates.v2";
  generated_at: string;
  summary: {
    candidates: number;
    pending_production_gate: number;
    by_source: Record<string, number>;
  };
  items: ToolDiscoveryCandidate[];
}

export function buildToolDiscoveryCandidates(sourceRecords: SourceRecord[], generatedAt: string): ToolDiscoveryCandidates {
  const items = sourceRecords
    .filter((record) => record.record_type === "repository")
    .map((record) => {
      const repoUrl = readString(record.parsed_fields.repo_url);
      return {
        source_record_id: record.id,
        source_id: record.source_id,
        name: record.name,
        description: record.description,
        repo_url: repoUrl,
        stars: readNumber(record.parsed_fields.stars),
        license: readString(record.parsed_fields.license),
        last_commit_at: readString(record.parsed_fields.last_commit_at),
        topics: readStringArray(record.parsed_fields.topics),
        source_confidence: record.source_confidence,
        review_status: "pending_production_gate" as const,
        recommended_action: "review_in_production_gate" as const
      };
    });

  return {
    schema_version: "tool_discovery_candidates.v2",
    generated_at: generatedAt,
    summary: {
      candidates: items.length,
      pending_production_gate: items.length,
      by_source: items.reduce<Record<string, number>>((summary, item) => {
        summary[item.source_id] = (summary[item.source_id] ?? 0) + 1;
        return summary;
      }, {})
    },
    items
  };
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}
