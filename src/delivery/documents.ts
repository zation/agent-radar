import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

type FrontmatterValue = string | string[];
type Frontmatter = Record<string, FrontmatterValue>;

export interface DeliveryStatus {
  backlog: Array<{ id: string; status: string; priority: string }>;
  versions: Array<{
    version: string;
    increments: Array<{
      increment: string;
      specStatus: string;
      planStatus: string;
      completedTasks: number;
      totalTasks: number;
    }>;
  }>;
  archivedVersions: string[];
}

const backlogStatuses = new Set(["candidate", "ready", "blocked", "rejected"]);
const specStatuses = new Set(["draft", "approved", "completed", "superseded"]);
const planStatuses = new Set(["draft", "active", "completed", "cancelled"]);
const terminalSpecStatuses = new Set(["completed", "superseded"]);
const terminalPlanStatuses = new Set(["completed", "cancelled"]);
const priorities = new Set(["high", "medium", "low"]);

export function validateDeliveryDocuments(root: string): string[] {
  const errors: string[] = [];
  if (!existsSync(root)) return [`${root}: delivery directory does not exist`];

  const backlogRoot = path.join(root, "backlog");
  if (!existsSync(backlogRoot)) errors.push(`${backlogRoot}: backlog directory does not exist`);
  else validateBacklog(backlogRoot, errors);

  const archiveRoot = path.join(root, "archived");
  if (!existsSync(archiveRoot)) errors.push(`${archiveRoot}: archived directory does not exist`);
  else validateArchive(archiveRoot, errors);

  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.name === "backlog" || entry.name === "archived") continue;
    const entryPath = path.join(root, entry.name);
    if (!entry.isDirectory() || !/^v\d+\.\d+$/.test(entry.name)) {
      errors.push(`${entryPath}: active delivery entries must be version directories named vX.Y`);
      continue;
    }
    validateActiveVersion(entryPath, entry.name, errors);
  }

  for (const file of listMarkdownFiles(root)) validateMarkdownLinks(file, errors);
  return errors.sort();
}

export function readDeliveryStatus(root: string): DeliveryStatus {
  const backlogRoot = path.join(root, "backlog");
  const backlog = existsSync(backlogRoot) ? readdirSync(backlogRoot)
    .filter((name) => name.endsWith(".md"))
    .map((name) => {
      const metadata = parseFrontmatter(readFileSync(path.join(backlogRoot, name), "utf8"));
      return {
        id: readScalar(metadata, "id"),
        status: readScalar(metadata, "status"),
        priority: readScalar(metadata, "priority"),
      };
    }) : [];

  const versions = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name))
    .map((entry) => {
      const versionRoot = path.join(root, entry.name);
      const specNames = readdirSync(versionRoot).filter((name) => /^p\d+-spec\.md$/.test(name));
      return {
        version: entry.name,
        increments: specNames.map((specName) => {
          const increment = specName.match(/^(p\d+)-spec\.md$/)?.[1] ?? "unknown";
          const specMetadata = parseFrontmatter(readFileSync(path.join(versionRoot, specName), "utf8"));
          const planPath = path.join(versionRoot, `${increment}-plan.md`);
          const planContent = existsSync(planPath) ? readFileSync(planPath, "utf8") : "";
          const planMetadata = planContent ? parseFrontmatter(planContent) : {};
          const completedTasks = [...planContent.matchAll(/^- \[[xX]\] /gm)].length;
          const openTasks = [...planContent.matchAll(/^- \[ \] /gm)].length;
          return {
            increment,
            specStatus: readScalar(specMetadata, "status") || "missing",
            planStatus: readScalar(planMetadata, "status") || "missing",
            completedTasks,
            totalTasks: completedTasks + openTasks,
          };
        }).sort((a, b) => a.increment.localeCompare(b.increment, undefined, { numeric: true })),
      };
    }).sort((a, b) => a.version.localeCompare(b.version, undefined, { numeric: true }));

  const archiveRoot = path.join(root, "archived");
  const archivedVersions = existsSync(archiveRoot) ? readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^v\d+\.\d+$/.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true })) : [];

  return {
    backlog: backlog.sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority) || a.id.localeCompare(b.id)),
    versions,
    archivedVersions,
  };
}

export function formatDeliveryStatus(status: DeliveryStatus): string {
  const lines = ["Backlog"];
  if (status.backlog.length === 0) lines.push("  (empty)");
  for (const item of status.backlog) lines.push(`  ${item.priority.padEnd(6)} ${item.id.padEnd(34)} ${item.status}`);

  lines.push("", "Active versions");
  if (status.versions.length === 0) lines.push("  (none)");
  for (const version of status.versions) {
    lines.push(`  ${version.version}`);
    for (const increment of version.increments) {
      const progress = increment.totalTasks > 0 ? ` ${increment.completedTasks}/${increment.totalTasks} tasks` : "";
      lines.push(`    ${increment.increment} spec=${increment.specStatus} plan=${increment.planStatus}${progress}`);
    }
  }

  lines.push("", "Archived versions", `  ${status.archivedVersions.join(" ") || "(none)"}`);
  return lines.join("\n");
}

function validateBacklog(root: string, errors: string[]): void {
  const seenIds = new Set<string>();
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const file = path.join(root, entry.name);
    if (!entry.isFile() || !entry.name.endsWith(".md")) {
      errors.push(`${file}: backlog entries must be Markdown files`);
      continue;
    }
    const metadata = parseFrontmatter(readFileSync(file, "utf8"), errors, file);
    requireScalar(metadata, "kind", file, errors, "backlog");
    const id = requireScalar(metadata, "id", file, errors);
    if (id && id !== entry.name.replace(/\.md$/, "")) errors.push(`${file}: id must match the filename`);
    if (id && seenIds.has(id)) errors.push(`${file}: duplicate backlog id ${id}`);
    if (id) seenIds.add(id);
    requireEnum(metadata, "status", backlogStatuses, file, errors);
    requireEnum(metadata, "priority", priorities, file, errors);
    requireArray(metadata, "domains", file, errors);
    const createdAt = requireScalar(metadata, "created_at", file, errors);
    if (createdAt && !/^\d{4}-\d{2}-\d{2}$/.test(createdAt)) errors.push(`${file}: created_at must use YYYY-MM-DD`);
  }
}

function validateActiveVersion(root: string, version: string, errors: string[]): void {
  const names = readdirSync(root);
  for (const name of names) {
    const file = path.join(root, name);
    if (!statSync(file).isFile() || !/^p\d+-(spec|plan)\.md$/.test(name)) {
      errors.push(`${file}: active version files must be named pN-spec.md or pN-plan.md`);
    }
  }

  const specs = names.filter((name) => /^p\d+-spec\.md$/.test(name));
  for (const specName of specs) {
    const increment = specName.match(/^(p\d+)-spec\.md$/)?.[1] ?? "";
    const specFile = path.join(root, specName);
    const specMetadata = parseFrontmatter(readFileSync(specFile, "utf8"), errors, specFile);
    requireScalar(specMetadata, "kind", specFile, errors, "spec");
    requireScalar(specMetadata, "version", specFile, errors, version);
    requireScalar(specMetadata, "increment", specFile, errors, increment);
    const specStatus = requireEnum(specMetadata, "status", specStatuses, specFile, errors);
    requireArray(specMetadata, "implementation_commits", specFile, errors, true);

    const planFile = path.join(root, `${increment}-plan.md`);
    if (!existsSync(planFile)) continue;
    const planMetadata = parseFrontmatter(readFileSync(planFile, "utf8"), errors, planFile);
    requireScalar(planMetadata, "kind", planFile, errors, "plan");
    requireScalar(planMetadata, "version", planFile, errors, version);
    requireScalar(planMetadata, "increment", planFile, errors, increment);
    const planStatus = requireEnum(planMetadata, "status", planStatuses, planFile, errors);
    requireScalar(planMetadata, "spec", planFile, errors, `./${specName}`);
    const commits = requireArray(planMetadata, "implementation_commits", planFile, errors, true);
    if (planStatus === "active" && specStatus !== "approved") errors.push(`${planFile}: active Plan requires an approved Spec`);
    if (planStatus === "completed" && specStatus !== "completed") errors.push(`${planFile}: completed Plan requires a completed Spec`);
    if (planStatus === "completed" && commits.length === 0) errors.push(`${planFile}: completed Plan requires implementation_commits`);
  }

  for (const planName of names.filter((name) => /^p\d+-plan\.md$/.test(name))) {
    const increment = planName.match(/^(p\d+)-plan\.md$/)?.[1] ?? "";
    if (!existsSync(path.join(root, `${increment}-spec.md`))) errors.push(`${path.join(root, planName)}: Plan has no matching Spec`);
  }

  const statuses = specs.map((name) => readScalar(parseFrontmatter(readFileSync(path.join(root, name), "utf8")), "status"));
  const planStatusesInVersion = names.filter((name) => /^p\d+-plan\.md$/.test(name))
    .map((name) => readScalar(parseFrontmatter(readFileSync(path.join(root, name), "utf8")), "status"));
  if (specs.length > 0 && statuses.every((status) => terminalSpecStatuses.has(status)) && planStatusesInVersion.every((status) => terminalPlanStatuses.has(status))) {
    errors.push(`${root}: every increment is terminal; move the version directory to archived`);
  }
}

function validateArchive(root: string, errors: string[]): void {
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const entryPath = path.join(root, entry.name);
    if (entry.isFile() && entry.name === "v0.x-roadmap.md") continue;
    if (!entry.isDirectory() || !/^v\d+\.\d+$/.test(entry.name)) {
      errors.push(`${entryPath}: archive entries must be version directories or v0.x-roadmap.md`);
      continue;
    }
    for (const child of readdirSync(entryPath, { withFileTypes: true })) {
      if (!child.isFile() || !child.name.endsWith(".md")) errors.push(`${path.join(entryPath, child.name)}: archived version entries must be Markdown files`);
    }
  }
}

function validateMarkdownLinks(file: string, errors: string[]): void {
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1].trim();
    if (!target || target.startsWith("#") || /^[a-z]+:/i.test(target)) continue;
    const pathPart = target.split("#", 1)[0];
    if (!pathPart) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(pathPart));
    if (!existsSync(resolved)) errors.push(`${file}: broken Markdown link ${target}`);
  }
}

function listMarkdownFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listMarkdownFiles(entryPath);
    return entry.isFile() && entry.name.endsWith(".md") ? [entryPath] : [];
  });
}

function parseFrontmatter(content: string, errors: string[] = [], file = "document"): Frontmatter {
  const lines = content.split("\n");
  if (lines[0]?.trim() !== "---") {
    errors.push(`${file}: missing YAML frontmatter`);
    return {};
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end < 0) {
    errors.push(`${file}: unterminated YAML frontmatter`);
    return {};
  }
  const result: Frontmatter = {};
  let arrayKey: string | undefined;
  for (const line of lines.slice(1, end)) {
    const item = line.match(/^\s+-\s+(.+)$/);
    if (item && arrayKey) {
      (result[arrayKey] as string[]).push(item[1].trim());
      continue;
    }
    const field = line.match(/^([a-z_]+):(?:\s*(.*))?$/);
    if (!field) continue;
    const [, key, rawValue = ""] = field;
    if (!rawValue.trim()) {
      result[key] = [];
      arrayKey = key;
    } else if (rawValue.trim() === "[]") {
      result[key] = [];
      arrayKey = undefined;
    } else {
      result[key] = rawValue.trim().replace(/^['"]|['"]$/g, "");
      arrayKey = undefined;
    }
  }
  return result;
}

function requireScalar(metadata: Frontmatter, key: string, file: string, errors: string[], expected?: string): string {
  const value = readScalar(metadata, key);
  if (!value) errors.push(`${file}: ${key} is required`);
  else if (expected && value !== expected) errors.push(`${file}: ${key} must be ${expected}`);
  return value;
}

function requireEnum(metadata: Frontmatter, key: string, allowed: Set<string>, file: string, errors: string[]): string {
  const value = requireScalar(metadata, key, file, errors);
  if (value && !allowed.has(value)) errors.push(`${file}: ${key} must be one of ${[...allowed].join(", ")}`);
  return value;
}

function requireArray(metadata: Frontmatter, key: string, file: string, errors: string[], allowEmpty = false): string[] {
  const value = metadata[key];
  if (!Array.isArray(value)) {
    errors.push(`${file}: ${key} must be an array`);
    return [];
  }
  if (!allowEmpty && value.length === 0) errors.push(`${file}: ${key} must not be empty`);
  return value;
}

function readScalar(metadata: Frontmatter, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value : "";
}

function priorityRank(priority: string): number {
  return priority === "high" ? 0 : priority === "medium" ? 1 : 2;
}
