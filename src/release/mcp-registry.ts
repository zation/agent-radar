const REGISTRY_SCHEMA = "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json";
const SERVER_NAME = "io.github.zation/agent-radar";
const SERVER_TITLE = "Agent Radar";
const SERVER_DESCRIPTION = "Search, inspect, recommend, and explain rated AI tools through Agent Radar.";
const REPOSITORY = {
  url: "https://github.com/zation/agent-radar",
  source: "github"
} as const;
const REMOTE = {
  type: "streamable-http",
  url: "https://agent-radar.zation1.workers.dev/api/mcp",
  headers: [{
    name: "X-Agent-Radar-LLM-API-Key",
    description: "LLM provider API key used only by recommend_tools.",
    isRequired: false,
    isSecret: true,
    format: "string"
  }]
} as const;

export interface McpRegistryMetadata {
  $schema: string;
  name: string;
  title: string;
  description: string;
  version: string;
  repository: {
    url: string;
    source: string;
  };
  remotes: Array<{
    type: string;
    url: string;
    headers: Array<{
      name: string;
      description: string;
      isRequired: boolean;
      isSecret: boolean;
      format: string;
    }>;
  }>;
}

const ALL_VERSION_TAG = /^all-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

export function registryVersionFromTag(tag: string): string {
  const match = ALL_VERSION_TAG.exec(tag);
  const prerelease = match?.[4];
  const hasInvalidNumericIdentifier = prerelease
    ?.split(".")
    .some((identifier) => /^\d+$/.test(identifier) && identifier.length > 1 && identifier.startsWith("0"));
  if (!match || hasInvalidNumericIdentifier) {
    throw new Error("Release tag must be canonical all-v SemVer without build metadata");
  }
  return tag.slice("all-v".length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactJson(field: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`MCP Registry ${field} does not match the immutable release contract`);
  }
}

export function validateMcpRegistryMetadata(
  metadata: unknown,
  context: { releaseTag: string }
): McpRegistryMetadata {
  if (!isRecord(metadata)) {
    throw new Error("MCP Registry metadata must be a JSON object");
  }
  if (Object.hasOwn(metadata, "packages")) {
    throw new Error("MCP Registry packages are forbidden for the remote-only release");
  }

  const version = registryVersionFromTag(context.releaseTag);
  assertExactJson("schema", metadata.$schema, REGISTRY_SCHEMA);
  assertExactJson("name", metadata.name, SERVER_NAME);
  assertExactJson("title", metadata.title, SERVER_TITLE);
  assertExactJson("description", metadata.description, SERVER_DESCRIPTION);
  assertExactJson("version", metadata.version, version);
  assertExactJson("repository", metadata.repository, REPOSITORY);
  if (!Array.isArray(metadata.remotes) || metadata.remotes.length !== 1 || !isRecord(metadata.remotes[0])) {
    throw new Error("MCP Registry remote must contain exactly one production endpoint");
  }
  const remote = metadata.remotes[0];
  assertExactJson("remote transport", remote.type, REMOTE.type);
  assertExactJson("remote URL", remote.url, REMOTE.url);
  assertExactJson("header", remote.headers, REMOTE.headers);

  return metadata as unknown as McpRegistryMetadata;
}
