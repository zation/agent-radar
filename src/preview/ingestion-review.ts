import type { RunIngestionResult } from "../ingestion/run.js";

export function renderIngestionReviewMarkdown(result: RunIngestionResult): string {
  const lines = [
    "# Ingestion Review",
    "",
    "## Summary",
    `- Snapshots: ${result.snapshots.length}`,
    `- Source records: ${result.sourceRecords.length}`,
    `- Tool card drafts: ${result.toolCardDrafts.length}`,
    `- Review ready: ${result.reviewQueue.summary.ready_for_review}`,
    `- Review blocked: ${result.reviewQueue.summary.blocked_validation}`,
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
    })
  ];

  return `${lines.join("\n")}\n`;
}
