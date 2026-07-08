export interface IngestionCliSummaryInput {
  snapshots: Array<{ source_id: string }>;
  sourceRecords: unknown[];
  approvalRequests: {
    summary: {
      pending_approval: number;
      duplicate_review_required: number;
      blocked_validation: number;
    };
  };
  fieldProvenance: {
    summary: {
      tool_cards: number;
      field_values: number;
    };
  };
  releaseAdmission: {
    summary: {
      eligible_for_publish: number;
      blocked: number;
    };
  };
  promotionCandidates: {
    summary: {
      candidates: number;
    };
  };
}

export interface IngestionCliSummary {
  snapshots: number;
  source_records: number;
  source_ids: string[];
  approval_requests: {
    pending_approval: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  field_value_provenance: {
    tool_cards: number;
    field_values: number;
  };
  release_admission: {
    eligible_for_publish: number;
    blocked: number;
  };
  promotion_candidates: number;
}

export function formatIngestionCliSummary(result: IngestionCliSummaryInput): IngestionCliSummary {
  return {
    snapshots: result.snapshots.length,
    source_records: result.sourceRecords.length,
    source_ids: [...new Set(result.snapshots.map((snapshot) => snapshot.source_id))],
    approval_requests: {
      pending_approval: result.approvalRequests.summary.pending_approval,
      duplicate_review_required: result.approvalRequests.summary.duplicate_review_required,
      blocked_validation: result.approvalRequests.summary.blocked_validation
    },
    field_value_provenance: {
      tool_cards: result.fieldProvenance.summary.tool_cards,
      field_values: result.fieldProvenance.summary.field_values
    },
    release_admission: {
      eligible_for_publish: result.releaseAdmission.summary.eligible_for_publish,
      blocked: result.releaseAdmission.summary.blocked
    },
    promotion_candidates: result.promotionCandidates.summary.candidates
  };
}
