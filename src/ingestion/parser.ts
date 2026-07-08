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
}

export const supportedSourceParsers = ["manual_seed_parser", "github_topic_parser"] as const;

export type SupportedSourceParser = (typeof supportedSourceParsers)[number];

export function isSupportedSourceParser(parser: string): parser is SupportedSourceParser {
  return supportedSourceParsers.includes(parser as SupportedSourceParser);
}

export async function parseSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  if (snapshot.status !== "success") return [];
  if (source.parser === "manual_seed_parser") return parseManualSeedSnapshot(snapshot, source, outputDir, now);
  if (source.parser === "github_topic_parser") return parseGitHubTopicSnapshot(snapshot, source, outputDir, now);
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
    .map((repo) => {
      const repoUrl = repo.html_url ?? "";
      const license = repo.license?.spdx_id && repo.license.spdx_id !== "NOASSERTION" ? repo.license.spdx_id : repo.license?.name;
      const parsedFields: Record<string, unknown> = {
        repo_url: repoUrl,
        stars: typeof repo.stargazers_count === "number" ? repo.stargazers_count : undefined,
        license,
        last_commit_at: repo.pushed_at,
        topics: Array.isArray(repo.topics) ? repo.topics : []
      };

      return {
        id: `${source.id}-${slugify(repo.full_name ?? repo.name ?? "unknown")}-${now.slice(0, 10).replaceAll("-", "")}`,
        schema_version: "source_record.v1" as const,
        snapshot_id: snapshot.id,
        source_id: source.id,
        record_type: "repository" as const,
        name: repo.full_name ?? repo.name ?? "unknown",
        description: repo.description,
        urls: [repoUrl],
        raw_fields: repo as Record<string, unknown>,
        parsed_fields: dropUndefined(parsedFields),
        source_confidence: confidenceFromSource(source),
        parsed_at: now,
        parser_version: "github_topic_parser.v1",
        warnings: buildGitHubTopicWarnings(repo)
      };
    });
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

function dropUndefined(fields: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined));
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
