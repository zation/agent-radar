import type { ArtifactManifest } from "./manifest.js";

export function renderArtifactManifestSummaryMarkdown(manifest: ArtifactManifest): string {
  const lines = [
    "### Artifact Manifest",
    "",
    `- Schema: \`${manifest.schema_version}\``,
    `- Git SHA: \`${manifest.git_sha}\``,
    `- Data version: \`${manifest.data_version}\``,
    `- Eval: ${manifest.eval.passed}/${manifest.eval.total} using \`${manifest.eval.model}\``,
    `- Eval failure categories: ${formatFailureCategories(manifest.eval.failure_categories)}`,
    ...(manifest.tool_card_field_provenance ? [`- Tool Card field provenance: ${formatToolCardFieldProvenance(manifest.tool_card_field_provenance)}`] : []),
    ...(manifest.crawl_audit ? [`- Crawl audit: ${formatCrawlAudit(manifest.crawl_audit)}`] : []),
    ...(manifest.source_registry_review ? [`- Source registry review: ${formatSourceRegistryReview(manifest.source_registry_review)}`] : []),
    ...(manifest.source_registry_review_requests ? [`- Source registry review requests: ${formatSourceRegistryReviewRequests(manifest.source_registry_review_requests)}`] : []),
    ...(manifest.ingestion_review ? [`- Ingestion approvals: ${formatIngestionApprovals(manifest.ingestion_review.approvals)}`] : []),
    ...(manifest.approval_requests ? [`- Approval requests: ${formatApprovalRequests(manifest.approval_requests)}`] : []),
    ...(manifest.field_value_provenance ? [`- Field value provenance: ${formatFieldValueProvenance(manifest.field_value_provenance)}`] : []),
    ...(manifest.release_admission ? [`- Release admission: ${formatReleaseAdmission(manifest.release_admission)}`] : []),
    ...(manifest.promotion_candidates ? [`- Promotion candidates: ${manifest.promotion_candidates.candidates}`] : []),
    ...(manifest.promotion_plan ? [`- Promotion plan: ${formatPromotionPlan(manifest.promotion_plan)}`] : []),
    ...(manifest.promotion_check ? [`- Promotion check: ${formatPromotionCheck(manifest.promotion_check)}`] : []),
    `- Checksums: ${Object.keys(manifest.checksums).length} files`
  ];
  return `${lines.join("\n")}\n`;
}

function formatFailureCategories(categories: Record<string, number>): string {
  const entries = Object.entries(categories).sort(([left], [right]) => left.localeCompare(right));
  if (entries.length === 0) return "`none=0`";
  return entries.map(([category, count]) => `\`${category}=${count}\``).join(", ");
}

function formatToolCardFieldProvenance(provenance: NonNullable<ArtifactManifest["tool_card_field_provenance"]>): string {
  const covered = provenance.covered + provenance.covered_by_manual_review;
  return `${covered}/${provenance.fields_checked} fields covered (${provenance.covered} field refs, ${provenance.covered_by_manual_review} manual review, ${provenance.missing} missing)`;
}

function formatCrawlAudit(crawlAudit: NonNullable<ArtifactManifest["crawl_audit"]>): string {
  return `${crawlAudit.success} success, ${crawlAudit.partial} partial, ${crawlAudit.failed} failed (${crawlAudit.total} total)`;
}

function formatSourceRegistryReview(review: NonNullable<ArtifactManifest["source_registry_review"]>): string {
  return `${review.confirmed}/${review.total_requirements} confirmed, ${review.pending} pending, ${review.rejected} rejected, ${review.needs_changes} needs changes`;
}

function formatSourceRegistryReviewRequests(requests: NonNullable<ArtifactManifest["source_registry_review_requests"]>): string {
  return `${requests.pending_review} pending, ${requests.confirmation_required} confirmation required`;
}

function formatIngestionApprovals(approvals: NonNullable<ArtifactManifest["ingestion_review"]>["approvals"]): string {
  return `${approvals.approved} approved, ${approvals.rejected} rejected, ${approvals.needs_changes} needs changes`;
}

function formatApprovalRequests(requests: NonNullable<ArtifactManifest["approval_requests"]>): string {
  return `${requests.pending_approval} pending, ${requests.duplicate_review_required} duplicate review, ${requests.blocked_validation} blocked validation`;
}

function formatFieldValueProvenance(provenance: NonNullable<ArtifactManifest["field_value_provenance"]>): string {
  return `${provenance.field_values} field values across ${provenance.tool_cards} Tool Cards`;
}

function formatReleaseAdmission(admission: NonNullable<ArtifactManifest["release_admission"]>): string {
  return `${admission.eligible_for_publish} eligible, ${admission.blocked} blocked`;
}

function formatPromotionPlan(plan: NonNullable<ArtifactManifest["promotion_plan"]>): string {
  const mergeStatus = plan.manual_merge_required ? "manual merge required" : "no manual merge required";
  return `${plan.candidates} candidates, ${mergeStatus}`;
}

function formatPromotionCheck(check: NonNullable<ArtifactManifest["promotion_check"]>): string {
  const status = check.passed ? "passed" : "failed";
  return `${check.ready_for_manual_merge} ready, ${check.blocked} blocked, ${status}`;
}
