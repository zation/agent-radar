import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "dotenv";
import { createPreviewBundle } from "../preview/bundle.js";
import { DEFAULT_RECOMMENDATION_MODEL } from "../recommendation/provider-registry.js";

const execFileAsync = promisify(execFile);

config({ override: false, quiet: true });

const distDir = process.env.AGENT_RADAR_PREVIEW_DIST_DIR ?? "dist-pages";
const reviewDir = process.env.AGENT_RADAR_REVIEW_DIR ?? "artifacts/review";
const gitSha = process.env.GITHUB_SHA ?? (await readGitSha());
const builtAt = process.env.AGENT_RADAR_PREVIEW_BUILT_AT ?? new Date().toISOString();
const providerModel = process.env.AGENT_RADAR_LLM_MODEL ?? DEFAULT_RECOMMENDATION_MODEL;
const releaseTag = process.env.AGENT_RADAR_RELEASE_TAG
  ?? process.env.AGENT_RADAR_RELEASE_ID
  ?? "all-v0.0.0-dev";

await createPreviewBundle({
  distDir,
  reviewDir,
  gitSha,
  builtAt,
  providerModel,
  releaseTag,
});

console.log(
  JSON.stringify(
    {
      distDir,
      gitSha,
      releaseTag,
      review: `${reviewDir}/ingestion.md`,
      manifest: `${distDir}/artifact-manifest.json`
    },
    null,
    2
  )
);

async function readGitSha(): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"]);
    return stdout.trim();
  } catch {
    return "unknown";
  }
}
