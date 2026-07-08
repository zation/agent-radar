export interface IngestionCliSummaryInput {
  snapshots: Array<{ source_id: string }>;
  sourceRecords: unknown[];
  discoveryCandidates: {
    summary: {
      candidates: number;
      pending_manual_review: number;
    };
  };
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
  autoReview: {
    summary: {
      promote: number;
      keep_draft: number;
      needs_review: number;
      reject: number;
      retire: number;
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
  promotionPlan: {
    summary: {
      candidates: number;
      reliable_publish_ready: boolean;
    };
  };
  promotionCheck: {
    passed: boolean;
    summary: {
      ready_for_publish: number;
      blocked: number;
      validation_errors: number;
      validation_warnings: number;
    };
  };
}

export interface IngestionCliSummary {
  snapshots: number;
  source_records: number;
  source_ids: string[];
  discovery_candidates: {
    candidates: number;
    pending_manual_review: number;
  };
  approval_requests: {
    pending_approval: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  field_value_provenance: {
    tool_cards: number;
    field_values: number;
  };
  auto_review: {
    promote: number;
    keep_draft: number;
    needs_review: number;
    reject: number;
    retire: number;
  };
  release_admission: {
    eligible_for_publish: number;
    blocked: number;
  };
  promotion_candidates: number;
  promotion_plan: {
    candidates: number;
    reliable_publish_ready: boolean;
  };
  promotion_check: {
    passed: boolean;
    ready_for_publish: number;
    blocked: number;
    validation_errors: number;
    validation_warnings: number;
  };
}

export function formatIngestionCliSummary(result: IngestionCliSummaryInput): IngestionCliSummary {
  return {
    snapshots: result.snapshots.length,
    source_records: result.sourceRecords.length,
    source_ids: [...new Set(result.snapshots.map((snapshot) => snapshot.source_id))],
    discovery_candidates: {
      candidates: result.discoveryCandidates.summary.candidates,
      pending_manual_review: result.discoveryCandidates.summary.pending_manual_review
    },
    approval_requests: {
      pending_approval: result.approvalRequests.summary.pending_approval,
      duplicate_review_required: result.approvalRequests.summary.duplicate_review_required,
      blocked_validation: result.approvalRequests.summary.blocked_validation
    },
    field_value_provenance: {
      tool_cards: result.fieldProvenance.summary.tool_cards,
      field_values: result.fieldProvenance.summary.field_values
    },
    auto_review: {
      promote: result.autoReview.summary.promote,
      keep_draft: result.autoReview.summary.keep_draft,
      needs_review: result.autoReview.summary.needs_review,
      reject: result.autoReview.summary.reject,
      retire: result.autoReview.summary.retire
    },
    release_admission: {
      eligible_for_publish: result.releaseAdmission.summary.eligible_for_publish,
      blocked: result.releaseAdmission.summary.blocked
    },
    promotion_candidates: result.promotionCandidates.summary.candidates,
    promotion_plan: {
      candidates: result.promotionPlan.summary.candidates,
      reliable_publish_ready: result.promotionPlan.summary.reliable_publish_ready
    },
    promotion_check: {
      passed: result.promotionCheck.passed,
      ready_for_publish: result.promotionCheck.summary.ready_for_publish,
      blocked: result.promotionCheck.summary.blocked,
      validation_errors: result.promotionCheck.summary.validation_errors,
      validation_warnings: result.promotionCheck.summary.validation_warnings
    }
  };
}
