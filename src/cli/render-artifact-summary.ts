import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { renderArtifactManifestSummaryMarkdown } from "../preview/github-summary.js";
import type { ArtifactManifest } from "../preview/manifest.js";

const distDir = process.env.AGENT_RADAR_PREVIEW_DIST_DIR ?? "dist-pages";
const manifest = JSON.parse(await readFile(join(distDir, "artifact-manifest.json"), "utf8")) as ArtifactManifest;

process.stdout.write(renderArtifactManifestSummaryMarkdown(manifest));
