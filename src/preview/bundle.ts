import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunIngestionResult } from "../ingestion/run.js";
import { renderIngestionReviewMarkdown } from "./ingestion-review.js";
import { buildArtifactManifest } from "./manifest.js";

export interface CreatePreviewBundleOptions {
  distDir: string;
  reviewDir: string;
  ingestion: RunIngestionResult;
  gitSha: string;
  builtAt: string;
  providerModel: string;
}

export async function createPreviewBundle(options: CreatePreviewBundleOptions): Promise<void> {
  await mkdir(options.reviewDir, { recursive: true });
  await writeFile(join(options.reviewDir, "ingestion.md"), renderIngestionReviewMarkdown(options.ingestion), "utf8");

  const manifest = await buildArtifactManifest({
    distDir: options.distDir,
    gitSha: options.gitSha,
    builtAt: options.builtAt,
    providerModel: options.providerModel
  });
  manifest.crawl_audit = {
    total: options.ingestion.crawlAudit.summary.total,
    success: options.ingestion.crawlAudit.summary.success,
    partial: options.ingestion.crawlAudit.summary.partial,
    failed: options.ingestion.crawlAudit.summary.failed
  };
  manifest.ingestion_review = {
    approvals: {
      approved: options.ingestion.approvalArtifact.summary.approved,
      rejected: options.ingestion.approvalArtifact.summary.rejected,
      needs_changes: options.ingestion.approvalArtifact.summary.needs_changes
    }
  };
  manifest.release_admission = {
    eligible_for_publish: options.ingestion.releaseAdmission.summary.eligible_for_publish,
    blocked: options.ingestion.releaseAdmission.summary.blocked
  };
  manifest.promotion_candidates = {
    candidates: options.ingestion.promotionCandidates.summary.candidates
  };
  await writeFile(join(options.distDir, "artifact-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}
