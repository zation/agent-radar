import { buildArtifacts } from "../pipeline/build-artifacts.js";
import { loadPreviousReleaseArtifacts } from "../pipeline/previous-artifacts.js";
import { config } from "dotenv";

config({ override: false, quiet: true });
const previous = await loadPreviousReleaseArtifacts({
  urlPath: process.env.AGENT_RADAR_PREVIOUS_URL_VALIDATION,
  qualityPath: process.env.AGENT_RADAR_PREVIOUS_DATA_QUALITY_REPORT,
  sourceRegistryPath: process.env.AGENT_RADAR_PREVIOUS_SOURCE_REGISTRY,
  ingestionReviewPath: process.env.AGENT_RADAR_PREVIOUS_INGESTION_REVIEW,
  restoredRoot: process.env.AGENT_RADAR_PREVIOUS_REVIEWED_ROOT ?? "previous-reviewed-bundle",
});
const summary = await buildArtifacts({
  outputDir: "public",
  generatedAt: new Date().toISOString(),
  requireUrlValidation: true,
  previousUrlValidationV2: previous.urlValidation,
  previousDataQualityReport: previous.dataQuality,
  previousSourceRegistry: previous.sourceRegistry?.sources,
  previousSourceRecords: previous.sourceRecords,
  allowBenchmarkProxyDns: process.env.AGENT_RADAR_ALLOW_BENCHMARK_PROXY_DNS === "true",
});
console.log(JSON.stringify(summary, null, 2));
