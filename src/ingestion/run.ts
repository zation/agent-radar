import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crawlEnabledSources } from "./crawler.js";
import { buildToolCardDuplicateReport, type ToolCardDuplicateReport } from "./deduper.js";
import { normalizeToolCardDrafts, type OverrideRecord } from "./normalizer.js";
import { parseSnapshot } from "./parser.js";
import { buildToolCardReviewQueue, type ToolCardReviewQueue } from "./review-queue.js";
import { getEnabledSources, sourceRegistry } from "./source-registry.js";
import { seedToolCards } from "../data/seed-tool-cards.js";
import type { RawSourceSnapshot, SourceRecord, ToolCard } from "../schema.js";

export interface RunIngestionOptions {
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
  existingToolCards?: ToolCard[];
  overrideRecords?: OverrideRecord[];
}

export interface RunIngestionResult {
  snapshots: RawSourceSnapshot[];
  sourceRecords: SourceRecord[];
  toolCardDrafts: ToolCard[];
  overrideRecords: OverrideRecord[];
  duplicateReport: ToolCardDuplicateReport;
  reviewQueue: ToolCardReviewQueue;
}

export async function runIngestion(options: RunIngestionOptions): Promise<RunIngestionResult> {
  const now = options.now ?? new Date().toISOString();
  const enabledSources = getEnabledSources(sourceRegistry);
  const snapshots = await crawlEnabledSources({
    sources: enabledSources,
    outputDir: options.outputDir,
    now,
    fetchImpl: options.fetchImpl
  });
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
  const draftsBySource = buildToolCardDrafts(recordsBySource, overrideRecords);
  await writeToolCardDrafts(options.outputDir, draftsBySource);
  const sourceRecords = [...recordsBySource.values()].flat();
  const toolCardDrafts = [...draftsBySource.values()].flat();
  const existingToolCards = options.existingToolCards ?? seedToolCards;
  const duplicateReport = buildToolCardDuplicateReport(toolCardDrafts, existingToolCards, now);
  await writeDuplicateReport(options.outputDir, duplicateReport);
  const reviewQueue = buildToolCardReviewQueue(toolCardDrafts, sourceRecords, existingToolCards, now);
  await writeReviewQueue(options.outputDir, reviewQueue);

  return {
    snapshots,
    sourceRecords,
    toolCardDrafts,
    overrideRecords,
    duplicateReport,
    reviewQueue
  };
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

async function writeDuplicateReport(outputDir: string, duplicateReport: ToolCardDuplicateReport): Promise<void> {
  const dedupDir = join(outputDir, "data", "dedup");
  await mkdir(dedupDir, { recursive: true });
  await writeFile(join(dedupDir, "tool_card_duplicates.json"), JSON.stringify(duplicateReport, null, 2), "utf8");
}
