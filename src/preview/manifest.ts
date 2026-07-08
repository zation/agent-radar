import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import type { EvalSummary } from "../eval/runner.js";

export interface ArtifactManifest {
  schema_version: "artifact_manifest.v1";
  git_sha: string;
  built_at: string;
  data_version: string;
  eval: {
    passed: number;
    total: number;
    model: string;
    failure_categories: Record<string, number>;
  };
  checksums: Record<string, string>;
}

export interface BuildArtifactManifestOptions {
  distDir: string;
  gitSha: string;
  builtAt: string;
  providerModel: string;
}

export async function buildArtifactManifest(options: BuildArtifactManifestOptions): Promise<ArtifactManifest> {
  const dataManifest = JSON.parse(await readFile(join(options.distDir, "data", "manifest.json"), "utf8")) as { data_version?: string };
  const evalSummary = JSON.parse(await readFile(join(options.distDir, "data", "eval_summary.json"), "utf8")) as EvalSummary;

  return {
    schema_version: "artifact_manifest.v1",
    git_sha: options.gitSha,
    built_at: options.builtAt,
    data_version: dataManifest.data_version ?? "unknown",
    eval: {
      passed: evalSummary.passed,
      total: evalSummary.total,
      model: options.providerModel,
      failure_categories: countEvalFailureCategories(evalSummary)
    },
    checksums: await checksumFiles(options.distDir)
  };
}

function countEvalFailureCategories(summary: EvalSummary): Record<string, number> {
  return summary.results.reduce<Record<string, number>>((counts, result) => {
    const category = result.failure_category;
    counts[category] = (counts[category] ?? 0) + 1;
    return counts;
  }, {});
}

async function checksumFiles(rootDir: string): Promise<Record<string, string>> {
  const files = await listFiles(rootDir);
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(join(rootDir, file));
      return [file, `sha256:${createHash("sha256").update(content).digest("hex")}`] as const;
    })
  );
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

async function listFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(rootDir, absolutePath)));
    } else if (entry.isFile()) {
      files.push(relative(rootDir, absolutePath));
    }
  }

  return files;
}
