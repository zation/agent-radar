import { access, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export const DEV_DATA_FILES = [
  "tool_cards.jsonl",
  "ratings.jsonl",
  "search_index.json",
  "golden_queries.json",
  "eval_summary.json",
] as const;

export interface EnsureDevDataOptions {
  dataDir: string;
  productionOrigin: string;
  fetchImpl?: typeof fetch;
}

export interface EnsureDevDataResult {
  source: "local" | "production";
  fileCount: number;
}

export async function ensureDevData(options: EnsureDevDataOptions): Promise<EnsureDevDataResult> {
  if (await hasValidLocalData(options.dataDir)) {
    return { source: "local", fileCount: DEV_DATA_FILES.length };
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const origin = normalizeProductionOrigin(options.productionOrigin);
  await mkdir(dirname(options.dataDir), { recursive: true });
  const temporaryDir = await mkdtemp(`${options.dataDir}.download-`);

  try {
    for (const path of DEV_DATA_FILES) {
      const url = `${origin}/data/${path}`;
      const response = await fetchImpl(url);
      if (!response.ok) throw new Error(`Production UI artifact ${url} returned HTTP ${response.status}.`);
      if ((response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
        throw new Error(`Production UI artifact ${url} returned HTML instead of data.`);
      }
      const content = await response.text();
      validateArtifact(path, content, url);
      await writeFile(join(temporaryDir, path), content, "utf8");
    }

    await mkdir(options.dataDir, { recursive: true });
    for (const path of DEV_DATA_FILES) await rename(join(temporaryDir, path), join(options.dataDir, path));
    return { source: "production", fileCount: DEV_DATA_FILES.length };
  } finally {
    await rm(temporaryDir, { recursive: true, force: true });
  }
}

async function hasValidLocalData(dataDir: string): Promise<boolean> {
  try {
    for (const path of DEV_DATA_FILES) {
      const filePath = join(dataDir, path);
      await access(filePath);
      validateArtifact(path, await readFile(filePath, "utf8"), filePath);
    }
    return true;
  } catch {
    return false;
  }
}

function validateArtifact(path: string, content: string, source: string): void {
  try {
    if (path.endsWith(".jsonl")) {
      const lines = content.split("\n").map((line) => line.trim()).filter(Boolean);
      if (lines.length === 0) throw new Error("empty JSONL");
      for (const line of lines) JSON.parse(line);
      return;
    }
    JSON.parse(content);
  } catch {
    throw new Error(`Production UI artifact ${source} could not be parsed.`);
  }
}

function normalizeProductionOrigin(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("Production UI origin must be an HTTPS origin without credentials, path, query, or hash.");
  }
  return url.origin;
}
