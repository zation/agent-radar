import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DataQualityReport } from "../validation/data-quality-report.js";
import type { ToolCardUrlValidationArtifactV2 } from "../validation/url-checker.js";
import type { SourceRegistryArtifact } from "../ingestion/source-registry.js";
import type { SourceRecord } from "../schema.js";

export interface LoadPreviousReleaseArtifactsOptions {
  urlPath?: string;
  qualityPath?: string;
  sourceRegistryPath?: string;
  ingestionReviewPath?: string;
  restoredRoot?: string;
}

export async function loadPreviousReleaseArtifacts(options: LoadPreviousReleaseArtifactsOptions): Promise<{
  urlValidation?: ToolCardUrlValidationArtifactV2;
  dataQuality?: DataQualityReport;
  sourceRegistry?: SourceRegistryArtifact;
  sourceRecords?: SourceRecord[];
}> {
  const restoredDataDir = options.restoredRoot ? join(options.restoredRoot, "dist-pages", "data") : undefined;
  const urlValidation = await readFirstJson<ToolCardUrlValidationArtifactV2>(
    [options.urlPath, restoredDataDir && join(restoredDataDir, "tool_card_url_validation.v2.json")],
    "tool_card_url_validation.v2",
  );
  const dataQuality = await readFirstJson<DataQualityReport>(
    [options.qualityPath, restoredDataDir && join(restoredDataDir, "data_quality_report.json")],
    "data_quality_report.v1",
  );
  const sourceRegistry = await readFirstJson<SourceRegistryArtifact>(
    [options.sourceRegistryPath, restoredDataDir && join(restoredDataDir, "source_registry.json")],
    "source_registry.v1",
  );
  const ingestionReview = await readFirstJson<{ schema_version: string; result?: { sourceRecords?: SourceRecord[] } }>(
    [options.ingestionReviewPath, restoredDataDir && join(restoredDataDir, "review", "ingestion.json")],
    "ingestion_review_evidence.v1",
  );
  return {
    ...(urlValidation ? { urlValidation } : {}),
    ...(dataQuality ? { dataQuality } : {}),
    ...(sourceRegistry ? { sourceRegistry } : {}),
    ...(ingestionReview?.result?.sourceRecords ? { sourceRecords: ingestionReview.result.sourceRecords } : {}),
  };
}

async function readFirstJson<T extends { schema_version: string }>(
  candidates: Array<string | undefined>,
  schemaVersion: string,
): Promise<T | undefined> {
  for (const path of candidates) {
    if (!path) continue;
    try {
      const value = JSON.parse(await readFile(path, "utf8")) as T;
      if (value.schema_version !== schemaVersion) throw new Error(`${path} must use ${schemaVersion}`);
      return value;
    } catch (error) {
      if (isMissingFile(error)) continue;
      throw error;
    }
  }
  return undefined;
}

function isMissingFile(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}
