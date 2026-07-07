import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { crawlEnabledSources } from "./crawler.js";
import { parseSnapshot } from "./parser.js";
import { getEnabledSources, sourceRegistry } from "./source-registry.js";
import type { RawSourceSnapshot, SourceRecord } from "../schema.js";

export interface RunIngestionOptions {
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
}

export interface RunIngestionResult {
  snapshots: RawSourceSnapshot[];
  sourceRecords: SourceRecord[];
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

  return {
    snapshots,
    sourceRecords: [...recordsBySource.values()].flat()
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
