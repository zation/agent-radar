import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { RawSourceSnapshot, SourceDefinition } from "../schema.js";
import {
  GITHUB_SKILL_LIMITS,
  buildGitHubDiscoverySearchUrl,
  buildGitHubTreeUrl,
  buildRawGitHubManifestUrl,
  gitBlobSha,
  isAllowedGitHubDiscoveryUrl,
  isTruncatedTree,
  selectSkillManifests,
  selectTopRepositories,
  type GitHubDiscoveryRepository,
  type SkillManifestEntry,
} from "./github-discovery.js";

export interface CrawlEnabledSourcesOptions {
  sources: SourceDefinition[];
  outputDir: string;
  now?: string;
  fetchImpl?: typeof fetch;
}

interface StoredSnapshot {
  snapshot: RawSourceSnapshot;
  content: string;
  bytes: Uint8Array;
}

interface SnapshotRequest {
  url: string;
  headers?: HeadersInit;
  requestMeta?: Record<string, string>;
  maxBytes?: number;
  restrictGitHubHosts?: boolean;
  expectedBlobSha?: string;
}

const githubHeaders = {
  accept: "application/vnd.github+json",
  "user-agent": "agent-radar-crawler",
};

export async function crawlEnabledSources(options: CrawlEnabledSourcesOptions): Promise<RawSourceSnapshot[]> {
  const now = options.now ?? new Date().toISOString();
  const fetchImpl = options.fetchImpl ?? createDefaultFetch();
  const snapshots: RawSourceSnapshot[] = [];

  for (const source of options.sources) {
    if (source.github_discovery?.expansion?.kind === "skill_manifests") {
      snapshots.push(...await crawlGitHubSkillSource(source, options.outputDir, now, fetchImpl));
    } else {
      snapshots.push(await crawlSource(source, options.outputDir, now, fetchImpl));
    }
  }

  return snapshots;
}

async function crawlGitHubSkillSource(source: SourceDefinition, outputDir: string, now: string, fetchImpl: typeof fetch): Promise<RawSourceSnapshot[]> {
  const discovery = source.github_discovery;
  if (!discovery) return [];
  const snapshots: RawSourceSnapshot[] = [];
  let consumedBytes = 0;
  const search = await fetchAndStoreSnapshot(source, outputDir, now, fetchImpl, {
    url: buildGitHubDiscoverySearchUrl(discovery),
    headers: githubHeaders,
    requestMeta: { snapshot_role: "search" },
    maxBytes: GITHUB_SKILL_LIMITS.maxSearchBytes,
    restrictGitHubHosts: true,
  });
  snapshots.push(search.snapshot);
  consumedBytes += search.bytes.byteLength;
  if (search.snapshot.status !== "success") return snapshots;

  const repositories = selectTopRepositories(parseJson(search.content), discovery.repository_limit);
  for (const repository of repositories) {
    const tree = await fetchAndStoreSnapshot(source, outputDir, now, fetchImpl, {
      url: buildGitHubTreeUrl(repository),
      headers: githubHeaders,
      requestMeta: treeMeta(repository),
      maxBytes: remainingLimit(GITHUB_SKILL_LIMITS.maxTreeBytes, consumedBytes),
      restrictGitHubHosts: true,
    });
    consumedBytes += tree.bytes.byteLength;
    const treePayload = parseJson(tree.content);
    if (tree.snapshot.status === "success" && isTruncatedTree(treePayload)) {
      await markSnapshotFailed(outputDir, tree.snapshot, "truncated_tree", "GitHub tree response was truncated");
    }
    snapshots.push(tree.snapshot);
    if (tree.snapshot.status !== "success") continue;

    for (const manifest of selectSkillManifests(treePayload)) {
      const raw = await fetchAndStoreSnapshot(source, outputDir, now, fetchImpl, {
        url: buildRawGitHubManifestUrl(repository, manifest.path),
        headers: { "user-agent": "agent-radar-crawler" },
        requestMeta: manifestMeta(repository, manifest),
        maxBytes: remainingLimit(GITHUB_SKILL_LIMITS.maxManifestBytes, consumedBytes),
        restrictGitHubHosts: true,
        expectedBlobSha: manifest.blob_sha,
      });
      consumedBytes += raw.bytes.byteLength;
      snapshots.push(raw.snapshot);
    }
  }
  return snapshots;
}

function remainingLimit(perRequest: number, consumedBytes: number): number {
  return Math.max(0, Math.min(perRequest, GITHUB_SKILL_LIMITS.maxSourceBytes - consumedBytes));
}

function treeMeta(repository: GitHubDiscoveryRepository): Record<string, string> {
  return {
    snapshot_role: "tree",
    repository: repository.full_name,
    default_branch: repository.default_branch,
  };
}

function manifestMeta(repository: GitHubDiscoveryRepository, manifest: SkillManifestEntry): Record<string, string> {
  return {
    snapshot_role: "skill_manifest",
    repository: repository.full_name,
    default_branch: repository.default_branch,
    skill_path: manifest.path,
    expected_blob_sha: manifest.blob_sha,
  };
}

async function crawlSource(source: SourceDefinition, outputDir: string, now: string, fetchImpl: typeof fetch): Promise<RawSourceSnapshot> {
  const request = buildSourceRequest(source);
  return (await fetchAndStoreSnapshot(source, outputDir, now, fetchImpl, request)).snapshot;
}

async function fetchAndStoreSnapshot(
  source: SourceDefinition,
  outputDir: string,
  now: string,
  fetchImpl: typeof fetch,
  request: SnapshotRequest,
): Promise<StoredSnapshot> {
  try {
    if (request.maxBytes === 0) throw new Error("source_byte_limit_exceeded");
    const response = request.restrictGitHubHosts
      ? await fetchWithBoundedRedirects(fetchImpl, request.url, request.headers)
      : await fetchImpl(request.url, { headers: request.headers });
    const bytes = request.maxBytes === undefined
      ? new Uint8Array(await response.arrayBuffer())
      : await readBodyBounded(response, request.maxBytes);
    const content = new TextDecoder().decode(bytes);
    const contentType = response.headers.get("content-type") ?? undefined;
    const requestMeta = { ...readSafeRequestMeta(response.headers), ...(request.requestMeta ?? {}) };
    const stored = await storeSnapshot(source, outputDir, now, request.url, content, bytes, {
      status: response.ok ? "success" : "failed",
      httpStatus: response.status,
      contentType,
      requestMeta,
      error: response.ok ? undefined : { code: "http_error", message: `HTTP ${response.status}` },
    });
    if (stored.snapshot.status === "success" && request.expectedBlobSha && gitBlobSha(bytes) !== request.expectedBlobSha) {
      await markSnapshotFailed(outputDir, stored.snapshot, "blob_sha_mismatch", "Raw manifest did not match the selected Git tree blob");
    }
    return stored;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown crawl error";
    const content = JSON.stringify({ error: message });
    const bytes = new TextEncoder().encode(content);
    return storeSnapshot(source, outputDir, now, request.url, content, bytes, {
      status: "failed",
      contentType: "application/json",
      requestMeta: request.requestMeta,
      error: { code: "crawl_failed", message },
    });
  }
}

async function storeSnapshot(
  source: SourceDefinition,
  outputDir: string,
  now: string,
  sourceUrl: string,
  content: string,
  bytes: Uint8Array,
  details: {
    status: RawSourceSnapshot["status"];
    httpStatus?: number;
    contentType?: string;
    requestMeta?: Record<string, string>;
    error?: RawSourceSnapshot["error"];
  },
): Promise<StoredSnapshot> {
  const contentHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const extension = details.contentType?.includes("json") ? "json" : "txt";
  const requestSuffix = details.requestMeta?.snapshot_role
    ? `-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 8)}`
    : "";
  const fileStem = `${contentHash.replace("sha256:", "")}${requestSuffix}`;
  const contentPath = join("data", "raw", source.id, now.slice(0, 10), `${fileStem}.${extension}`);
  const snapshot: RawSourceSnapshot = {
    id: `${source.id}-${now.slice(0, 10).replaceAll("-", "")}-${contentHash.slice(7, 15)}${requestSuffix}`,
    schema_version: "raw_snapshot.v1",
    source_id: source.id,
    source_url: sourceUrl,
    fetched_at: now,
    fetch_method: source.collection_method === "manual" ? "manual" : source.collection_method === "api" ? "api" : "http",
    status: details.status,
    http_status: details.httpStatus,
    content_type: details.contentType,
    content_hash: contentHash,
    content_path: contentPath,
    request_meta: details.requestMeta,
    error: details.error,
  };
  await writeSnapshotFiles(outputDir, contentPath, content, snapshot);
  return { snapshot, content, bytes };
}

async function fetchWithBoundedRedirects(fetchImpl: typeof fetch, initialUrl: string, headers?: HeadersInit): Promise<Response> {
  let currentUrl = initialUrl;
  for (let redirects = 0; redirects <= GITHUB_SKILL_LIMITS.maxRedirects; redirects += 1) {
    if (!isAllowedGitHubDiscoveryUrl(currentUrl)) throw new Error("unreviewed_redirect_host");
    const response = await fetchImpl(currentUrl, { headers, redirect: "manual" });
    if (response.status < 300 || response.status >= 400) return response;
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect_without_location");
    if (redirects === GITHUB_SKILL_LIMITS.maxRedirects) throw new Error("redirect_limit_exceeded");
    currentUrl = new URL(location, currentUrl).toString();
  }
  throw new Error("redirect_limit_exceeded");
}

async function readBodyBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new Error("response_byte_limit_exceeded");
    }
    chunks.push(value);
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

export function buildSourceRequest(source: SourceDefinition): { url: string; headers: HeadersInit } {
  if (source.parser === "github_topic_parser" && source.github_discovery && parseGitHubTopic(source.url)) {
    return { url: buildGitHubDiscoverySearchUrl(source.github_discovery), headers: githubHeaders };
  }
  if (source.parser === "github_repo_parser") {
    const repo = parseGitHubRepo(source.url);
    if (repo) return { url: `https://api.github.com/repos/${repo}`, headers: githubHeaders };
  }
  return { url: source.url, headers: {} };
}

function createDefaultFetch(): typeof fetch {
  return (url, init) => fetch(url, init);
}

function readSafeRequestMeta(headers: Headers): Record<string, string> {
  const meta: Record<string, string> = {};
  const mappings = [
    ["etag", "etag"],
    ["last-modified", "last_modified"],
    ["x-ratelimit-limit", "rate_limit_limit"],
    ["x-ratelimit-remaining", "rate_limit_remaining"],
    ["x-ratelimit-reset", "rate_limit_reset"],
  ] as const;
  for (const [header, field] of mappings) {
    const value = headers.get(header);
    if (value) meta[field] = value;
  }
  return meta;
}

function parseGitHubTopic(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const [, namespace, topic] = url.pathname.split("/");
    return url.hostname === "github.com" && namespace === "topics" && topic ? topic : undefined;
  } catch {
    return undefined;
  }
}

function parseGitHubRepo(sourceUrl: string): string | undefined {
  try {
    const url = new URL(sourceUrl);
    const [, owner, repo] = url.pathname.split("/");
    return url.hostname === "github.com" && owner && repo ? `${owner}/${repo}` : undefined;
  } catch {
    return undefined;
  }
}

function parseJson(content: string): unknown {
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return undefined;
  }
}

async function markSnapshotFailed(outputDir: string, snapshot: RawSourceSnapshot, code: string, message: string): Promise<void> {
  snapshot.status = "failed";
  snapshot.error = { code, message };
  await writeFile(join(outputDir, `${snapshot.content_path}.meta.json`), JSON.stringify(snapshot, null, 2), "utf8");
}

async function writeSnapshotFiles(outputDir: string, contentPath: string, content: string, snapshot: RawSourceSnapshot): Promise<void> {
  const absoluteContentPath = join(outputDir, contentPath);
  await mkdir(dirname(absoluteContentPath), { recursive: true });
  await writeFile(absoluteContentPath, content, "utf8");
  await writeFile(`${absoluteContentPath}.meta.json`, JSON.stringify(snapshot, null, 2), "utf8");
}
