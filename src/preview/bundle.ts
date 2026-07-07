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
  await writeFile(join(options.distDir, "artifact-manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
}
