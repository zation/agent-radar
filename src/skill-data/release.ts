import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

export const SKILL_DATA_CHANNEL_SCHEMA = "agent_radar_skill_channel.v1" as const;
export const SKILL_DATA_MANIFEST_SCHEMA = "agent_radar_skill_data_manifest.v1" as const;
export const SKILL_DATASET_CONTRACT = "agent_radar_skill_dataset.v1" as const;
export const SKILL_MINIMUM_CLIENT_VERSION = "0.9.0" as const;

const releaseIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const checksumPattern = /^sha256:[a-f0-9]{64}$/;
const fileDefinitions = [
  { source: "tool_cards.jsonl", path: "tool_cards.jsonl", schema_version: "tool_card.v1" },
  { source: "ratings.jsonl", path: "ratings.jsonl", schema_version: "rating_result.v2" },
  { source: "search_index.json", path: "search_index.json", schema_version: "search_index.v1" },
] as const;

export interface SkillDataFileEntry {
  path: string;
  schema_version: string;
  size_bytes: number;
  sha256: string;
}

export interface SkillDataManifest {
  schema_version: typeof SKILL_DATA_MANIFEST_SCHEMA;
  data_contract_version: typeof SKILL_DATASET_CONTRACT;
  minimum_client_version: typeof SKILL_MINIMUM_CLIENT_VERSION;
  release_id: string;
  commit_sha: string;
  data_version: string;
  published_at: string;
  files: SkillDataFileEntry[];
}

export interface SkillDataChannel {
  schema_version: typeof SKILL_DATA_CHANNEL_SCHEMA;
  data_contract_version: typeof SKILL_DATASET_CONTRACT;
  release_id: string;
  manifest_path: string;
  manifest_size_bytes: number;
  manifest_sha256: string;
}

export interface BuildSkillDataReleaseOptions {
  publicDataDir: string;
  release: { release_id: string; commit_sha: string };
  dataVersion: string;
  publishedAt: string;
  previousSkillDataRoot?: string;
}

export async function buildSkillDataRelease(options: BuildSkillDataReleaseOptions): Promise<{
  channel: SkillDataChannel;
  manifest: SkillDataManifest;
}> {
  assertReleaseId(options.release.release_id);
  const skillRoot = join(options.publicDataDir, "skill");
  const releasesRoot = join(skillRoot, "releases");
  await rm(skillRoot, { recursive: true, force: true });
  await mkdir(releasesRoot, { recursive: true });
  if (options.previousSkillDataRoot) {
    await copyPreviousReleases(join(options.previousSkillDataRoot, "releases"), releasesRoot);
  }

  const releaseDir = join(releasesRoot, options.release.release_id);
  try {
    await stat(releaseDir);
    throw new Error(`skill_data_release_already_exists:${options.release.release_id}`);
  } catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  }
  await mkdir(releaseDir, { recursive: false });

  const files: SkillDataFileEntry[] = [];
  for (const definition of fileDefinitions) {
    const contents = await readFile(join(options.publicDataDir, definition.source));
    await writeFile(join(releaseDir, definition.path), contents);
    files.push({
      path: definition.path,
      schema_version: definition.schema_version,
      size_bytes: contents.byteLength,
      sha256: sha256(contents),
    });
  }
  const manifest: SkillDataManifest = {
    schema_version: SKILL_DATA_MANIFEST_SCHEMA,
    data_contract_version: SKILL_DATASET_CONTRACT,
    minimum_client_version: SKILL_MINIMUM_CLIENT_VERSION,
    release_id: options.release.release_id,
    commit_sha: options.release.commit_sha,
    data_version: options.dataVersion,
    published_at: options.publishedAt,
    files,
  };
  const manifestContents = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(join(releaseDir, "manifest.json"), manifestContents);

  const channel: SkillDataChannel = {
    schema_version: SKILL_DATA_CHANNEL_SCHEMA,
    data_contract_version: SKILL_DATASET_CONTRACT,
    release_id: options.release.release_id,
    manifest_path: `/data/skill/releases/${options.release.release_id}/manifest.json`,
    manifest_size_bytes: manifestContents.byteLength,
    manifest_sha256: sha256(manifestContents),
  };
  const channelDir = join(skillRoot, "channels", "v1");
  await mkdir(channelDir, { recursive: true });
  await writeFile(join(channelDir, "latest.json"), `${JSON.stringify(channel, null, 2)}\n`, "utf8");
  return { channel, manifest };
}

export async function validateSkillDataReleaseDirectory(releaseDir: string): Promise<SkillDataManifest> {
  const directoryEntries = await readdir(releaseDir, { withFileTypes: true });
  const expectedNames = ["manifest.json", ...fileDefinitions.map(({ path }) => path)].sort();
  if (directoryEntries.some((entry) => !entry.isFile())
    || directoryEntries.map(({ name }) => name).sort().join("\0") !== expectedNames.join("\0")) {
    throw new Error("skill_data_release_file_set_invalid");
  }
  const manifest = JSON.parse(await readFile(join(releaseDir, "manifest.json"), "utf8")) as SkillDataManifest;
  if (manifest.schema_version !== SKILL_DATA_MANIFEST_SCHEMA) throw new Error("skill_data_manifest_schema_invalid");
  if (manifest.data_contract_version !== SKILL_DATASET_CONTRACT) throw new Error("skill_data_contract_invalid");
  if (manifest.minimum_client_version !== SKILL_MINIMUM_CLIENT_VERSION) throw new Error("skill_data_minimum_client_invalid");
  assertReleaseId(manifest.release_id);
  if (basename(releaseDir) !== manifest.release_id) throw new Error("skill_data_release_directory_mismatch");
  if (!Array.isArray(manifest.files) || manifest.files.length !== fileDefinitions.length) throw new Error("skill_data_file_set_invalid");
  for (const definition of fileDefinitions) {
    const entry = manifest.files.find(({ path }) => path === definition.path);
    if (!entry || entry.schema_version !== definition.schema_version || !checksumPattern.test(entry.sha256)) {
      throw new Error(`skill_data_file_manifest_invalid:${definition.path}`);
    }
    const contents = await readFile(join(releaseDir, definition.path));
    if (contents.byteLength !== entry.size_bytes || sha256(contents) !== entry.sha256) {
      throw new Error(`skill_data_file_checksum_mismatch:${definition.path}`);
    }
  }
  return manifest;
}

async function copyPreviousReleases(sourceRoot: string, destinationRoot: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(sourceRoot, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
    throw error;
  }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) throw new Error(`skill_data_previous_entry_invalid:${entry.name}`);
    assertReleaseId(entry.name);
    const sourceDir = join(sourceRoot, entry.name);
    await validateSkillDataReleaseDirectory(sourceDir);
    await cp(sourceDir, join(destinationRoot, entry.name), { recursive: true, errorOnExist: true, force: false });
  }
}

function assertReleaseId(value: string): void {
  if (!releaseIdPattern.test(value)) throw new Error(`skill_data_release_id_invalid:${value}`);
}

function sha256(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}
