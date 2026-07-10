import type { RunIngestionResult } from "../ingestion/run.js";

export interface SourceRegistryReviewRequirementSummary {
  source_id: string;
  field: string;
  reason: string;
  confirmation_required: boolean;
}

export interface SourceRegistryReviewRequestSummary {
  source_id: string;
  field: string;
  suggested_action: string;
}

export function renderIngestionReviewMarkdown(
  result: RunIngestionResult,
  sourceRegistryReviewRequirements: SourceRegistryReviewRequirementSummary[] = [],
  sourceRegistryReviewRequests: SourceRegistryReviewRequestSummary[] = []
): string {
  const lines = [
    "# Ingestion Review",
    "",
    "## Summary",
    `- Snapshots: ${result.snapshots.length}`,
    `- Source records: ${result.sourceRecords.length}`,
    `- Tool card drafts: ${result.toolCardDrafts.length}`,
    `- Review ready: ${result.reviewQueue.summary.ready_for_review}`,
    `- Review blocked: ${result.reviewQueue.summary.blocked_validation}`,
    `- Discovery candidates: ${result.discoveryCandidates.summary.pending_production_gate} pending production gate review`,
    `- Crawl audit: ${result.crawlAudit.summary.success} success, ${result.crawlAudit.summary.partial} partial, ${result.crawlAudit.summary.failed} failed`,
    `- Approval overrides: ${result.approvalArtifact.summary.approved} approved, ${result.approvalArtifact.summary.rejected} rejected, ${result.approvalArtifact.summary.needs_changes} needs changes`,
    `- Auto review: ${result.autoReview.summary.promote} promote, ${result.autoReview.summary.needs_review} needs review, ${result.autoReview.summary.keep_draft} keep draft`,
    `- Release admission: ${result.releaseAdmission.summary.eligible_for_publish} eligible, ${result.releaseAdmission.summary.blocked} blocked`,
    `- Promotion candidates: ${result.promotionCandidates.summary.candidates}`,
    `- Promotion plan: ${formatPromotionPlanSummary(result.promotionPlan.summary)}`,
    `- Failed snapshots: ${result.snapshots.filter((snapshot) => snapshot.status === "failed").length}`,
    "",
    "## Sources",
    ...result.snapshots.map((snapshot) => `- ${snapshot.source_id}: ${snapshot.status}, hash=${snapshot.content_hash}, path=${snapshot.content_path}`),
    "",
    "## Records",
    ...result.sourceRecords.map((record) => {
      const warnings = record.warnings?.length ? ` warnings=${record.warnings.join(",")}` : "";
      const urls = record.urls.length ? ` urls=${record.urls.join(", ")}` : "";
      return `- ${record.name} (${record.record_type}, confidence=${record.source_confidence}) source=${record.source_id}${warnings}${urls}`;
    }),
    ...renderDiscoveryCandidates(result),
    ...renderFieldValueProvenance(result),
    ...renderAutoReview(result),
    ...renderInterventionRequests(result),
    ...renderReleaseAdmission(result),
    ...renderPromotionCandidates(result),
    ...renderPromotionPlan(result),
    ...renderSourceRegistryReviewRequirements(sourceRegistryReviewRequirements),
    ...renderSourceRegistryReviewRequests(sourceRegistryReviewRequests)
  ];

  return `${lines.join("\n")}\n`;
}

function renderAutoReview(result: RunIngestionResult): string[] {
  if (result.autoReview.items.length === 0) return [];

  return [
    "",
    "## Auto Review",
    ...result.autoReview.items.map((item) => {
      const reasons = item.human_review_reasons.length > 0 ? item.human_review_reasons.join(",") : "none";
      return `- ${item.tool_id} source_record=${item.source_record_id} action=${item.suggested_action} score=${item.scorecard.total} confidence=${item.confidence} human_review_reasons=${reasons}`;
    })
  ];
}

function renderDiscoveryCandidates(result: RunIngestionResult): string[] {
  if (result.discoveryCandidates.items.length === 0) return [];

  return [
    "",
    "## Discovery Candidates",
    ...result.discoveryCandidates.items.map((item) => {
      const repo = item.repo_url ? ` repo=${item.repo_url}` : "";
      const stars = typeof item.stars === "number" ? ` stars=${item.stars}` : "";
      return `- ${item.name} source=${item.source_id} source_record=${item.source_record_id}${repo}${stars} review_status=${item.review_status} action=${item.recommended_action}`;
    })
  ];
}

export function renderSourceRegistryReviewRequests(requests: SourceRegistryReviewRequestSummary[]): string[] {
  if (requests.length === 0) return [];

  return [
    "",
    "## Source Registry Review Requests",
    ...requests.map((request) => {
      return `- ${request.source_id}:${request.field} action=${request.suggested_action}`;
    })
  ];
}

function renderFieldValueProvenance(result: RunIngestionResult): string[] {
  if (result.fieldProvenance.items.length === 0) return [];

  return [
    "",
    "## Field Value Provenance",
    ...result.fieldProvenance.items.slice(0, 20).map((item) => {
      const overrideRecord = item.override_record_id ? ` override_record=${item.override_record_id}` : "";
      return `- ${item.tool_id} ${item.tool_card_field} type=${item.provenance_type} source=${item.source_field_path} source_record=${item.source_record_id}${overrideRecord} value=${item.source_value_preview}`;
    })
  ];
}

function renderInterventionRequests(result: RunIngestionResult): string[] {
  if (result.interventionRequests.items.length === 0) return [];

  return [
    "",
    "## Intervention Requests",
    ...result.interventionRequests.items.map((item) => {
      const publishedDuplicates = item.duplicate_of_tool_ids.length > 0 ? item.duplicate_of_tool_ids.join(",") : "none";
      const draftDuplicates = item.duplicate_of_draft_tool_ids.length > 0 ? item.duplicate_of_draft_tool_ids.join(",") : "none";
      return `- ${item.tool_id} (${item.name}) source_record=${item.source_record_id} review_status=${item.review_status} published_duplicates=${publishedDuplicates} draft_duplicates=${draftDuplicates} action=${item.suggested_action}`;
    })
  ];
}

function renderReleaseAdmission(result: RunIngestionResult): string[] {
  if (result.releaseAdmission.items.length === 0) return [];

  return [
    "",
    "## Release Admission",
    ...result.releaseAdmission.items.map((item) => {
      const blockingReasons = item.blocking_reasons.length > 0 ? item.blocking_reasons.join(",") : "none";
      return `- ${item.tool_id} source_record=${item.source_record_id} status=${item.status} gate=${item.gate} blocking_reasons=${blockingReasons}`;
    })
  ];
}

function renderPromotionCandidates(result: RunIngestionResult): string[] {
  if (result.promotionCandidates.items.length === 0) return [];

  return [
    "",
    "## Promotion Candidates",
    ...result.promotionCandidates.items.map((item) => {
      return `- ${item.tool_id} (${item.draft.name}) source_record=${item.source_record_id} gate=${item.review.gate} reviewer=${item.review.reviewed_by} reviewed_at=${item.review.reviewed_at} review_reason=${item.review.reason}`;
    })
  ];
}

function renderPromotionPlan(result: RunIngestionResult): string[] {
  if (result.promotionPlan.items.length === 0) return [];

  return [
    "",
    "## Promotion Plan",
    ...result.promotionPlan.items.map((item) => {
      return `- ${item.tool_id} target=${item.target_artifact} action=${item.recommended_action} candidate_artifact=${item.candidate_artifact_path}`;
    })
  ];
}

function formatPromotionPlanSummary(summary: RunIngestionResult["promotionPlan"]["summary"]): string {
  const publishStatus = summary.reliable_publish_ready ? "ready for reliable publish" : "no reliable publish candidates";
  return `${summary.candidates} candidates, ${publishStatus}`;
}

function renderSourceRegistryReviewRequirements(requirements: SourceRegistryReviewRequirementSummary[]): string[] {
  if (requirements.length === 0) return [];

  return [
    "",
    "## Source Registry Review Requirements",
    ...requirements.map((requirement) => {
      const confirmation = requirement.confirmation_required ? " confirmation_required=true" : "";
      return `- ${requirement.source_id}: ${requirement.field} - ${requirement.reason}${confirmation}`;
    })
  ];
}
