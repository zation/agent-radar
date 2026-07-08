import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RunIngestionResult } from "../ingestion/run.js";
import { renderIngestionReviewMarkdown, type SourceRegistryReviewRequestSummary, type SourceRegistryReviewRequirementSummary } from "./ingestion-review.js";
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
  const sourceRegistryReviewRequirements = await readSourceRegistryReviewRequirements(options.distDir);
  const sourceRegistryReviewRequests = await readSourceRegistryReviewRequests(options.distDir);
  await writeFile(join(options.reviewDir, "ingestion.md"), renderIngestionReviewMarkdown(options.ingestion, sourceRegistryReviewRequirements, sourceRegistryReviewRequests), "utf8");

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
  manifest.approval_requests = {
    pending_approval: options.ingestion.approvalRequests.summary.pending_approval,
    duplicate_review_required: options.ingestion.approvalRequests.summary.duplicate_review_required,
    blocked_validation: options.ingestion.approvalRequests.summary.blocked_validation
  };
  manifest.field_value_provenance = {
    tool_cards: options.ingestion.fieldProvenance.summary.tool_cards,
    field_values: options.ingestion.fieldProvenance.summary.field_values
  };
  manifest.release_admission = {
    eligible_for_publish: options.ingestion.releaseAdmission.summary.eligible_for_publish,
    blocked: options.ingestion.releaseAdmission.summary.blocked
  };
  manifest.promotion_candidates = {
    candidates: options.ingestion.promotionCandidates.summary.candidates
  };
  manifest.promotion_plan = {
    candidates: options.ingestion.promotionPlan.summary.candidates,
    manual_merge_required: options.ingestion.promotionPlan.summary.manual_merge_required
  };
  manifest.promotion_check = {
    candidates: options.ingestion.promotionCheck.summary.candidates,
    ready_for_manual_merge: options.ingestion.promotionCheck.summary.ready_for_manual_merge,
    blocked: options.ingestion.promotionCheck.summary.blocked,
    duplicate_tool_ids: options.ingestion.promotionCheck.summary.duplicate_tool_ids,
    validation_errors: options.ingestion.promotionCheck.summary.validation_errors,
    validation_warnings: options.ingestion.promotionCheck.summary.validation_warnings,
    passed: options.ingestion.promotionCheck.passed
  };
  await writeFile(join(options.distDir, "artifact-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

async function readSourceRegistryReviewRequests(distDir: string): Promise<SourceRegistryReviewRequestSummary[]> {
  try {
    const requests = JSON.parse(await readFile(join(distDir, "data", "source_registry_review_requests.json"), "utf8")) as {
      items?: Array<{
        source_id?: string;
        field?: string;
        decision_options?: string[];
        review_record_template?: {
          id?: string;
          required_fields?: string[];
        };
      }>;
    };

    return (requests.items ?? []).flatMap((item) => {
      if (!item.source_id || !item.field || !item.review_record_template?.id) return [];
      return [
        {
          source_id: item.source_id,
          field: item.field,
          template_id: item.review_record_template.id,
          decision_options: item.decision_options ?? [],
          required_fields: item.review_record_template.required_fields ?? []
        }
      ];
    });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

async function readSourceRegistryReviewRequirements(distDir: string): Promise<SourceRegistryReviewRequirementSummary[]> {
  try {
    const diff = JSON.parse(await readFile(join(distDir, "data", "source_registry_diff.json"), "utf8")) as {
      changed?: Array<{
        id?: string;
        review_requirements?: Array<{
          field?: string;
          reason?: string;
          confirmation_required?: boolean;
        }>;
      }>;
    };

    return (diff.changed ?? []).flatMap((source) =>
      (source.review_requirements ?? []).flatMap((requirement) => {
        if (!source.id || !requirement.field || !requirement.reason) return [];
        return [
          {
            source_id: source.id,
            field: requirement.field,
            reason: requirement.reason,
            confirmation_required: requirement.confirmation_required === true
          }
        ];
      })
    );
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}
