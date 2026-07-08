import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildApprovalArtifact, type ApprovalArtifact, type ApprovalRecord } from "./approval.js";
import { buildToolCardApprovalRequests, type ToolCardApprovalRequests } from "./approval-requests.js";
import { buildToolCardAutoReview, type ToolCardAutoReview } from "./auto-review.js";
import { buildCrawlAudit, type CrawlAudit } from "./crawl-audit.js";
import { buildSourceCrawlPlan, type SourceCrawlPlan } from "./crawl-plan.js";
import { crawlEnabledSources } from "./crawler.js";
import { buildToolCardDuplicateReport, type ToolCardDuplicateReport } from "./deduper.js";
import { buildToolDiscoveryCandidates, type ToolDiscoveryCandidates } from "./discovery-candidates.js";
import { buildToolCardFieldValueProvenance, type ToolCardFieldValueProvenance } from "./field-provenance.js";
import { normalizeToolCardDrafts, type OverrideRecord } from "./normalizer.js";
import { parseSnapshot } from "./parser.js";
import { buildToolCardPromotionCheck, type ToolCardPromotionCheck } from "./promotion-check.js";
import { buildToolCardPromotionCandidates, type ToolCardPromotionCandidates } from "./promotion-candidates.js";
import { buildToolCardPromotionPlan, type ToolCardPromotionPlan } from "./promotion-plan.js";
import { buildToolCardReleaseAdmission, type ToolCardReleaseAdmission } from "./release-admission.js";
import { buildToolCardReviewQueue, type ToolCardReviewQueue } from "./review-queue.js";
import { getEnabledSources, sourceRegistry } from "./source-registry.js";
import type { RawSourceSnapshot, SourceDefinition, SourceRecord, ToolCard } from "../schema.js";

export interface RunIngestionOptions {
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
  sources?: SourceDefinition[];
  existingToolCards?: ToolCard[];
  overrideRecords?: OverrideRecord[];
  approvalRecords?: ApprovalRecord[];
}

export interface RunIngestionResult {
  crawlPlan: SourceCrawlPlan;
  crawlAudit: CrawlAudit;
  snapshots: RawSourceSnapshot[];
  sourceRecords: SourceRecord[];
  discoveryCandidates: ToolDiscoveryCandidates;
  toolCardDrafts: ToolCard[];
  overrideRecords: OverrideRecord[];
  approvalArtifact: ApprovalArtifact;
  approvalRequests: ToolCardApprovalRequests;
  fieldProvenance: ToolCardFieldValueProvenance;
  duplicateReport: ToolCardDuplicateReport;
  reviewQueue: ToolCardReviewQueue;
  autoReview: ToolCardAutoReview;
  releaseAdmission: ToolCardReleaseAdmission;
  promotionCandidates: ToolCardPromotionCandidates;
  promotionPlan: ToolCardPromotionPlan;
  promotionCheck: ToolCardPromotionCheck;
}

export async function runIngestion(options: RunIngestionOptions): Promise<RunIngestionResult> {
  const now = options.now ?? new Date().toISOString();
  const registry = options.sources ?? sourceRegistry;
  const enabledSources = getEnabledSources(registry);
  const crawlPlan = buildSourceCrawlPlan(registry, now);
  await writeCrawlPlan(options.outputDir, crawlPlan);
  const snapshots = await crawlEnabledSources({
    sources: enabledSources,
    outputDir: options.outputDir,
    now,
    fetchImpl: options.fetchImpl
  });
  const crawlAudit = buildCrawlAudit(snapshots, now);
  await writeCrawlAudit(options.outputDir, crawlAudit);
  const recordsBySource = new Map<string, SourceRecord[]>();

  for (const snapshot of snapshots) {
    const source = enabledSources.find((candidate) => candidate.id === snapshot.source_id);
    if (!source) continue;
    const records = await parseSnapshot(snapshot, source, options.outputDir, now);
    recordsBySource.set(source.id, records);
  }

  await writeSourceRecords(options.outputDir, recordsBySource);
  const overrideRecords = options.overrideRecords ?? [];
  await writeOverrideRecords(options.outputDir, overrideRecords);
  const approvalRecords = options.approvalRecords ?? [];
  const approvalArtifact = buildApprovalArtifact(approvalRecords, now);
  await writeApprovalArtifact(options.outputDir, approvalArtifact);
  const sourceRecords = [...recordsBySource.values()].flat();
  const discoveryCandidates = buildToolDiscoveryCandidates(sourceRecords, now);
  await writeDiscoveryCandidates(options.outputDir, discoveryCandidates);
  const draftsBySource = buildToolCardDrafts(recordsBySource, overrideRecords);
  await writeToolCardDrafts(options.outputDir, draftsBySource);
  const toolCardDrafts = [...draftsBySource.values()].flat();
  const fieldProvenance = buildToolCardFieldValueProvenance(toolCardDrafts, sourceRecords, now, overrideRecords);
  await writeFieldProvenance(options.outputDir, fieldProvenance);
  const existingToolCards = options.existingToolCards ?? [];
  const duplicateReport = buildToolCardDuplicateReport(toolCardDrafts, existingToolCards, now);
  await writeDuplicateReport(options.outputDir, duplicateReport);
  const reviewQueue = buildToolCardReviewQueue(toolCardDrafts, sourceRecords, existingToolCards, now, approvalRecords);
  await writeReviewQueue(options.outputDir, reviewQueue);
  const autoReview = buildToolCardAutoReview(toolCardDrafts, sourceRecords, reviewQueue, now);
  await writeAutoReview(options.outputDir, autoReview);
  const approvalRequests = buildToolCardApprovalRequests(reviewQueue, now);
  await writeApprovalRequests(options.outputDir, approvalRequests);
  const releaseAdmission = buildToolCardReleaseAdmission(reviewQueue, now, autoReview);
  await writeReleaseAdmission(options.outputDir, releaseAdmission);
  const promotionCandidates = buildToolCardPromotionCandidates(toolCardDrafts, releaseAdmission, approvalRecords, now, autoReview);
  await writePromotionCandidates(options.outputDir, promotionCandidates);
  const promotionPlan = buildToolCardPromotionPlan(promotionCandidates, now);
  await writePromotionPlan(options.outputDir, promotionPlan);
  const promotionCheck = buildToolCardPromotionCheck(promotionCandidates, existingToolCards, now);
  await writePromotionCheck(options.outputDir, promotionCheck);

  return {
    crawlPlan,
    crawlAudit,
    snapshots,
    sourceRecords,
    discoveryCandidates,
    toolCardDrafts,
    overrideRecords,
    approvalArtifact,
    approvalRequests,
    fieldProvenance,
    duplicateReport,
    reviewQueue,
    autoReview,
    releaseAdmission,
    promotionCandidates,
    promotionPlan,
    promotionCheck
  };
}

async function writeDiscoveryCandidates(outputDir: string, discoveryCandidates: ToolDiscoveryCandidates): Promise<void> {
  const discoveryDir = join(outputDir, "data", "discovery_candidates");
  await mkdir(discoveryDir, { recursive: true });
  await writeFile(join(discoveryDir, "tool_repositories.json"), JSON.stringify(discoveryCandidates, null, 2), "utf8");
}

async function writeCrawlAudit(outputDir: string, crawlAudit: CrawlAudit): Promise<void> {
  const crawlAuditDir = join(outputDir, "data", "crawl_audit");
  await mkdir(crawlAuditDir, { recursive: true });
  await writeFile(join(crawlAuditDir, "crawl_audit.json"), JSON.stringify(crawlAudit, null, 2), "utf8");
}

async function writeCrawlPlan(outputDir: string, crawlPlan: SourceCrawlPlan): Promise<void> {
  const crawlPlanDir = join(outputDir, "data", "crawl_plan");
  await mkdir(crawlPlanDir, { recursive: true });
  await writeFile(join(crawlPlanDir, "source_crawl_plan.json"), JSON.stringify(crawlPlan, null, 2), "utf8");
}

async function writeSourceRecords(outputDir: string, recordsBySource: Map<string, SourceRecord[]>): Promise<void> {
  const recordsDir = join(outputDir, "data", "source_records");
  await mkdir(recordsDir, { recursive: true });

  for (const [sourceId, records] of recordsBySource) {
    const jsonl = records.length > 0 ? `${records.map((record) => JSON.stringify(record)).join("\n")}\n` : "";
    await writeFile(join(recordsDir, `${sourceId}.jsonl`), jsonl, "utf8");
  }
}

function buildToolCardDrafts(recordsBySource: Map<string, SourceRecord[]>, overrideRecords: OverrideRecord[]): Map<string, ToolCard[]> {
  const draftsBySource = new Map<string, ToolCard[]>();

  for (const [sourceId, records] of recordsBySource) {
    const drafts = normalizeToolCardDrafts(records, overrideRecords);
    draftsBySource.set(sourceId, drafts);
  }

  return draftsBySource;
}

async function writeToolCardDrafts(outputDir: string, draftsBySource: Map<string, ToolCard[]>): Promise<void> {
  const draftsDir = join(outputDir, "data", "tool_card_drafts");
  await mkdir(draftsDir, { recursive: true });

  for (const [sourceId, drafts] of draftsBySource) {
    const jsonl = drafts.length > 0 ? `${drafts.map((draft) => JSON.stringify(draft)).join("\n")}\n` : "";
    await writeFile(join(draftsDir, `${sourceId}.jsonl`), jsonl, "utf8");
  }
}

async function writeOverrideRecords(outputDir: string, overrideRecords: OverrideRecord[]): Promise<void> {
  const overridesDir = join(outputDir, "data", "overrides");
  await mkdir(overridesDir, { recursive: true });
  await writeFile(
    join(overridesDir, "override_records.json"),
    JSON.stringify(
      {
        schema_version: "override_records.v1",
        records: overrideRecords
      },
      null,
      2
    ),
    "utf8"
  );
}

async function writeReviewQueue(outputDir: string, reviewQueue: ToolCardReviewQueue): Promise<void> {
  const reviewQueueDir = join(outputDir, "data", "review_queue");
  await mkdir(reviewQueueDir, { recursive: true });
  await writeFile(join(reviewQueueDir, "tool_card_drafts.json"), JSON.stringify(reviewQueue, null, 2), "utf8");
}

async function writeApprovalRequests(outputDir: string, approvalRequests: ToolCardApprovalRequests): Promise<void> {
  const approvalRequestsDir = join(outputDir, "data", "approval_requests");
  await mkdir(approvalRequestsDir, { recursive: true });
  await writeFile(join(approvalRequestsDir, "tool_card_drafts.json"), JSON.stringify(approvalRequests, null, 2), "utf8");
  await writeFile(join(approvalRequestsDir, "approval_record_templates.jsonl"), serializeApprovalRecordTemplates(approvalRequests), "utf8");
}

function serializeApprovalRecordTemplates(approvalRequests: ToolCardApprovalRequests): string {
  const lines = approvalRequests.items
    .map((item) =>
      JSON.stringify({
        ...item.approval_record_template,
        decision_options: item.decision_options,
        duplicate_of_tool_ids: item.duplicate_of_tool_ids,
        duplicate_of_draft_tool_ids: item.duplicate_of_draft_tool_ids,
        validation_errors: item.validation_errors,
        validation_warnings: item.validation_warnings
      })
    )
    .join("\n");
  return lines ? `${lines}\n` : "";
}

async function writeFieldProvenance(outputDir: string, fieldProvenance: ToolCardFieldValueProvenance): Promise<void> {
  const fieldProvenanceDir = join(outputDir, "data", "field_provenance");
  await mkdir(fieldProvenanceDir, { recursive: true });
  await writeFile(join(fieldProvenanceDir, "tool_card_fields.json"), JSON.stringify(fieldProvenance, null, 2), "utf8");
}

async function writeReleaseAdmission(outputDir: string, releaseAdmission: ToolCardReleaseAdmission): Promise<void> {
  const releaseAdmissionDir = join(outputDir, "data", "release_admission");
  await mkdir(releaseAdmissionDir, { recursive: true });
  await writeFile(join(releaseAdmissionDir, "tool_card_drafts.json"), JSON.stringify(releaseAdmission, null, 2), "utf8");
}

async function writeAutoReview(outputDir: string, autoReview: ToolCardAutoReview): Promise<void> {
  const autoReviewDir = join(outputDir, "data", "auto_review");
  await mkdir(autoReviewDir, { recursive: true });
  await writeFile(join(autoReviewDir, "tool_card_drafts.json"), JSON.stringify(autoReview, null, 2), "utf8");
}

async function writePromotionCandidates(outputDir: string, promotionCandidates: ToolCardPromotionCandidates): Promise<void> {
  const promotionCandidatesDir = join(outputDir, "data", "promotion_candidates");
  await mkdir(promotionCandidatesDir, { recursive: true });
  await writeFile(join(promotionCandidatesDir, "tool_cards.json"), JSON.stringify(promotionCandidates, null, 2), "utf8");
}

async function writePromotionPlan(outputDir: string, promotionPlan: ToolCardPromotionPlan): Promise<void> {
  const promotionCandidatesDir = join(outputDir, "data", "promotion_candidates");
  await mkdir(promotionCandidatesDir, { recursive: true });
  await writeFile(join(promotionCandidatesDir, "promotion_plan.json"), JSON.stringify(promotionPlan, null, 2), "utf8");
}

async function writePromotionCheck(outputDir: string, promotionCheck: ToolCardPromotionCheck): Promise<void> {
  const promotionCandidatesDir = join(outputDir, "data", "promotion_candidates");
  await mkdir(promotionCandidatesDir, { recursive: true });
  await writeFile(join(promotionCandidatesDir, "promotion_check.json"), JSON.stringify(promotionCheck, null, 2), "utf8");
}

async function writeApprovalArtifact(outputDir: string, approvalArtifact: ApprovalArtifact): Promise<void> {
  const approvalsDir = join(outputDir, "data", "approvals");
  await mkdir(approvalsDir, { recursive: true });
  await writeFile(join(approvalsDir, "approval_records.json"), JSON.stringify(approvalArtifact, null, 2), "utf8");
}

async function writeDuplicateReport(outputDir: string, duplicateReport: ToolCardDuplicateReport): Promise<void> {
  const dedupDir = join(outputDir, "data", "dedup");
  await mkdir(dedupDir, { recursive: true });
  await writeFile(join(dedupDir, "tool_card_duplicates.json"), JSON.stringify(duplicateReport, null, 2), "utf8");
}
