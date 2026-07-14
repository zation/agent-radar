import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { isDeepStrictEqual } from "node:util";
import type { EvalSummary } from "../eval/runner.js";
import { validateEvalTokenUsageArtifact } from "../eval/token-usage.js";

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
  eval_token_usage: {
    schema_version: "eval_token_usage.v1";
    providers: Array<{ provider: string; model_identifier: string }>;
    case_count: number;
    request_attempts: number;
    reported_attempts: number;
    unavailable_attempts: number;
    retry_count: number;
    input_tokens: number;
    cached_input_tokens: number;
    cached_usage_available_attempts: number;
    output_tokens: number;
    total_tokens: number;
    average_total_tokens_per_reported_attempt: number | null;
    highest_usage_cases: Array<{ case_id: string; total_tokens: number }>;
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
    overrides?: number;
  };
  intervention_requests?: {
    pending_intervention: number;
    duplicate_review_required: number;
    blocked_validation: number;
  };
  field_value_provenance?: {
    tool_cards: number;
    field_values: number;
  };
  auto_review?: {
    promote: number;
    keep_draft: number;
    needs_review: number;
    reject: number;
    retire: number;
  };
  release_admission?: {
    eligible_for_publish: number;
    blocked: number;
  };
  discovery_candidates?: {
    candidates: number;
    pending_production_gate: number;
  };
  promotion_candidates?: {
    candidates: number;
  };
  promotion_plan?: {
    candidates: number;
    reliable_publish_ready: boolean;
  };
  promotion_check?: {
    candidates: number;
    ready_for_publish: number;
    blocked: number;
    duplicate_tool_ids: number;
    validation_errors: number;
    validation_warnings: number;
    passed: boolean;
  };
  data_quality?: {
    status: "pass" | "blocked";
    blocking: number;
    reason_codes: string[];
  };
  review_summary?: {
    status: "pass" | "blocked";
    blocking: number;
    warnings: number;
  };
  feedback?: {
    rules_version: "feedback_rules.v0.1";
    vote_snapshot_checksum: string;
    processing_plan_checksum: string;
    d1_rows: number;
    affected_tools: number;
    accepted: number;
    rejected: number;
    needs_human_review: number;
    deprecated: number;
    max_absolute_adjustment: number;
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
  if (!evalSummary.release?.release_id || !evalSummary.release.commit_sha) throw new Error("eval_token_usage_eval_release_missing");
  const evalTokenUsageArtifact = validateEvalTokenUsageArtifact(
    JSON.parse(await readFile(join(options.distDir, "reports", "eval_token_usage.json"), "utf8")) as unknown,
    evalSummary.release,
  );
  const evalCaseIds = evalSummary.results.map(({ case_id }) => case_id).sort(compareText);
  const usageCaseIds = evalTokenUsageArtifact.cases.map(({ case_id }) => case_id);
  if (!isDeepStrictEqual(evalCaseIds, usageCaseIds)) throw new Error("eval_token_usage_case_identity_mismatch");
  const sourceRegistryDiff = await readSourceRegistryDiffSummary(options.distDir);
  const sourceRegistryReview = await readSourceRegistryReviewSummary(options.distDir);
  const sourceRegistryReviewRequests = await readSourceRegistryReviewRequestsSummary(options.distDir);
  const toolCardUrlValidation = await readToolCardUrlValidationSummary(options.distDir);
  const toolCardFieldProvenance = await readToolCardFieldProvenanceSummary(options.distDir);
  const dataQuality = await readDataQualitySummary(options.distDir);
  const reviewSummary = await readReviewSummary(options.distDir);
  const checksums = await checksumFiles(options.distDir);
  const feedback = await readFeedbackSummary(options.distDir, checksums);
  if (!checksums["reports/eval_token_usage.json"]) throw new Error("eval_token_usage_checksum_missing");

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
    eval_token_usage: buildEvalTokenUsageManifestSummary(evalTokenUsageArtifact),
    ...(sourceRegistryDiff ? { source_registry_diff: sourceRegistryDiff } : {}),
    ...(sourceRegistryReview ? { source_registry_review: sourceRegistryReview } : {}),
    ...(sourceRegistryReviewRequests ? { source_registry_review_requests: sourceRegistryReviewRequests } : {}),
    ...(toolCardUrlValidation ? { tool_card_url_validation: toolCardUrlValidation } : {}),
    ...(toolCardFieldProvenance ? { tool_card_field_provenance: toolCardFieldProvenance } : {}),
    ...(dataQuality ? { data_quality: dataQuality } : {}),
    ...(reviewSummary ? { review_summary: reviewSummary } : {}),
    ...(feedback ? { feedback } : {}),
    checksums
  };
}

export function buildEvalTokenUsageManifestSummary(
  artifact: ReturnType<typeof validateEvalTokenUsageArtifact>,
): ArtifactManifest["eval_token_usage"] {
  const providers = [...new Map(artifact.cases.flatMap(({ attempts }) => attempts).map(({ provider, model_identifier }) => [
    `${provider}\u0000${model_identifier}`,
    { provider, model_identifier },
  ])).values()].sort((left, right) => compareText(left.provider, right.provider) || compareText(left.model_identifier, right.model_identifier));
  const highestUsageCases = artifact.cases
    .filter(({ reported_attempts }) => reported_attempts > 0)
    .map(({ case_id, total_tokens }) => ({ case_id, total_tokens }))
    .sort((left, right) => right.total_tokens - left.total_tokens || compareText(left.case_id, right.case_id))
    .slice(0, 5);
  return {
    schema_version: artifact.schema_version,
    providers,
    ...artifact.summary,
    highest_usage_cases: highestUsageCases,
  };
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

async function readFeedbackSummary(distDir: string, checksums: Record<string, string>): Promise<ArtifactManifest["feedback"] | undefined> {
  try {
    const [summary, classification, plan] = await Promise.all([
      readFile(join(distDir, "data", "feedback_summary.json"), "utf8").then((text): unknown => JSON.parse(text) as unknown),
      readFile(join(distDir, "data", "feedback_classification.json"), "utf8").then((text): unknown => JSON.parse(text) as unknown),
      readFile(join(distDir, "data", "feedback_processing_plan.json"), "utf8").then((text): unknown => JSON.parse(text) as unknown),
    ]) as [
      { rules_version: "feedback_rules.v0.1"; vote_snapshot_checksum: string; tools: Array<{ applied_adjustment: number }> },
      { classifications: Array<{ decision: string }> },
      { actions: Array<{ labels_to_add: string[] }> },
    ];
    const processingPlanChecksum = checksums["data/feedback_processing_plan.json"];
    if (summary.rules_version !== "feedback_rules.v0.1" || !processingPlanChecksum) throw new Error("feedback_manifest_invalid");
    return {
      rules_version: summary.rules_version,
      vote_snapshot_checksum: summary.vote_snapshot_checksum,
      processing_plan_checksum: processingPlanChecksum,
      d1_rows: await readFile(join(distDir, "data", "feedback_vote_snapshot.json"), "utf8").then((text) => (JSON.parse(text) as { total_row_count: number }).total_row_count),
      affected_tools: summary.tools.length,
      accepted: classification.classifications.filter(({ decision }) => decision === "accepted").length,
      rejected: classification.classifications.filter(({ decision }) => decision === "rejected").length,
      needs_human_review: classification.classifications.filter(({ decision }) => decision === "needs-human-review").length,
      deprecated: plan.actions.filter(({ labels_to_add }) => labels_to_add.includes("feedback-deprecated")).length,
      max_absolute_adjustment: Math.max(0, ...summary.tools.map(({ applied_adjustment }) => Math.abs(applied_adjustment))),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
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

async function readDataQualitySummary(distDir: string): Promise<ArtifactManifest["data_quality"] | undefined> {
  try {
    const report = JSON.parse(await readFile(join(distDir, "data", "data_quality_report.json"), "utf8")) as {
      status?: "pass" | "blocked";
      gates?: Array<{ reason_code?: string; severity?: string }>;
    };
    if (!report.status) return undefined;
    const blocking = (report.gates ?? []).filter((gate) => gate.severity === "blocking");
    return {
      status: report.status,
      blocking: blocking.length,
      reason_codes: blocking.flatMap((gate) => gate.reason_code ? [gate.reason_code] : []),
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function readReviewSummary(distDir: string): Promise<ArtifactManifest["review_summary"] | undefined> {
  try {
    const summary = JSON.parse(await readFile(join(distDir, "data", "review_summary.v2.json"), "utf8")) as {
      status?: "pass" | "blocked";
      blocking_items?: unknown[];
      warning_items?: unknown[];
    };
    if (!summary.status) return undefined;
    return {
      status: summary.status,
      blocking: summary.blocking_items?.length ?? 0,
      warnings: summary.warning_items?.length ?? 0,
    };
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
  const files = (await listArtifactFiles(rootDir)).filter((file) => file !== "artifact-manifest.json");
  const entries = await Promise.all(
    files.map(async (file) => {
      const content = await readFile(join(rootDir, file));
      return [file, `sha256:${createHash("sha256").update(content).digest("hex")}`] as const;
    })
  );
  return Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
}

export async function listArtifactFiles(rootDir: string, currentDir = rootDir): Promise<string[]> {
  const entries = await readdir(currentDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = join(currentDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listArtifactFiles(rootDir, absolutePath)));
    } else if (entry.isFile()) {
      files.push(relative(rootDir, absolutePath));
    }
  }

  return files;
}
