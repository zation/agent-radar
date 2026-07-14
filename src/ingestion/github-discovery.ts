import { createHash } from "node:crypto";
import type { GitHubDiscoveryConfig } from "../schema.js";

export const GITHUB_SKILL_LIMITS = {
  maxSearchBytes: 1_048_576,
  maxTreeBytes: 5_242_880,
  maxManifestBytes: 262_144,
  maxSourceBytes: 8_388_608,
  maxPathLength: 512,
  maxRedirects: 3,
} as const;

export interface GitHubDiscoveryRepository {
  full_name: string;
  html_url: string;
  default_branch: string;
  description?: string;
  stargazers_count?: number;
  license?: { spdx_id?: string; name?: string } | null;
  pushed_at?: string;
  topics?: string[];
  homepage?: string;
}

export interface SkillManifestEntry {
  path: string;
  blob_sha: string;
}

export function buildGitHubDiscoverySearchUrl(config: GitHubDiscoveryConfig): string {
  const params = new URLSearchParams({
    q: config.query,
    sort: config.sort,
    order: config.order,
    per_page: String(config.repository_limit),
  });
  return `https://api.github.com/search/repositories?${params.toString()}`;
}

export function buildGitHubTreeUrl(repository: GitHubDiscoveryRepository): string {
  return `https://api.github.com/repos/${repository.full_name}/git/trees/${encodeURIComponent(repository.default_branch)}?recursive=1`;
}

export function buildRawGitHubManifestUrl(repository: GitHubDiscoveryRepository, path: string): string {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `https://raw.githubusercontent.com/${repository.full_name}/${encodeURIComponent(repository.default_branch)}/${encodedPath}`;
}

export function selectTopRepositories(payload: unknown, limit: number): GitHubDiscoveryRepository[] {
  if (!isRecord(payload) || !Array.isArray(payload.items)) return [];
  return payload.items
    .filter(isGitHubRepository)
    .slice(0, limit);
}

export function selectSkillManifests(payload: unknown): SkillManifestEntry[] {
  if (!isRecord(payload) || payload.truncated === true || !Array.isArray(payload.tree)) return [];
  return payload.tree
    .filter(isTreeBlob)
    .filter((item) => item.mode !== "120000")
    .filter((item) => item.path.length <= GITHUB_SKILL_LIMITS.maxPathLength)
    .filter((item) => /^skills\/(?!\.|.*\/\.)(?!.*(?:fixture|benchmark|generated|template))[^\0]*\/SKILL\.md$/i.test(item.path))
    .filter((item) => !item.path.split("/").includes(".."))
    .map((item) => ({ path: item.path, blob_sha: item.sha }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function isTruncatedTree(payload: unknown): boolean {
  return isRecord(payload) && payload.truncated === true;
}

export function gitBlobSha(content: Uint8Array): string {
  return createHash("sha1")
    .update(`blob ${content.byteLength}\0`)
    .update(content)
    .digest("hex");
}

export function isAllowedGitHubDiscoveryUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && (url.hostname === "api.github.com" || url.hostname === "raw.githubusercontent.com");
  } catch {
    return false;
  }
}

function isGitHubRepository(value: unknown): value is GitHubDiscoveryRepository {
  return isRecord(value)
    && typeof value.full_name === "string"
    && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.full_name)
    && typeof value.html_url === "string"
    && typeof value.default_branch === "string"
    && value.default_branch.length > 0;
}

function isTreeBlob(value: unknown): value is { path: string; type: "blob"; mode?: string; sha: string } {
  return isRecord(value)
    && value.type === "blob"
    && typeof value.path === "string"
    && typeof value.sha === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
