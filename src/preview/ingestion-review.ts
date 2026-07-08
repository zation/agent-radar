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
    ...renderSourceRegistryReviewRequirements(sourceRegistryReviewRequirements)
  ];

  return `${lines.join("\n")}\n`;
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
