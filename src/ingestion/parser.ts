import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Confidence, RawSourceSnapshot, SourceDefinition, SourceRecord, ToolCard } from "../schema.js";

interface ManualSeedPayload {
  tools?: Array<Partial<ToolCard> & { id?: string; name?: string }>;
}

interface GitHubTopicPayload {
  items?: GitHubTopicRepository[];
  repositories?: GitHubTopicRepository[];
}

interface GitHubTopicRepository {
  full_name?: string;
  name?: string;
  html_url?: string;
  description?: string;
  stargazers_count?: number;
  license?: {
    spdx_id?: string;
    name?: string;
  } | null;
  pushed_at?: string;
  topics?: string[];
  homepage?: string;
}

interface NpmPackagePayload {
  name?: string;
  description?: string;
  license?: string;
  repository?: string | { type?: string; url?: string };
  homepage?: string;
  keywords?: string[];
  "dist-tags"?: {
    latest?: string;
  };
  time?: {
    modified?: string;
  } & Record<string, string | undefined>;
}

export const supportedSourceParsers = ["manual_seed_parser", "github_topic_parser", "github_repo_parser", "npm_package_parser", "official_docs_parser"] as const;

export type SupportedSourceParser = (typeof supportedSourceParsers)[number];

export function isSupportedSourceParser(parser: string): parser is SupportedSourceParser {
  return supportedSourceParsers.includes(parser as SupportedSourceParser);
}

export async function parseSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  if (snapshot.status !== "success") return [];
  if (source.parser === "manual_seed_parser") return parseManualSeedSnapshot(snapshot, source, outputDir, now);
  if (source.parser === "github_topic_parser") return parseGitHubTopicSnapshot(snapshot, source, outputDir, now);
  if (source.parser === "github_repo_parser") return parseGitHubRepoSnapshot(snapshot, source, outputDir, now);
  if (source.parser === "npm_package_parser") return parseNpmPackageSnapshot(snapshot, source, outputDir, now);
  if (source.parser === "official_docs_parser") return parseOfficialDocsSnapshot(snapshot, source, outputDir, now);
  return [];
}

async function parseManualSeedSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  const raw = await readFile(join(outputDir, snapshot.content_path), "utf8");
  const payload = JSON.parse(raw) as ManualSeedPayload;
  const tools = Array.isArray(payload.tools) ? payload.tools : [];

  return tools
    .filter((tool) => Boolean(tool.id && tool.name))
    .map((tool) => ({
      id: `${source.id}-${tool.id}-${now.slice(0, 10).replaceAll("-", "")}`,
      schema_version: "source_record.v1",
      snapshot_id: snapshot.id,
      source_id: source.id,
      record_type: "manual",
      name: tool.name ?? tool.id ?? "unknown",
      description: tool.summary,
      urls: Array.isArray(tool.source_urls) ? tool.source_urls : [],
      raw_fields: tool,
      parsed_fields: {
        tool_id: tool.id,
        type: tool.type,
        source_urls: tool.source_urls,
        confidence: tool.confidence
      },
      source_confidence: confidenceFromSource(source),
      parsed_at: now,
      parser_version: "manual_seed_parser.v1",
      warnings: buildWarnings(tool)
    }));
}

async function parseGitHubTopicSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  const raw = await readFile(join(outputDir, snapshot.content_path), "utf8");
  const payload = JSON.parse(raw) as GitHubTopicPayload;
  const repositories = Array.isArray(payload.items) ? payload.items : Array.isArray(payload.repositories) ? payload.repositories : [];

  return repositories
    .filter((repo) => Boolean(repo.full_name && repo.html_url))
    .map((repo) => githubRepositoryToSourceRecord(repo, snapshot, source, now, "github_topic_parser.v1"));
}

async function parseGitHubRepoSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  const raw = await readFile(join(outputDir, snapshot.content_path), "utf8");
  const repo = JSON.parse(raw) as GitHubTopicRepository;
  if (!repo.full_name || !repo.html_url) return [];
  return [githubRepositoryToSourceRecord(repo, snapshot, source, now, "github_repo_parser.v1")];
}

async function parseNpmPackageSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  const raw = await readFile(join(outputDir, snapshot.content_path), "utf8");
  const payload = JSON.parse(raw) as NpmPackagePayload;
  if (!payload.name) return [];

  const packageUrl = `https://www.npmjs.com/package/${payload.name}`;
  const repoUrl = normalizeRepositoryUrl(typeof payload.repository === "string" ? payload.repository : payload.repository?.url);
  const keywords = Array.isArray(payload.keywords) ? payload.keywords.filter((keyword): keyword is string => typeof keyword === "string" && keyword.trim().length > 0) : [];
  const parsedFields: Record<string, unknown> = {
    package_name: payload.name,
    package_url: packageUrl,
    repo_url: repoUrl,
    homepage_url: payload.homepage,
    license: payload.license,
    latest_version: payload["dist-tags"]?.latest,
    last_release_at: payload.time?.modified,
    keywords,
    source_profile: source.profile
  };

  return [
    {
      id: `${source.id}-${slugify(payload.name)}-${now.slice(0, 10).replaceAll("-", "")}`,
      schema_version: "source_record.v1",
      snapshot_id: snapshot.id,
      source_id: source.id,
      record_type: "package",
      name: payload.name,
      description: payload.description,
      urls: [packageUrl, repoUrl, payload.homepage].filter((url): url is string => Boolean(url)),
      raw_fields: payload as Record<string, unknown>,
      parsed_fields: dropUndefined(parsedFields),
      source_confidence: confidenceFromSource(source),
      parsed_at: now,
      parser_version: "npm_package_parser.v1",
      warnings: buildNpmPackageWarnings(payload, repoUrl)
    }
  ];
}

async function parseOfficialDocsSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  const raw = await readFile(join(outputDir, snapshot.content_path), "utf8");
  const title = extractHtmlTitle(raw);
  const description = extractMetaDescription(raw) ?? source.profile?.summary ?? title ?? source.name;
  const docsUrl = source.profile?.docs_url ?? source.url;
  const parsedFields: Record<string, unknown> = {
    docs_url: docsUrl,
    homepage_url: source.profile?.homepage_url,
    source_profile: source.profile
  };

  return [
    {
      id: `${source.id}-${now.slice(0, 10).replaceAll("-", "")}`,
      schema_version: "source_record.v1",
      snapshot_id: snapshot.id,
      source_id: source.id,
      record_type: "doc_page",
      name: source.profile?.name ?? title ?? source.name,
      description,
      urls: [...new Set([docsUrl, source.profile?.homepage_url, source.url].filter((url): url is string => Boolean(url)))],
      raw_fields: { title, description, source_url: source.url },
      parsed_fields: dropUndefined(parsedFields),
      source_confidence: confidenceFromSource(source),
      parsed_at: now,
      parser_version: "official_docs_parser.v1",
      warnings: description ? [] : ["missing_description"]
    }
  ];
}

function githubRepositoryToSourceRecord(
  repo: GitHubTopicRepository,
  snapshot: RawSourceSnapshot,
  source: SourceDefinition,
  now: string,
  parserVersion: string
): SourceRecord {
  const repoUrl = repo.html_url ?? "";
  const license = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : repo.license?.name;
  const parsedFields: Record<string, unknown> = {
    repo_url: repoUrl,
    homepage_url: repo.homepage,
    stars: typeof repo.stargazers_count === "number" ? repo.stargazers_count : undefined,
    license,
    last_commit_at: repo.pushed_at,
    topics: Array.isArray(repo.topics) ? repo.topics : [],
    source_profile: source.profile
  };

  return {
    id: `${source.id}-${slugify(repo.full_name ?? repo.name ?? "unknown")}-${now.slice(0, 10).replaceAll("-", "")}`,
    schema_version: "source_record.v1",
    snapshot_id: snapshot.id,
    source_id: source.id,
    record_type: "repository",
    name: repo.full_name ?? repo.name ?? "unknown",
    description: repo.description,
    urls: [repoUrl, repo.homepage].filter((url): url is string => Boolean(url)),
    raw_fields: repo as Record<string, unknown>,
    parsed_fields: dropUndefined(parsedFields),
    source_confidence: confidenceFromSource(source),
    parsed_at: now,
    parser_version: parserVersion,
    warnings: buildGitHubTopicWarnings(repo)
  };
}

function confidenceFromSource(source: SourceDefinition): Confidence {
  if (source.trust_level === "official" || source.trust_level === "well_known_org") return "high";
  if (source.trust_level === "active_open_source" || source.trust_level === "commercial") return "medium";
  if (source.trust_level === "individual") return "low";
  return "unknown";
}

function buildWarnings(tool: Partial<ToolCard>): string[] {
  const warnings: string[] = [];
  if (!tool.source_urls?.length) warnings.push("missing_source_urls");
  if (!tool.use_cases?.length) warnings.push("missing_use_cases");
  if (!tool.not_for?.length) warnings.push("missing_not_for");
  if (!tool.permissions) warnings.push("missing_permissions");
  return warnings;
}

function buildGitHubTopicWarnings(repo: GitHubTopicRepository): string[] {
  const warnings: string[] = [];
  if (!repo.description?.trim()) warnings.push("missing_description");
  if (!repo.license) warnings.push("missing_license");
  if (!repo.pushed_at) warnings.push("missing_last_commit_at");
  return warnings;
}

function buildNpmPackageWarnings(payload: NpmPackagePayload, repoUrl: string | undefined): string[] {
  const warnings: string[] = [];
  if (!payload.description?.trim()) warnings.push("missing_description");
  if (!payload.license?.trim()) warnings.push("missing_license");
  if (!repoUrl) warnings.push("missing_repo_url");
  if (!payload["dist-tags"]?.latest) warnings.push("missing_latest_version");
  if (!payload.time?.modified) warnings.push("missing_last_release_at");
  return warnings;
}

function dropUndefined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function normalizeRepositoryUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value
    .replace(/^git\+/, "")
    .replace(/^git:\/\//, "https://")
    .replace(/\.git$/, "")
    .trim();
}

function extractHtmlTitle(value: string): string | undefined {
  const match = /<title[^>]*>([^<]+)<\/title>/i.exec(value);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}

function extractMetaDescription(value: string): string | undefined {
  const match = /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["'][^>]*>/i.exec(value);
  return match?.[1]?.replace(/\s+/g, " ").trim();
}
