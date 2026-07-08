import type { SourceRegistryReviewRequests } from "../ingestion/source-review.js";

export interface SourceReviewRow {
  id: string;
  sourceId: string;
  field: string;
  reason: string;
  priority: "confirmation required" | "review requested";
  decisionOptions: string;
  requiredFields: string;
}

export function createSourceReviewRows(requests: SourceRegistryReviewRequests): SourceReviewRow[] {
  return requests.items.map((item) => ({
    id: item.review_record_template.id,
    sourceId: item.source_id,
    field: item.field,
    reason: item.reason,
    priority: item.confirmation_required ? "confirmation required" : "review requested",
    decisionOptions: item.decision_options.join(", "),
    requiredFields: item.review_record_template.required_fields.join(", ")
  }));
}
