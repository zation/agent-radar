import { buildArtifacts } from "../pipeline/build-artifacts.js";
import { loadPreviousReleaseArtifacts } from "../pipeline/previous-artifacts.js";
import { config } from "dotenv";
import { readFile } from "node:fs/promises";
import { validateFeedbackBuildInput } from "../feedback-processing/preparer.js";
import { join } from "node:path";

config({ override: false, quiet: true });
const feedbackPath = process.env.AGENT_RADAR_FEEDBACK_BUILD_INPUT;
if (process.env.CI === "true" && !feedbackPath) throw new Error("AGENT_RADAR_FEEDBACK_BUILD_INPUT is required in CI");
const feedbackBuildInput = feedbackPath
  ? validateFeedbackBuildInput(JSON.parse(await readFile(feedbackPath, "utf8")) as unknown)
  : undefined;
const previous = await loadPreviousReleaseArtifacts({
  urlPath: process.env.AGENT_RADAR_PREVIOUS_URL_VALIDATION,
  qualityPath: process.env.AGENT_RADAR_PREVIOUS_DATA_QUALITY_REPORT,
  sourceRegistryPath: process.env.AGENT_RADAR_PREVIOUS_SOURCE_REGISTRY,
  ingestionReviewPath: process.env.AGENT_RADAR_PREVIOUS_INGESTION_REVIEW,
  restoredRoot: process.env.AGENT_RADAR_PREVIOUS_REVIEWED_ROOT ?? "previous-reviewed-bundle",
});
const previousReviewedRoot = process.env.AGENT_RADAR_PREVIOUS_REVIEWED_ROOT ?? "previous-reviewed-bundle";
const summary = await buildArtifacts({
  outputDir: "public",
  generatedAt: new Date().toISOString(),
  requireUrlValidation: true,
  previousUrlValidationV2: previous.urlValidation,
  previousDataQualityReport: previous.dataQuality,
  previousSourceRegistry: previous.sourceRegistry?.sources,
  previousSourceRecords: previous.sourceRecords,
  allowBenchmarkProxyDns: process.env.AGENT_RADAR_ALLOW_BENCHMARK_PROXY_DNS === "true",
  feedbackBuildInput,
  release: {
    release_id: process.env.AGENT_RADAR_RELEASE_ID ?? "dev",
    commit_sha: process.env.AGENT_RADAR_COMMIT_SHA ?? process.env.GITHUB_SHA ?? "dev",
  },
  previousSkillDataRoot: join(previousReviewedRoot, "dist-pages", "data", "skill"),
});
console.log(JSON.stringify(summary, null, 2));
