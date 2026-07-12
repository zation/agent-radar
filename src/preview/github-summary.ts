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
    ...(manifest.ingestion_review ? [`- Approval overrides: ${formatIngestionApprovals(manifest.ingestion_review.approvals)}`] : []),
    ...(manifest.intervention_requests ? [`- Intervention requests: ${formatInterventionRequests(manifest.intervention_requests)}`] : []),
    ...(manifest.field_value_provenance ? [`- Field value provenance: ${formatFieldValueProvenance(manifest.field_value_provenance)}`] : []),
    ...(manifest.auto_review ? [`- Auto review: ${formatAutoReview(manifest.auto_review)}`] : []),
    ...(manifest.release_admission ? [`- Release admission: ${formatReleaseAdmission(manifest.release_admission)}`] : []),
    ...(manifest.discovery_candidates ? [`- Discovery candidates: ${formatDiscoveryCandidates(manifest.discovery_candidates)}`] : []),
    ...(manifest.promotion_candidates ? [`- Promotion candidates: ${manifest.promotion_candidates.candidates}`] : []),
    ...(manifest.promotion_plan ? [`- Promotion plan: ${formatPromotionPlan(manifest.promotion_plan)}`] : []),
    ...(manifest.promotion_check ? [`- Promotion check: ${formatPromotionCheck(manifest.promotion_check)}`] : []),
    ...(manifest.data_quality ? [`- P1 data quality: ${formatDataQuality(manifest.data_quality)}`] : []),
    ...(manifest.review_summary ? [`- Review Summary v2: ${manifest.review_summary.status}, ${manifest.review_summary.blocking} blocking, ${manifest.review_summary.warnings} warnings`] : []),
    ...(manifest.feedback ? [`- Feedback: ${manifest.feedback.d1_rows} D1 rows, ${manifest.feedback.affected_tools} affected Tools, ${manifest.feedback.needs_human_review} needs human review, ${manifest.feedback.deprecated} deprecated`] : []),
    `- Checksums: ${Object.keys(manifest.checksums).length} files`
  ];
  return `${lines.join("\n")}\n`;
}

export interface McpSmokeSummary {
  endpoint: string;
  passed: number;
  total: number;
  skipped: boolean;
}

export interface CompactReviewSummaryOptions {
  refName: string;
  sha: string;
  deployOutput?: string;
  mcpSmoke?: McpSmokeSummary;
}

export function renderCompactReviewSummaryMarkdown(manifest: ArtifactManifest, options: CompactReviewSummaryOptions): string {
  const lines = [
    "## Agent Radar Preview",
    "",
    `- Ref: \`${options.refName}\``,
    `- SHA: \`${options.sha}\``,
    `- Data: \`${manifest.data_version}\``,
    `- Eval: ${formatStatus(manifest.eval.passed === manifest.eval.total)} ${manifest.eval.passed}/${manifest.eval.total} using \`${manifest.eval.model}\``,
    ...renderDeployOutput(options.deployOutput),
    "",
    "### Review Required",
    ...renderReviewRequired(manifest),
    "",
    "### Release Gates",
    ...renderReleaseGates(manifest, options.mcpSmoke),
    "",
    "### Full Artifacts",
    "- Download the preview bundle artifact for full ingestion details.",
    "- Detailed review file: `artifacts/review/ingestion.md`",
    "- P1 review summary: `artifacts/review/review_summary.v2.md`"
  ];

  return `${lines.join("\n")}\n`;
}

function renderDeployOutput(output: string | undefined): string[] {
  const url = extractFirstUrl(output);
  return url ? [`- Preview: ${url}`] : [];
}

function renderReviewRequired(manifest: ArtifactManifest): string[] {
  const items: string[] = [];
  const sourceRequests = manifest.source_registry_review_requests;
  if (sourceRequests && sourceRequests.pending_review > 0) {
    items.push(`- Source registry: ${sourceRequests.pending_review} pending confirmation${sourceRequests.confirmation_required > 0 ? `, ${sourceRequests.confirmation_required} required` : ""}`);
  }

  const interventionRequests = manifest.intervention_requests;
  if (interventionRequests && (interventionRequests.pending_intervention > 0 || interventionRequests.duplicate_review_required > 0 || interventionRequests.blocked_validation > 0)) {
    items.push(
      `- Tool Card interventions: ${interventionRequests.pending_intervention} pending, ${interventionRequests.duplicate_review_required} duplicate review, ${interventionRequests.blocked_validation} blocked validation`
    );
  }

  const releaseAdmission = manifest.release_admission;
  if (releaseAdmission && releaseAdmission.blocked > 0) {
    items.push(`- Release admission: ${releaseAdmission.blocked} blocked, ${releaseAdmission.eligible_for_publish} eligible`);
  }

  const promotionCheck = manifest.promotion_check;
  if (promotionCheck && (!promotionCheck.passed || promotionCheck.blocked > 0 || promotionCheck.validation_errors > 0 || promotionCheck.duplicate_tool_ids > 0)) {
    items.push(
      `- Promotion check: ${promotionCheck.ready_for_publish} ready, ${promotionCheck.blocked} blocked, ${promotionCheck.validation_errors} validation errors, ${promotionCheck.duplicate_tool_ids} duplicate ids`
    );
  }

  const evalFailures = manifest.eval.total - manifest.eval.passed;
  if (evalFailures > 0) items.push(`- Golden eval: ${evalFailures} failing (${formatFailureCategories(manifest.eval.failure_categories)})`);

  const fieldProvenance = manifest.tool_card_field_provenance;
  if (fieldProvenance && fieldProvenance.missing > 0) {
    items.push(`- Field provenance: ${fieldProvenance.missing} critical fields missing evidence`);
  }

  const crawlAudit = manifest.crawl_audit;
  if (crawlAudit && (crawlAudit.failed > 0 || crawlAudit.partial > 0)) {
    items.push(`- Crawl audit: ${crawlAudit.failed} failed, ${crawlAudit.partial} partial`);
  }

  const dataQuality = manifest.data_quality;
  if (dataQuality && (dataQuality.status === "blocked" || dataQuality.blocking > 0)) {
    items.push(`- P1 data quality: ${dataQuality.blocking} blocking (${dataQuality.reason_codes.join(", ")})`);
  }
  if ((manifest.feedback?.needs_human_review ?? 0) > 0) {
    items.push(`- Feedback: ${manifest.feedback!.needs_human_review} Issue(s) need human review`);
  }

  return items.length > 0 ? items : ["- None. Review the full artifact only if you want detailed provenance."];
}

function renderReleaseGates(manifest: ArtifactManifest, smoke: McpSmokeSummary | undefined): string[] {
  const promotion = manifest.promotion_check
    ? `${formatStatus(manifest.promotion_check.passed)} promotion ${manifest.promotion_check.ready_for_publish}/${manifest.promotion_check.candidates} ready`
    : "unknown promotion check";
  const evalGate = `${formatStatus(manifest.eval.passed === manifest.eval.total)} eval ${manifest.eval.passed}/${manifest.eval.total}`;
  const sourceReview = manifest.source_registry_review
    ? `${formatStatus(manifest.source_registry_review.pending === 0 && manifest.source_registry_review.rejected === 0 && manifest.source_registry_review.needs_changes === 0)} source review ${manifest.source_registry_review.confirmed}/${manifest.source_registry_review.total_requirements} confirmed`
    : "source review unavailable";
  const mcp = smoke ? `${formatStatus(smoke.skipped ? true : smoke.passed === smoke.total)} MCP smoke ${smoke.skipped ? "skipped" : `${smoke.passed}/${smoke.total}`}` : "MCP smoke skipped";
  const dataQuality = manifest.data_quality
    ? `${formatStatus(manifest.data_quality.status === "pass")} data quality ${manifest.data_quality.blocking} blocking`
    : "data quality unavailable";

  return [`- ${dataQuality}`, `- ${evalGate}`, `- ${promotion}`, `- ${sourceReview}`, `- ${mcp}`];
}

function formatStatus(passed: boolean): string {
  return passed ? "PASS" : "NEEDS REVIEW";
}

function extractFirstUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return /(https?:\/\/\S+)/.exec(value)?.[1]?.replace(/[).,]+$/, "");
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

function formatInterventionRequests(requests: NonNullable<ArtifactManifest["intervention_requests"]>): string {
  return `${requests.pending_intervention} pending, ${requests.duplicate_review_required} duplicate review, ${requests.blocked_validation} blocked validation`;
}

function formatFieldValueProvenance(provenance: NonNullable<ArtifactManifest["field_value_provenance"]>): string {
  return `${provenance.field_values} field values across ${provenance.tool_cards} Tool Cards`;
}

function formatAutoReview(autoReview: NonNullable<ArtifactManifest["auto_review"]>): string {
  return `${autoReview.promote} promote, ${autoReview.needs_review} needs review, ${autoReview.keep_draft} keep draft, ${autoReview.reject} reject, ${autoReview.retire} retire`;
}

function formatReleaseAdmission(admission: NonNullable<ArtifactManifest["release_admission"]>): string {
  return `${admission.eligible_for_publish} eligible, ${admission.blocked} blocked`;
}

function formatDiscoveryCandidates(candidates: NonNullable<ArtifactManifest["discovery_candidates"]>): string {
  return `${candidates.candidates} candidates, ${candidates.pending_production_gate} pending production gate review`;
}

function formatPromotionPlan(plan: NonNullable<ArtifactManifest["promotion_plan"]>): string {
  const publishStatus = plan.reliable_publish_ready ? "ready for reliable publish" : "no reliable publish candidates";
  return `${plan.candidates} candidates, ${publishStatus}`;
}

function formatPromotionCheck(check: NonNullable<ArtifactManifest["promotion_check"]>): string {
  const status = check.passed ? "passed" : "failed";
  return `${check.ready_for_publish} ready, ${check.blocked} blocked, ${status}`;
}

function formatDataQuality(quality: NonNullable<ArtifactManifest["data_quality"]>): string {
  const reasons = quality.reason_codes.length > 0 ? ` (${quality.reason_codes.join(", ")})` : "";
  return `${quality.status}, ${quality.blocking} blocking${reasons}`;
}
