import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { runIngestion } from "../ingestion/run.js";
import { createPreviewBundle } from "../preview/bundle.js";

const execFileAsync = promisify(execFile);

const distDir = process.env.AGENT_RADAR_PREVIEW_DIST_DIR ?? "dist-pages";
const gitSha = process.env.GITHUB_SHA ?? (await readGitSha());
const builtAt = process.env.AGENT_RADAR_PREVIEW_BUILT_AT ?? new Date().toISOString();
const providerModel = process.env.AGENT_RADAR_LLM_MODEL ?? "gpt-4.1";

const ingestion = await runIngestion({ outputDir: "." });
await createPreviewBundle({
  distDir,
  ingestion,
  gitSha,
  builtAt,
  providerModel
});

console.log(
  JSON.stringify(
    {
      distDir,
      gitSha,
      review: `${distDir}/review/ingestion.md`,
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
