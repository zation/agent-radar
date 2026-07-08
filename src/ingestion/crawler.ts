import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RawSourceSnapshot, SourceDefinition } from "../schema.js";

export interface CrawlEnabledSourcesOptions {
  sources: SourceDefinition[];
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
}

export async function crawlEnabledSources(options: CrawlEnabledSourcesOptions): Promise<RawSourceSnapshot[]> {
  const now = options.now ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? createDefaultFetch();
  const snapshots: RawSourceSnapshot[] = [];

  for (const source of options.sources) {
    snapshots.push(await crawlSource(source, options.outputDir, now, fetchImpl));
  }

  return snapshots;
}

async function crawlSource(source: SourceDefinition, outputDir: string, now: string, fetchImpl: typeof fetch): Promise<RawSourceSnapshot> {
  const request = buildSourceRequest(source);

  try {
    const response = await fetchImpl(request.url, { headers: request.headers });
    const content = await response.text();
    const contentType = response.headers.get("content-type") ?? undefined;
    const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const extension = contentType?.includes("json") ? "json" : "txt";
    const contentPath = join("data", "raw", source.id, now.slice(0, 10), `${contentHash.replace("sha256:", "")}.${extension}`);
    const requestMeta = readSafeRequestMeta(response.headers);
    const snapshot: RawSourceSnapshot = {
      id: `${source.id}-${now.slice(0, 10).replaceAll("-", "")}-${contentHash.slice(7, 15)}`,
      schema_version: "raw_snapshot.v1",
      source_id: source.id,
      source_url: request.url,
      fetched_at: now,
      fetch_method: source.collection_method === "manual" ? "manual" : source.collection_method === "api" ? "api" : "http",
      status: response.ok ? "success" : "failed",
      http_status: response.status,
      content_type: contentType,
      content_hash: contentHash,
      content_path: contentPath,
      request_meta: requestMeta,
      error: response.ok ? undefined : { code: "http_error", message: `HTTP ${response.status}` }
    };

    await writeSnapshotFiles(outputDir, contentPath, content, snapshot);
    return snapshot;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown crawl error";
    const content = JSON.stringify({ error: message });
    const contentHash = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    const contentPath = join("data", "raw", source.id, now.slice(0, 10), `${contentHash.replace("sha256:", "")}.json`);
    const snapshot: RawSourceSnapshot = {
      id: `${source.id}-${now.slice(0, 10).replaceAll("-", "")}-${contentHash.slice(7, 15)}`,
      schema_version: "raw_snapshot.v1",
      source_id: source.id,
      source_url: request.url,
      fetched_at: now,
      fetch_method: source.collection_method === "manual" ? "manual" : source.collection_method === "api" ? "api" : "http",
      status: "failed",
      content_type: "application/json",
      content_hash: contentHash,
      content_path: contentPath,
      error: { code: "crawl_failed", message }
    };

    await writeSnapshotFiles(outputDir, contentPath, content, snapshot);
    return snapshot;
  }
}

function buildSourceRequest(source: SourceDefinition): { url: string; headers: HeadersInit } {
  if (source.parser === "github_topic_parser") {
    const topic = parseGitHubTopic(source.url);
    if (topic) {
      const params = new URLSearchParams({
        q: `topic:${topic}`,
        sort: "stars",
        order: "desc",
        per_page: "20"
      });

      return {
        url: `https://api.github.com/search/repositories?${params.toString()}`,
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "agent-radar-crawler"
        }
      };
    }
  }
  if (source.parser === "github_repo_parser") {
    const repo = parseGitHubRepo(source.url);
    if (repo) {
      return {
        url: `https://api.github.com/repos/${repo}`,
        headers: {
          accept: "application/vnd.github+json",
          "user-agent": "agent-radar-crawler"
        }
      };
    }
  }

  return { url: source.url, headers: {} };
}

function createDefaultFetch(): typeof fetch {
  return (url, init) => fetch(url, init);
}

function readSafeRequestMeta(headers: Headers): Record<string, string> {
  const meta: Record<string, string> = {};
  const etag = headers.get("etag");
  const lastModified = headers.get("last-modified");
  const rateLimitLimit = headers.get("x-ratelimit-limit");
  const rateLimitRemaining = headers.get("x-ratelimit-remaining");
  const rateLimitReset = headers.get("x-ratelimit-reset");
  if (etag) meta.etag = etag;
  if (lastModified) meta.last_modified = lastModified;
  if (rateLimitLimit) meta.rate_limit_limit = rateLimitLimit;
  if (rateLimitRemaining) meta.rate_limit_remaining = rateLimitRemaining;
  if (rateLimitReset) meta.rate_limit_reset = rateLimitReset;
  return meta;
}

function parseGitHubTopic(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "github.com") return undefined;
    const [, namespace, topic] = url.pathname.split("/");
    return namespace === "topics" && topic ? topic : undefined;
  } catch {
    return undefined;
  }
}

function parseGitHubRepo(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    if (url.hostname !== "github.com") return undefined;
    const [, owner, repo] = url.pathname.split("/");
    return owner && repo ? `${owner}/${repo}` : undefined;
  } catch {
    return undefined;
  }
}

async function writeSnapshotFiles(outputDir: string, contentPath: string, content: string, snapshot: RawSourceSnapshot): Promise<void> {
  const absoluteContentPath = join(outputDir, contentPath);
  await mkdir(dirname(absoluteContentPath), { recursive: true });
  await writeFile(absoluteContentPath, content, "utf8");
  await writeFile(`${absoluteContentPath}.meta.json`, JSON.stringify(snapshot, null, 2), "utf8");
}
