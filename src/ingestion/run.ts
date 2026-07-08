import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crawlEnabledSources } from "./crawler.js";
import { parseSnapshot } from "./parser.js";
import { getEnabledSources, sourceRegistry } from "./source-registry.js";
import type { RawSourceSnapshot, SourceRecord, ToolCard } from "../schema.js";

export interface RunIngestionOptions {
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
}

export interface RunIngestionResult {
  snapshots: RawSourceSnapshot[];
  sourceRecords: SourceRecord[];
  toolCardDrafts: ToolCard[];
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
  const draftsBySource = buildToolCardDrafts(recordsBySource);
  await writeToolCardDrafts(options.outputDir, draftsBySource);

  return {
    snapshots,
    sourceRecords: [...recordsBySource.values()].flat(),
    toolCardDrafts: [...draftsBySource.values()].flat()
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

function buildToolCardDrafts(recordsBySource: Map<string, SourceRecord[]>): Map<string, ToolCard[]> {
  const draftsBySource = new Map<string, ToolCard[]>();

  for (const [sourceId, records] of recordsBySource) {
    const drafts = records
      .filter((record) => record.record_type === "manual" && !record.warnings?.length)
      .map((record) => buildManualToolCardDraft(record))
      .filter((draft): draft is ToolCard => Boolean(draft));
    draftsBySource.set(sourceId, drafts);
  }

  return draftsBySource;
}

function buildManualToolCardDraft(record: SourceRecord): ToolCard | undefined {
  const rawToolCard = record.raw_fields;
  if (!isToolCard(rawToolCard)) return undefined;

  return {
    ...rawToolCard,
    evidence_refs: [record.id],
    updated_at: record.parsed_at
  };
}

function isToolCard(value: unknown): value is ToolCard {
  if (!isRecord(value)) return false;

  return (
    value.schema_version === "tool_card.v1" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.source_urls) &&
    Array.isArray(value.use_cases) &&
    Array.isArray(value.not_for) &&
    Array.isArray(value.permissions) &&
    typeof value.security === "object" &&
    value.security !== null &&
    typeof value.confidence === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

async function writeToolCardDrafts(outputDir: string, draftsBySource: Map<string, ToolCard[]>): Promise<void> {
  const draftsDir = join(outputDir, "data", "tool_card_drafts");
  await mkdir(draftsDir, { recursive: true });

  for (const [sourceId, drafts] of draftsBySource) {
    const jsonl = drafts.length > 0 ? `${drafts.map((draft) => JSON.stringify(draft)).join("\n")}\n` : "";
    await writeFile(join(draftsDir, `${sourceId}.jsonl`), jsonl, "utf8");
  }
}
