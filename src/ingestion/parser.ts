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
  default_branch?: string;
}

interface SkillFrontmatter {
  name?: string;
  description?: string;
  license?: string;
}

interface SkillSignals {
  has_trigger_guidance: boolean;
  has_actionable_steps: boolean;
  has_boundary_guidance: boolean;
  heading_count: number;
  code_block_count: number;
  referenced_resources: string[];
  missing_resources: string[];
  platform_dependencies: string[];
  dangerous_instruction_patterns: string[];
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

export const supportedSourceParsers = ["manual_seed_parser", "github_topic_parser", "github_skill_topic_parser", "github_repo_parser", "npm_package_parser", "official_docs_parser"] as const;

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

export async function parseSourceSnapshots(
  snapshots: RawSourceSnapshot[],
  source: SourceDefinition,
  outputDir: string,
  now: string,
): Promise<SourceRecord[]> {
  if (source.parser === "github_skill_topic_parser") {
    return parseGitHubSkillSnapshots(snapshots, source, outputDir, now);
  }
  const records: SourceRecord[] = [];
  for (const snapshot of snapshots) records.push(...await parseSnapshot(snapshot, source, outputDir, now));
  return records;
}

async function parseGitHubSkillSnapshots(
  snapshots: RawSourceSnapshot[],
  source: SourceDefinition,
  outputDir: string,
  now: string,
): Promise<SourceRecord[]> {
  const searchSnapshot = snapshots.find((item) => item.status === "success" && item.request_meta?.snapshot_role === "search");
  if (!searchSnapshot) return [];
  const searchPayload = JSON.parse(await readFile(join(outputDir, searchSnapshot.content_path), "utf8")) as GitHubTopicPayload;
  const repositories = new Map(
    (searchPayload.items ?? [])
      .filter((item): item is GitHubTopicRepository & { full_name: string; html_url: string } => Boolean(item.full_name && item.html_url))
      .map((item) => [item.full_name, item]),
  );
  const treePathsByRepository = new Map<string, Set<string>>();
  for (const snapshot of snapshots.filter((item) => item.status === "success" && item.request_meta?.snapshot_role === "tree")) {
    const repository = snapshot.request_meta?.repository;
    if (!repository) continue;
    const payload = JSON.parse(await readFile(join(outputDir, snapshot.content_path), "utf8")) as { tree?: Array<{ path?: string }> };
    treePathsByRepository.set(repository, new Set((payload.tree ?? []).flatMap((item) => typeof item.path === "string" ? [item.path] : [])));
  }

  const records: SourceRecord[] = [];
  for (const snapshot of snapshots.filter((item) => item.status === "success" && item.request_meta?.snapshot_role === "skill_manifest")) {
    const repositoryName = snapshot.request_meta?.repository;
    const skillPath = snapshot.request_meta?.skill_path;
    const branch = snapshot.request_meta?.default_branch;
    if (!repositoryName || !skillPath || !branch) continue;
    const repository = repositories.get(repositoryName);
    const treePaths = treePathsByRepository.get(repositoryName);
    if (!repository || !treePaths?.has(skillPath)) continue;
    const content = await readFile(join(outputDir, snapshot.content_path), "utf8");
    const parsed = parseSkillManifest(content, skillPath, treePaths);
    const name = parsed.frontmatter.name;
    const description = parsed.frontmatter.description;
    if (!name || !description) continue;
    records.push(buildSkillSourceRecord(snapshot, source, repository, branch, skillPath, {
      ...parsed,
      frontmatter: { ...parsed.frontmatter, name, description },
    }, now));
  }
  return records;
}

function buildSkillSourceRecord(
  snapshot: RawSourceSnapshot,
  source: SourceDefinition,
  repository: GitHubTopicRepository & { full_name: string; html_url: string },
  branch: string,
  skillPath: string,
  parsed: { frontmatter: SkillFrontmatter & { name: string; description: string }; body: string; signals: SkillSignals },
  now: string,
): SourceRecord {
  const manifestUrl = `${repository.html_url}/blob/${encodeURIComponent(branch)}/${skillPath.split("/").map(encodeURIComponent).join("/")}`;
  const toolId = stableSkillId(repository.full_name, skillPath);
  const permissions = inferSkillPermissions(`${parsed.frontmatter.description}\n${parsed.body}`);
  const riskLevel = permissions.some((permission) => permission.scope === "shell" || permission.scope === "code_execution") ? "high" : permissions.length > 0 ? "medium" : "low";
  const license = parsed.frontmatter.license ?? normalizeGitHubLicense(repository.license);
  const generatedToolProfile = {
    tool_id: toolId,
    name: parsed.frontmatter.name,
    type: "skill",
    summary: parsed.frontmatter.description,
    tags: ["skill", slugify(parsed.frontmatter.name)],
    primary_purpose: `skill_${slugify(parsed.frontmatter.name)}`,
    use_cases: [parsed.frontmatter.description],
    not_for: extractNotFor(parsed.frontmatter.description, parsed.body),
    install_methods: [{ method: "manual", command: "", docs_url: manifestUrl, confidence: "medium" }],
    auth_required: "none",
    permissions,
    security: {
      risk_level: riskLevel,
      trust_level: source.trust_level,
      known_risks: [
        "untrusted_skill_instructions",
        ...parsed.signals.dangerous_instruction_patterns,
        ...parsed.signals.missing_resources.map(() => "missing_referenced_resource"),
      ],
      requires_human_approval: riskLevel === "high",
      security_notes: "Parsed as untrusted text from a public repository; review instructions, referenced resources, and permissions before use.",
    },
    maturity: "unknown",
  };
  const parsedFields = dropUndefined({
    tool_id: toolId,
    canonical_identity: manifestUrl,
    repo_url: repository.html_url,
    docs_url: manifestUrl,
    skill_manifest_path: skillPath,
    stars: repository.stargazers_count,
    license,
    last_commit_at: repository.pushed_at,
    topics: repository.topics ?? [],
    generated_tool_profile: generatedToolProfile,
    skill_signals: parsed.signals,
  });

  return {
    id: `${source.id}-${toolId}-${now.slice(0, 10).replaceAll("-", "")}`,
    schema_version: "source_record.v1",
    snapshot_id: snapshot.id,
    source_id: source.id,
    record_type: "repository",
    name: parsed.frontmatter.name,
    description: parsed.frontmatter.description,
    urls: [repository.html_url, manifestUrl],
    raw_fields: {
      repository: repository.full_name,
      skill_manifest_path: skillPath,
      frontmatter: parsed.frontmatter,
      body: parsed.body,
    },
    parsed_fields: parsedFields,
    source_confidence: "medium",
    parsed_at: now,
    parser_version: "github_skill_topic_parser.v1",
    warnings: [],
  };
}

function parseSkillManifest(content: string, skillPath: string, treePaths: Set<string>): { frontmatter: SkillFrontmatter; body: string; signals: SkillSignals } {
  const normalized = content.replaceAll("\r\n", "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) return { frontmatter: {}, body: normalized, signals: emptySkillSignals() };
  const frontmatter = parseFrontmatter(match[1] ?? "");
  const body = match[2] ?? "";
  const referencedResources = extractResourcePaths(body);
  const baseDirectory = skillPath.split("/").slice(0, -1).join("/");
  const resolvedResources = referencedResources.map((path) => normalizeRelativePath(baseDirectory, path)).filter((path): path is string => Boolean(path));
  const combined = `${frontmatter.description ?? ""}\n${body}`;
  const dangerousInstructionPatterns = [
    /bypass[^\n.]{0,40}approval|without[^\n.]{0,40}(?:approval|asking)/i.test(combined) ? "approval_bypass" : undefined,
    /active every response|ignore (?:all )?(?:previous|other) instructions/i.test(combined) ? "persistent_instruction_override" : undefined,
  ].filter((value): value is string => Boolean(value));
  const platformDependencies = ["claude", "codex", "python", "node", "bash", "powershell"]
    .filter((dependency) => new RegExp(`\\b${dependency}\\b`, "i").test(combined));
  return {
    frontmatter,
    body,
    signals: {
      has_trigger_guidance: /\buse (?:this )?(?:skill )?(?:when|whenever|on)\b/i.test(combined),
      has_actionable_steps: /^\s*\d+\.\s+/m.test(body) || /^##?\s+(?:steps|workflow|quick start|procedure)\b/im.test(body),
      has_boundary_guidance: /\b(?:do not|never|before|approval|limit|failure)\b/i.test(combined),
      heading_count: (body.match(/^#{1,6}\s+/gm) ?? []).length,
      code_block_count: Math.floor((body.match(/^```/gm) ?? []).length / 2),
      referenced_resources: resolvedResources,
      missing_resources: resolvedResources.filter((path) => !treePaths.has(path)),
      platform_dependencies: platformDependencies,
      dangerous_instruction_patterns: dangerousInstructionPatterns,
    },
  };
}

function parseFrontmatter(value: string): SkillFrontmatter {
  const result: Record<string, string> = {};
  const lines = value.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const match = /^([A-Za-z0-9_-]+):(?:\s*(.*))?$/.exec(line);
    if (!match) continue;
    const key = match[1] ?? "";
    const rawValue = (match[2] ?? "").trim();
    if (rawValue === ">" || rawValue === "|") {
      const chunks: string[] = [];
      while (index + 1 < lines.length && /^\s+/.test(lines[index + 1] ?? "")) {
        index += 1;
        chunks.push((lines[index] ?? "").trim());
      }
      result[key] = rawValue === ">" ? chunks.join(" ") : chunks.join("\n");
    } else {
      result[key] = stripQuotes(rawValue);
    }
  }
  return { name: result.name, description: result.description, license: result.license };
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) return value.slice(1, -1);
  return value;
}

function extractResourcePaths(body: string): string[] {
  return [...body.matchAll(/\[[^\]]+\]\((?!https?:|#|\/)([^)]+)\)/gi)]
    .map((match) => match[1]?.split("#")[0]?.trim())
    .filter((value): value is string => Boolean(value));
}

function normalizeRelativePath(baseDirectory: string, relativePath: string): string | undefined {
  const segments = `${baseDirectory}/${relativePath}`.split("/");
  const normalized: string[] = [];
  for (const segment of segments) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (normalized.length === 0) return undefined;
      normalized.pop();
    } else {
      normalized.push(segment);
    }
  }
  return normalized.join("/");
}

function inferSkillPermissions(content: string): ToolCard["permissions"] {
  const permissions: ToolCard["permissions"] = [];
  if (/\b(?:file|pdf|document|code|repository|workspace)\b/i.test(content)) {
    permissions.push({ scope: "filesystem", access: "read_write", required: true, notes: "The Skill instructions operate on workspace files or code." });
  }
  if (/```(?:bash|sh|shell)|\b(?:run|execute) (?:a )?(?:command|script)\b/i.test(content)) {
    permissions.push({ scope: "shell", access: "execute", required: true, notes: "The Skill instructions include shell command or script execution." });
  }
  if (/```(?:python|javascript|typescript)|\bexecute (?:generated )?code\b/i.test(content)) {
    permissions.push({ scope: "code_execution", access: "execute", required: true, notes: "The Skill instructions include executable code examples." });
  }
  if (/\b(?:api|network|download|upload|http request)\b/i.test(content)) {
    permissions.push({ scope: "network", access: "read_write", required: false, notes: "The Skill may access a documented network service." });
  }
  return permissions;
}

function extractNotFor(description: string, body: string): string[] {
  const matches = `${description}\n${body}`.match(/\bDo not use[^.\n]*(?:\.|$)/gi) ?? [];
  return matches.length > 0 ? matches.map((item) => item.trim()) : ["Use only after reviewing the Skill instructions, dependencies, and permission boundaries."];
}

function normalizeGitHubLicense(license: GitHubTopicRepository["license"]): string | undefined {
  if (!license) return undefined;
  return license.spdx_id && license.spdx_id !== "NOASSERTION" ? license.spdx_id : license.name;
}

function stableSkillId(repository: string, skillPath: string): string {
  const skillDirectory = skillPath.split("/").slice(0, -1).at(-1) ?? "skill";
  return `skill-${slugify(repository)}-${slugify(skillDirectory)}`;
}

function emptySkillSignals(): SkillSignals {
  return {
    has_trigger_guidance: false,
    has_actionable_steps: false,
    has_boundary_guidance: false,
    heading_count: 0,
    code_block_count: 0,
    referenced_resources: [],
    missing_resources: [],
    platform_dependencies: [],
    dangerous_instruction_patterns: [],
  };
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
