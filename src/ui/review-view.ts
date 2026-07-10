import type { SourceRegistryReviewRequests } from "../ingestion/source-review.js";

export interface SourceReviewRow {
  id: string;
  sourceId: string;
  field: string;
  reason: string;
  priority: "confirmation required" | "review requested";
  suggestedAction: string;
}

export function createSourceReviewRows(requests: SourceRegistryReviewRequests): SourceReviewRow[] {
  return requests.items.map((item) => ({
    id: `${item.source_id}:${item.field}`,
    sourceId: item.source_id,
    field: item.field,
    reason: item.reason,
    priority: item.confirmation_required ? "confirmation required" : "review requested",
    suggestedAction: item.suggested_action
  }));
}
