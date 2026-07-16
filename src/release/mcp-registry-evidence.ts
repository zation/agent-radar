import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  registryVersionFromTag,
  validateMcpRegistryMetadata,
  type McpRegistryMetadata
} from "./mcp-registry.js";

const OFFICIAL_META_KEY = "io.modelcontextprotocol.registry/official";
const SHA_PATTERN = /^[0-9a-f]{6,64}$/;
const RUN_ID_PATTERN = /^[1-9][0-9]*$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;
const UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;

interface RegistryRecord {
  server: Record<string, unknown>;
  official: {
    status: string;
    publishedAt: string;
    isLatest: boolean;
  };
}

export type McpRegistryRecordClassification =
  | { kind: "publish-required" }
  | { kind: "identical"; record: RegistryRecord };

export interface BuildMcpRegistryPublicationEvidenceOptions {
  productionEvidencePath: string;
  metadataPath: string;
  registryResponsePath: string;
  repository: string;
  runId: string;
  releaseTag: string;
  gitSha: string;
  registryQueryUrl: string;
  registryQueriedAt: string;
}

export interface McpRegistryPublicationEvidence {
  schema_version: "mcp_registry_publication_evidence.v1";
  source: {
    repository: string;
    run_id: string;
    release_tag: string;
    sha: string;
  };
  production_evidence: {
    schema_version: "production_release_evidence.v2";
    sha256: string;
  };
  registry: {
    name: string;
    version: string;
    status: string;
    is_latest: true;
    published_at: string;
    transport: string;
    remote_url: string;
    repository: { url: string; source: string };
  };
  metadata: {
    canonical_sha256: string;
  };
  query: {
    url: string;
    queried_at: string;
  };
  verification: {
    production_evidence_matches_source: true;
    metadata_matches_release: true;
    registry_record_matches_metadata: true;
  };
}

export function canonicalMetadataSha256(metadata: unknown): string {
  return sha256(Buffer.from(canonicalJson(metadata), "utf8"));
}

export function classifyMcpRegistryRecord(
  response: unknown,
  metadata: unknown
): McpRegistryRecordClassification {
  if (!isRecord(metadata) || typeof metadata.name !== "string" || typeof metadata.version !== "string") {
    throw new Error("MCP Registry metadata identity is invalid");
  }
  const entries = registryEntries(response);
  const matching = entries.filter(({ server }) => server.name === metadata.name && server.version === metadata.version);
  if (matching.length > 1) {
    throw new Error("MCP Registry response is ambiguous for the requested name and version");
  }
  if (matching.length === 0) {
    return { kind: "publish-required" };
  }

  const record = matching[0];
  if (record.official.status !== "active") {
    throw new Error("MCP Registry record must be active before it can be treated as identical");
  }
  if (!record.official.isLatest) {
    throw new Error("MCP Registry record must be latest before it can be treated as identical");
  }
  const expectedRemote = firstRemote(metadata.remotes, "metadata");
  const actualRemote = firstRemote(record.server.remotes, "Registry record");
  const repositoryMatches = JSON.stringify(record.server.repository) === JSON.stringify(metadata.repository);
  const remoteMatches = actualRemote.type === expectedRemote.type && actualRemote.url === expectedRemote.url;
  if (!repositoryMatches || !remoteMatches) {
    throw new Error("MCP Registry immutable conflict for the requested name and version");
  }
  return { kind: "identical", record };
}

export async function buildMcpRegistryPublicationEvidence(
  options: BuildMcpRegistryPublicationEvidenceOptions
): Promise<McpRegistryPublicationEvidence> {
  validateSource(options);
  const [productionContents, metadataContents, registryContents] = await Promise.all([
    readFile(options.productionEvidencePath),
    readFile(options.metadataPath),
    readFile(options.registryResponsePath)
  ]);
  const production = parseJsonObject(productionContents, "production evidence");
  const metadataValue = parseJsonObject(metadataContents, "MCP Registry metadata");
  const registryResponse = parseJsonObject(registryContents, "MCP Registry response");
  const metadata = validateMcpRegistryMetadata(metadataValue, { releaseTag: options.releaseTag });
  validateProductionEvidence(production, options, metadata);
  const classification = classifyMcpRegistryRecord(registryResponse, metadata);
  if (classification.kind !== "identical") {
    throw new Error("MCP Registry publication evidence requires the published name and version");
  }

  const { record } = classification;
  const remote = metadata.remotes[0];
  return {
    schema_version: "mcp_registry_publication_evidence.v1",
    source: {
      repository: options.repository,
      run_id: options.runId,
      release_tag: options.releaseTag,
      sha: options.gitSha
    },
    production_evidence: {
      schema_version: "production_release_evidence.v2",
      sha256: sha256(productionContents)
    },
    registry: {
      name: metadata.name,
      version: metadata.version,
      status: record.official.status,
      is_latest: true,
      published_at: record.official.publishedAt,
      transport: remote.type,
      remote_url: remote.url,
      repository: metadata.repository
    },
    metadata: {
      canonical_sha256: canonicalMetadataSha256(metadataValue)
    },
    query: {
      url: options.registryQueryUrl,
      queried_at: options.registryQueriedAt
    },
    verification: {
      production_evidence_matches_source: true,
      metadata_matches_release: true,
      registry_record_matches_metadata: true
    }
  };
}

function validateSource(options: BuildMcpRegistryPublicationEvidenceOptions): void {
  if (!REPOSITORY_PATTERN.test(options.repository)) throw new Error("Source repository is invalid");
  if (!RUN_ID_PATTERN.test(options.runId)) throw new Error("Source run identifier is invalid");
  if (!SHA_PATTERN.test(options.gitSha)) throw new Error("Source Git SHA is invalid");
  registryVersionFromTag(options.releaseTag);
  let queryUrl: URL;
  try {
    queryUrl = new URL(options.registryQueryUrl);
  } catch {
    throw new Error("MCP Registry query URL is invalid");
  }
  if (queryUrl.protocol !== "https:" || queryUrl.hostname !== "registry.modelcontextprotocol.io") {
    throw new Error("MCP Registry query URL must use the official HTTPS origin");
  }
  if (!UTC_TIMESTAMP_PATTERN.test(options.registryQueriedAt) || Number.isNaN(Date.parse(options.registryQueriedAt))) {
    throw new Error("MCP Registry query timestamp must be UTC ISO 8601");
  }
}

function validateProductionEvidence(
  production: Record<string, unknown>,
  options: BuildMcpRegistryPublicationEvidenceOptions,
  metadata: McpRegistryMetadata
): void {
  if (production.schema_version !== "production_release_evidence.v2") {
    throw new Error("Production evidence schema_version is invalid");
  }
  if (!isRecord(production.github)
    || production.github.repository !== options.repository
    || production.github.run_id !== options.runId
    || production.github.release_tag !== options.releaseTag
    || production.github.sha !== options.gitSha) {
    throw new Error("Production evidence must match the selected repository, run, tag, and SHA");
  }
  if (!isRecord(production.deployment)
    || production.deployment.environment !== "production"
    || production.deployment.mcp_endpoint !== metadata.remotes[0].url) {
    throw new Error("Production MCP endpoint must match MCP Registry metadata");
  }
  if (!isRecord(production.identity)
    || production.identity.expected_release_id !== options.releaseTag
    || production.identity.actual_release_id !== options.releaseTag
    || production.identity.expected_commit_sha !== options.gitSha
    || production.identity.actual_commit_sha !== options.gitSha
    || production.identity.expected_server_version !== metadata.version
    || production.identity.actual_server_version !== metadata.version) {
    throw new Error("Production release identity must match MCP Registry metadata");
  }
}

function registryEntries(response: unknown): RegistryRecord[] {
  if (!isRecord(response) || !Array.isArray(response.servers)) {
    throw new Error("MCP Registry response must contain a servers array");
  }
  return response.servers.map((entry) => {
    if (!isRecord(entry) || !isRecord(entry.server) || !isRecord(entry._meta)) {
      throw new Error("MCP Registry response entry is invalid");
    }
    const official = entry._meta[OFFICIAL_META_KEY];
    if (!isRecord(official)
      || typeof official.status !== "string" || !official.status
      || typeof official.publishedAt !== "string"
      || !UTC_TIMESTAMP_PATTERN.test(official.publishedAt)
      || Number.isNaN(Date.parse(official.publishedAt))
      || typeof official.isLatest !== "boolean") {
      throw new Error("MCP Registry official publication metadata is invalid");
    }
    return {
      server: entry.server,
      official: { status: official.status, publishedAt: official.publishedAt, isLatest: official.isLatest }
    };
  });
}

function firstRemote(value: unknown, label: string): { type: string; url: string } {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])
    || typeof value[0].type !== "string" || typeof value[0].url !== "string") {
    throw new Error(`${label} must contain exactly one valid remote`);
  }
  return { type: value[0].type, url: value[0].url };
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Canonical metadata cannot contain non-finite numbers");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  throw new Error("Canonical metadata contains an unsupported value");
}

function parseJsonObject(contents: Buffer, label: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(contents.toString("utf8"));
  } catch {
    throw new Error(`${label} JSON is malformed`);
  }
  if (!isRecord(value)) throw new Error(`${label} must be a JSON object`);
  return value;
}

function sha256(contents: Buffer): string {
  return `sha256:${createHash("sha256").update(contents).digest("hex")}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
