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
    ...(manifest.ingestion_review ? [`- Ingestion approvals: ${formatIngestionApprovals(manifest.ingestion_review.approvals)}`] : []),
    ...(manifest.approval_requests ? [`- Approval requests: ${formatApprovalRequests(manifest.approval_requests)}`] : []),
    ...(manifest.release_admission ? [`- Release admission: ${formatReleaseAdmission(manifest.release_admission)}`] : []),
    ...(manifest.promotion_candidates ? [`- Promotion candidates: ${manifest.promotion_candidates.candidates}`] : []),
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

function formatIngestionApprovals(approvals: NonNullable<ArtifactManifest["ingestion_review"]>["approvals"]): string {
  return `${approvals.approved} approved, ${approvals.rejected} rejected, ${approvals.needs_changes} needs changes`;
}

function formatApprovalRequests(requests: NonNullable<ArtifactManifest["approval_requests"]>): string {
  return `${requests.pending_approval} pending, ${requests.duplicate_review_required} duplicate review, ${requests.blocked_validation} blocked validation`;
}

function formatReleaseAdmission(admission: NonNullable<ArtifactManifest["release_admission"]>): string {
  return `${admission.eligible_for_publish} eligible, ${admission.blocked} blocked`;
}
