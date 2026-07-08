import type { RunIngestionResult } from "../ingestion/run.js";

export interface SourceRegistryReviewRequirementSummary {
  source_id: string;
  field: string;
  reason: string;
  confirmation_required: boolean;
}

export function renderIngestionReviewMarkdown(result: RunIngestionResult, sourceRegistryReviewRequirements: SourceRegistryReviewRequirementSummary[] = []): string {
  const lines = [
    "# Ingestion Review",
    "",
    "## Summary",
    `- Snapshots: ${result.snapshots.length}`,
    `- Source records: ${result.sourceRecords.length}`,
    `- Tool card drafts: ${result.toolCardDrafts.length}`,
    `- Review ready: ${result.reviewQueue.summary.ready_for_review}`,
    `- Review blocked: ${result.reviewQueue.summary.blocked_validation}`,
    `- Crawl audit: ${result.crawlAudit.summary.success} success, ${result.crawlAudit.summary.partial} partial, ${result.crawlAudit.summary.failed} failed`,
    `- Approvals: ${result.approvalArtifact.summary.approved} approved, ${result.approvalArtifact.summary.rejected} rejected, ${result.approvalArtifact.summary.needs_changes} needs changes`,
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
    ...renderFieldValueProvenance(result),
    ...renderApprovalRequests(result),
    ...renderReleaseAdmission(result),
    ...renderPromotionCandidates(result),
    ...renderPromotionPlan(result),
    ...renderSourceRegistryReviewRequirements(sourceRegistryReviewRequirements)
  ];

  return `${lines.join("\n")}\n`;
}

function renderFieldValueProvenance(result: RunIngestionResult): string[] {
  if (result.fieldProvenance.items.length === 0) return [];

  return [
    "",
    "## Field Value Provenance",
    ...result.fieldProvenance.items.slice(0, 20).map((item) => {
      return `- ${item.tool_id} ${item.tool_card_field} source=${item.source_field_path} source_record=${item.source_record_id} value=${item.source_value_preview}`;
    })
  ];
}

function renderApprovalRequests(result: RunIngestionResult): string[] {
  if (result.approvalRequests.items.length === 0) return [];

  return [
    "",
    "## Approval Requests",
    ...result.approvalRequests.items.map((item) => {
      const publishedDuplicates = item.duplicate_of_tool_ids.length > 0 ? item.duplicate_of_tool_ids.join(",") : "none";
      const draftDuplicates = item.duplicate_of_draft_tool_ids.length > 0 ? item.duplicate_of_draft_tool_ids.join(",") : "none";
      return `- ${item.tool_id} (${item.name}) source_record=${item.source_record_id} review_status=${item.review_status} published_duplicates=${publishedDuplicates} draft_duplicates=${draftDuplicates} template_id=${item.approval_record_template.id} decision_options=${item.decision_options.join(",")} required_fields=${item.approval_record_template.required_fields.join(",")}`;
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
      return `- ${item.tool_id} source_record=${item.source_record_id} status=${item.status} blocking_reasons=${blockingReasons}`;
    })
  ];
}

function renderPromotionCandidates(result: RunIngestionResult): string[] {
  if (result.promotionCandidates.items.length === 0) return [];

  return [
    "",
    "## Promotion Candidates",
    ...result.promotionCandidates.items.map((item) => {
      return `- ${item.tool_id} (${item.draft.name}) source_record=${item.source_record_id} reviewer=${item.approval.reviewed_by} reviewed_at=${item.approval.reviewed_at} approval_reason=${item.approval.reason}`;
    })
  ];
}

function renderPromotionPlan(result: RunIngestionResult): string[] {
  if (result.promotionPlan.items.length === 0) return [];

  return [
    "",
    "## Promotion Plan",
    ...result.promotionPlan.items.map((item) => {
      return `- ${item.tool_id} target=${item.target_file} action=${item.recommended_action} candidate_artifact=${item.candidate_artifact_path}`;
    })
  ];
}

function formatPromotionPlanSummary(summary: RunIngestionResult["promotionPlan"]["summary"]): string {
  const mergeStatus = summary.manual_merge_required ? "manual merge required" : "no manual merge required";
  return `${summary.candidates} candidates, ${mergeStatus}`;
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
