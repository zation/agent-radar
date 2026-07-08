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
  crawl_audit?: {
    total: number;
    success: number;
    partial: number;
    failed: number;
  };
  source_registry_diff?: {
    added: number;
    removed: number;
    changed: number;
  };
  source_registry_review?: {
    total_requirements: number;
    confirmed: number;
    rejected: number;
    needs_changes: number;
    pending: number;
  };
  source_registry_review_requests?: {
    pending_review: number;
    confirmation_required: number;
  };
  tool_card_url_validation?: {
    checked: number;
    reachable: number;
    failed: number;
    skipped: number;
  };
  tool_card_field_provenance?: {
    cards_checked: number;
    fields_checked: number;
    covered: number;
    covered_by_manual_review: number;
    missing: number;
  };
  ingestion_review?: {
    approvals: {
      approved: number;
      rejected: number;
      needs_changes: number;
    };
  };
  approval_requests?: {
    pending_approval: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  field_value_provenance?: {
    tool_cards: number;
    field_values: number;
  };
  release_admission?: {
    eligible_for_publish: number;
    blocked: number;
  };
  promotion_candidates?: {
    candidates: number;
  };
  promotion_plan?: {
    candidates: number;
    manual_merge_required: boolean;
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
  const sourceRegistryDiff = await readSourceRegistryDiffSummary(options.distDir);
  const sourceRegistryReview = await readSourceRegistryReviewSummary(options.distDir);
  const sourceRegistryReviewRequests = await readSourceRegistryReviewRequestsSummary(options.distDir);
  const toolCardUrlValidation = await readToolCardUrlValidationSummary(options.distDir);
  const toolCardFieldProvenance = await readToolCardFieldProvenanceSummary(options.distDir);

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
    ...(sourceRegistryDiff ? { source_registry_diff: sourceRegistryDiff } : {}),
    ...(sourceRegistryReview ? { source_registry_review: sourceRegistryReview } : {}),
    ...(sourceRegistryReviewRequests ? { source_registry_review_requests: sourceRegistryReviewRequests } : {}),
    ...(toolCardUrlValidation ? { tool_card_url_validation: toolCardUrlValidation } : {}),
    ...(toolCardFieldProvenance ? { tool_card_field_provenance: toolCardFieldProvenance } : {}),
    checksums: await checksumFiles(options.distDir)
  };
}

async function readSourceRegistryDiffSummary(distDir: string): Promise<ArtifactManifest["source_registry_diff"] | undefined> {
  try {
    const diff = JSON.parse(await readFile(join(distDir, "data", "source_registry_diff.json"), "utf8")) as {
      summary?: ArtifactManifest["source_registry_diff"];
    };
    return diff.summary;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readSourceRegistryReviewRequestsSummary(distDir: string): Promise<ArtifactManifest["source_registry_review_requests"] | undefined> {
  try {
    const requests = JSON.parse(await readFile(join(distDir, "data", "source_registry_review_requests.json"), "utf8")) as {
      summary?: ArtifactManifest["source_registry_review_requests"];
    };
    return requests.summary;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readToolCardUrlValidationSummary(distDir: string): Promise<ArtifactManifest["tool_card_url_validation"] | undefined> {
  try {
    const validation = JSON.parse(await readFile(join(distDir, "data", "tool_card_url_validation.json"), "utf8")) as {
      summary?: ArtifactManifest["tool_card_url_validation"];
    };
    return validation.summary;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readToolCardFieldProvenanceSummary(distDir: string): Promise<ArtifactManifest["tool_card_field_provenance"] | undefined> {
  try {
    const provenance = JSON.parse(await readFile(join(distDir, "data", "tool_card_field_provenance.json"), "utf8")) as {
      summary?: ArtifactManifest["tool_card_field_provenance"];
    };
    return provenance.summary;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readSourceRegistryReviewSummary(distDir: string): Promise<ArtifactManifest["source_registry_review"] | undefined> {
  try {
    const review = JSON.parse(await readFile(join(distDir, "data", "source_registry_review.json"), "utf8")) as {
      summary?: ArtifactManifest["source_registry_review"];
    };
    return review.summary;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
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
