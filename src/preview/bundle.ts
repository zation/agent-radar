import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { PublishedDataTrustEvidence, RunIngestionResult } from "../ingestion/run.js";
import { renderIngestionReviewMarkdown, type SourceRegistryReviewRequestSummary, type SourceRegistryReviewRequirementSummary } from "./ingestion-review.js";
import { buildArtifactManifest } from "./manifest.js";
import type { DataQualityReport } from "../validation/data-quality-report.js";
import {
  buildReviewSummaryV2,
  renderReviewSummaryV2Markdown,
  verifyReviewSummaryChecksums,
} from "./review-summary.js";

export interface CreatePreviewBundleOptions {
  distDir: string;
  reviewDir: string;
  gitSha: string;
  builtAt: string;
  providerModel: string;
}

export async function createPreviewBundle(options: CreatePreviewBundleOptions): Promise<void> {
  const ingestion = await loadIngestionReviewEvidence(options.distDir);
  await mkdir(options.reviewDir, { recursive: true });
  const sourceRegistryReviewRequirements = await readSourceRegistryReviewRequirements(options.distDir);
  const sourceRegistryReviewRequests = await readSourceRegistryReviewRequests(options.distDir);
  await writeFile(join(options.reviewDir, "ingestion.md"), renderIngestionReviewMarkdown(ingestion, sourceRegistryReviewRequirements, sourceRegistryReviewRequests), "utf8");
  await rm(join(options.distDir, "data", "review_summary.v2.json"), { force: true });
  await rm(join(options.distDir, "reports", "review_summary.v2.md"), { force: true });

  const inputManifest = await buildArtifactManifest({
    distDir: options.distDir,
    gitSha: options.gitSha,
    builtAt: options.builtAt,
    providerModel: options.providerModel
  });
  enrichManifestWithIngestion(inputManifest, ingestion);
  const dataQualityReport = JSON.parse(
    await readFile(join(options.distDir, "data", "data_quality_report.json"), "utf8"),
  ) as DataQualityReport;
  const reviewSummary = buildReviewSummaryV2({
    manifest: inputManifest,
    dataQualityReport,
    generatedAt: options.builtAt,
  });
  await verifyReviewSummaryChecksums(options.distDir, reviewSummary);
  await writeFile(
    join(options.distDir, "data", "review_summary.v2.json"),
    JSON.stringify(reviewSummary, null, 2),
    "utf8",
  );
  await writeFile(
    join(options.reviewDir, "review_summary.v2.md"),
    renderReviewSummaryV2Markdown(reviewSummary),
    "utf8",
  );
  await mkdir(join(options.distDir, "reports"), { recursive: true });
  await writeFile(
    join(options.distDir, "reports", "review_summary.v2.md"),
    renderReviewSummaryV2Markdown(reviewSummary),
    "utf8",
  );

  const manifest = await buildArtifactManifest({
    distDir: options.distDir,
    gitSha: options.gitSha,
    builtAt: options.builtAt,
    providerModel: options.providerModel
  });
  enrichManifestWithIngestion(manifest, ingestion);
  await writeFile(join(options.distDir, "artifact-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}

function enrichManifestWithIngestion(manifest: Awaited<ReturnType<typeof buildArtifactManifest>>, ingestion: RunIngestionResult): void {
  manifest.crawl_audit = {
    total: ingestion.crawlAudit.summary.total,
    success: ingestion.crawlAudit.summary.success,
    partial: ingestion.crawlAudit.summary.partial,
    failed: ingestion.crawlAudit.summary.failed
  };
  manifest.ingestion_review = {
    approvals: {
      approved: ingestion.approvalArtifact.summary.approved,
      rejected: ingestion.approvalArtifact.summary.rejected,
      needs_changes: ingestion.approvalArtifact.summary.needs_changes
    },
    overrides: ingestion.overrideRecords.length
  };
  manifest.intervention_requests = {
    pending_intervention: ingestion.interventionRequests.summary.pending_intervention,
    duplicate_review_required: ingestion.interventionRequests.summary.duplicate_review_required,
    blocked_validation: ingestion.interventionRequests.summary.blocked_validation
  };
  manifest.field_value_provenance = {
    tool_cards: ingestion.fieldProvenance.summary.tool_cards,
    field_values: ingestion.fieldProvenance.summary.field_values
  };
  manifest.auto_review = {
    promote: ingestion.autoReview.summary.promote,
    keep_draft: ingestion.autoReview.summary.keep_draft,
    needs_review: ingestion.autoReview.summary.needs_review,
    reject: ingestion.autoReview.summary.reject,
    retire: ingestion.autoReview.summary.retire
  };
  manifest.release_admission = {
    eligible_for_publish: ingestion.releaseAdmission.summary.eligible_for_publish,
    blocked: ingestion.releaseAdmission.summary.blocked
  };
  manifest.discovery_candidates = {
    candidates: ingestion.discoveryCandidates.summary.candidates,
    pending_production_gate: ingestion.discoveryCandidates.summary.pending_production_gate
  };
  manifest.promotion_candidates = {
    candidates: ingestion.promotionCandidates.summary.candidates
  };
  manifest.promotion_plan = {
    candidates: ingestion.promotionPlan.summary.candidates,
    reliable_publish_ready: ingestion.promotionPlan.summary.reliable_publish_ready
  };
  manifest.promotion_check = {
    candidates: ingestion.promotionCheck.summary.candidates,
    ready_for_publish: ingestion.promotionCheck.summary.ready_for_publish,
    blocked: ingestion.promotionCheck.summary.blocked,
    duplicate_tool_ids: ingestion.promotionCheck.summary.duplicate_tool_ids,
    validation_errors: ingestion.promotionCheck.summary.validation_errors,
    validation_warnings: ingestion.promotionCheck.summary.validation_warnings,
    passed: ingestion.promotionCheck.passed
  };
}

export async function loadIngestionReviewEvidence(distDir: string): Promise<RunIngestionResult> {
  const evidence = JSON.parse(await readFile(join(distDir, "data", "review", "ingestion.json"), "utf8")) as {
    schema_version?: string;
    result?: RunIngestionResult;
    published_data_trust?: PublishedDataTrustEvidence;
  };
  if (evidence.schema_version !== "ingestion_review_evidence.v1" || !evidence.result) {
    throw new Error("ingestion review evidence must use ingestion_review_evidence.v1");
  }

  const comparisons: Array<[string, string, unknown]> = [
    ["crawl audit", "data/crawl_audit/crawl_audit.json", evidence.result.crawlAudit],
    ["approval overrides", "data/approvals/approval_records.json", evidence.result.approvalArtifact],
    ["intervention requests", "data/intervention_requests/tool_card_drafts.json", evidence.result.interventionRequests],
    ["field provenance", "data/field_provenance/tool_card_fields.json", evidence.result.fieldProvenance],
    ["field provenance v2", "data/field_provenance/tool_card_fields.v2.json", evidence.published_data_trust?.fieldProvenanceV2 ?? evidence.result.fieldProvenanceV2],
    ["conflict report", "data/conflicts/tool_card_conflicts.json", evidence.published_data_trust?.conflictReport ?? evidence.result.conflictReport],
    ["auto review", "data/auto_review/tool_card_drafts.json", evidence.result.autoReview],
    ["release admission", "data/release_admission/tool_card_drafts.json", evidence.result.releaseAdmission],
    ["discovery candidates", "data/discovery_candidates/tool_repositories.json", evidence.result.discoveryCandidates],
    ["promotion candidates", "data/promotion_candidates/tool_cards.json", evidence.result.promotionCandidates],
    ["promotion plan", "data/promotion_candidates/promotion_plan.json", evidence.result.promotionPlan],
    ["promotion check", "data/promotion_candidates/promotion_check.json", evidence.result.promotionCheck]
  ];

  for (const [label, relativePath, expected] of comparisons) {
    const actual = JSON.parse(await readFile(join(distDir, relativePath), "utf8")) as unknown;
    if (!isDeepStrictEqual(actual, expected)) {
      throw new Error(`${label} does not match ingestion review evidence`);
    }
  }

  return evidence.result;
}

async function readSourceRegistryReviewRequests(distDir: string): Promise<SourceRegistryReviewRequestSummary[]> {
  try {
    const requests = JSON.parse(await readFile(join(distDir, "data", "source_registry_review_requests.json"), "utf8")) as {
      items?: Array<{
        source_id?: string;
        field?: string;
        suggested_action?: string;
      }>;
    };

    return (requests.items ?? []).flatMap((item) => {
      if (!item.source_id || !item.field || !item.suggested_action) return [];
      return [
        {
          source_id: item.source_id,
          field: item.field,
          suggested_action: item.suggested_action
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
