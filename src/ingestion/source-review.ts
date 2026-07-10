import type { SourceRegistryDiff } from "./source-registry.js";

export type SourceRegistryReviewStatus = "pending";

export interface SourceRegistryReviewItem {
  source_id: string;
  field: string;
  reason: string;
  confirmation_required: boolean;
  status: SourceRegistryReviewStatus;
}

export interface SourceRegistryReviewArtifact {
  schema_version: "source_registry_review.v1";
  generated_at: string;
  summary: {
    total_requirements: number;
    confirmed: number;
    rejected: number;
    needs_changes: number;
    pending: number;
  };
  items: SourceRegistryReviewItem[];
}

export interface SourceRegistryReviewRequestItem {
  source_id: string;
  field: string;
  reason: string;
  confirmation_required: boolean;
  suggested_action: "review_in_production_gate" | "covered_by_release_summary";
}

export interface SourceRegistryReviewRequests {
  schema_version: "source_registry_review_requests.v1";
  generated_at: string;
  summary: {
    pending_review: number;
    confirmation_required: number;
  };
  items: SourceRegistryReviewRequestItem[];
}

export function buildSourceRegistryReviewArtifact(
  diff: SourceRegistryDiff,
  generatedAt: string
): SourceRegistryReviewArtifact {
  const items: SourceRegistryReviewItem[] = diff.changed.flatMap((source) =>
    source.review_requirements.map((requirement) => {
      return {
        source_id: source.id,
        field: requirement.field,
        reason: requirement.reason,
        confirmation_required: requirement.confirmation_required,
        status: "pending"
      };
    })
  );

  return {
    schema_version: "source_registry_review.v1",
    generated_at: generatedAt,
    summary: {
      total_requirements: items.length,
      confirmed: 0,
      rejected: 0,
      needs_changes: 0,
      pending: items.filter((item) => item.status === "pending").length
    },
    items
  };
}

export function buildSourceRegistryReviewRequests(review: SourceRegistryReviewArtifact, generatedAt: string): SourceRegistryReviewRequests {
  const items: SourceRegistryReviewRequestItem[] = review.items
    .filter((item) => item.status === "pending")
    .map((item) => ({
      source_id: item.source_id,
      field: item.field,
      reason: item.reason,
      confirmation_required: item.confirmation_required,
      suggested_action: item.confirmation_required ? "review_in_production_gate" : "covered_by_release_summary"
    }));

  return {
    schema_version: "source_registry_review_requests.v1",
    generated_at: generatedAt,
    summary: {
      pending_review: items.length,
      confirmation_required: items.filter((item) => item.confirmation_required).length
    },
    items
  };
}
