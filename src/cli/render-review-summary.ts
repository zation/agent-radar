import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderCompactReviewSummaryMarkdown, type McpSmokeSummary } from "../preview/github-summary.js";
import type { ArtifactManifest } from "../preview/manifest.js";

const distDir = process.env.AGENT_RADAR_PREVIEW_DIST_DIR ?? "dist-pages";
const refName = process.env.GITHUB_REF_NAME ?? "local";
const sha = process.env.GITHUB_SHA ?? "local";
const deployOutput = process.env.DEPLOY_OUTPUT;
const smokePath = process.env.AGENT_RADAR_MCP_SMOKE_RESULT ?? "mcp-smoke-result.json";

const manifest = JSON.parse(await readFile(join(distDir, "artifact-manifest.json"), "utf8")) as ArtifactManifest;
const mcpSmoke = await readMcpSmokeSummary(smokePath);

process.stdout.write(renderCompactReviewSummaryMarkdown(manifest, { refName, sha, deployOutput, mcpSmoke }));

async function readMcpSmokeSummary(path: string): Promise<McpSmokeSummary | undefined> {
  try {
    const raw = await readFile(path, "utf8");
    const lines = raw.split(/\n/);
    const start = lines.findIndex((line) => line.trim().startsWith("{"));
    if (start === -1) return undefined;
    const smoke = JSON.parse(lines.slice(start).join("\n")) as {
      endpoint?: string;
      summary?: { passed?: number; total?: number };
    };
    return {
      endpoint: smoke.endpoint ?? "unknown",
      passed: smoke.summary?.passed ?? 0,
      total: smoke.summary?.total ?? 0,
      skipped: false
    };
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return { endpoint: "not configured", passed: 0, total: 0, skipped: true };
    }
    throw error;
  }
}
