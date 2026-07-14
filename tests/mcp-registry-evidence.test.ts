import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  buildMcpRegistryPublicationEvidence,
  canonicalMetadataSha256,
  classifyMcpRegistryRecord
} from "../src/release/mcp-registry-evidence.js";
import { buildMcpRegistryMetadata } from "../src/release/mcp-registry.js";

const registryVersion = "0.7.2-test";
const metadata = buildMcpRegistryMetadata(`all-v${registryVersion}`) as unknown as Record<string, unknown>;
const source = {
  repository: "zation/agent-radar",
  runId: "31000000001",
  releaseTag: `all-v${registryVersion}`,
  gitSha: "abcdef1234567890"
};

function productionEvidence(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema_version: "production_release_evidence.v1",
    github: {
      repository: source.repository,
      run_id: source.runId,
      sha: source.gitSha,
      release_tag: source.releaseTag
    },
    deployment: {
      environment: "production",
      worker_base_url: "https://agent-radar.zation1.workers.dev",
      mcp_endpoint: "https://agent-radar.zation1.workers.dev/api/mcp"
    },
    ...overrides
  };
}

function registryServer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...metadata, ...overrides };
}

function registryResponse(servers: unknown[] = [registryServer()]): Record<string, unknown> {
  return {
    servers: servers.map((server) => ({
      server,
      _meta: {
        "io.modelcontextprotocol.registry/official": {
          status: "active",
          publishedAt: "2026-07-13T08:00:00.123456Z",
          updatedAt: "2026-07-13T08:00:00Z",
          isLatest: true
        }
      }
    })),
    metadata: { count: servers.length }
  };
}

test("builds publication evidence bound to the exact production release and Registry record", async () => {
  await withFixture(async (paths) => {
    const evidence = await buildMcpRegistryPublicationEvidence({
      ...paths,
      ...source,
      registryQueryUrl: `https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.zation%2Fagent-radar&version=${registryVersion}`,
      registryQueriedAt: "2026-07-13T08:01:00Z"
    });

    assert.equal(evidence.schema_version, "mcp_registry_publication_evidence.v1");
    assert.deepEqual(evidence.source, {
      repository: source.repository,
      run_id: source.runId,
      release_tag: source.releaseTag,
      sha: source.gitSha
    });
    assert.equal(evidence.production_evidence.sha256.startsWith("sha256:"), true);
    assert.deepEqual(evidence.registry, {
      name: "io.github.zation/agent-radar",
      version: registryVersion,
      status: "active",
      is_latest: true,
      published_at: "2026-07-13T08:00:00.123456Z",
      transport: "streamable-http",
      remote_url: "https://agent-radar.zation1.workers.dev/api/mcp",
      repository: { url: "https://github.com/zation/agent-radar", source: "github" }
    });
    assert.equal(evidence.metadata.canonical_sha256, canonicalMetadataSha256(metadata));
    assert.deepEqual(evidence.verification, {
      production_evidence_matches_source: true,
      metadata_matches_release: true,
      registry_record_matches_metadata: true
    });
    assert.equal(JSON.stringify(evidence).includes("X-Agent-Radar-LLM-API-Key"), false);
  });
});

test("canonical metadata checksum is deterministic across object key order", () => {
  const reordered = Object.fromEntries(Object.entries(metadata).reverse());
  assert.equal(canonicalMetadataSha256(reordered), canonicalMetadataSha256(metadata));
});

test("classifies no record as publish-required and an identical record as idempotent", () => {
  assert.deepEqual(classifyMcpRegistryRecord(registryResponse([]), metadata), { kind: "publish-required" });
  assert.equal(classifyMcpRegistryRecord(registryResponse(), metadata).kind, "identical");
});

test("rejects Registry timestamps with more than nanosecond precision", () => {
  const response = registryResponse();
  const official = ((response.servers as Array<Record<string, unknown>>)[0]._meta as Record<string, Record<string, unknown>>)
    ["io.modelcontextprotocol.registry/official"];
  official.publishedAt = "2026-07-13T08:00:00.1234567890Z";
  assert.throws(() => classifyMcpRegistryRecord(response, metadata), /publication metadata is invalid/i);
});

test("rejects an immutable Registry conflict or ambiguous exact records", () => {
  assert.throws(() => classifyMcpRegistryRecord(registryResponse([
    registryServer({ repository: { url: "https://github.com/other/repo", source: "github" } })
  ]), metadata), /immutable conflict/i);
  assert.throws(() => classifyMcpRegistryRecord(registryResponse([
    registryServer(),
    registryServer()
  ]), metadata), /ambiguous/i);
});

test("rejects inactive or non-latest Registry records", () => {
  const inactive = registryResponse();
  const inactiveMeta = ((inactive.servers as Array<Record<string, unknown>>)[0]._meta as Record<string, Record<string, unknown>>)
    ["io.modelcontextprotocol.registry/official"];
  inactiveMeta.status = "deleted";
  assert.throws(() => classifyMcpRegistryRecord(inactive, metadata), /active/i);

  const notLatest = registryResponse();
  const latestMeta = ((notLatest.servers as Array<Record<string, unknown>>)[0]._meta as Record<string, Record<string, unknown>>)
    ["io.modelcontextprotocol.registry/official"];
  latestMeta.isLatest = false;
  assert.throws(() => classifyMcpRegistryRecord(notLatest, metadata), /latest/i);
});

test("rejects Registry remote drift", () => {
  assert.throws(() => classifyMcpRegistryRecord(registryResponse([
    registryServer({ remotes: [{ type: "streamable-http", url: "https://example.com/api/mcp" }] })
  ]), metadata), /immutable conflict/i);
});

test("rejects wrong source run, tag, or SHA", async () => {
  for (const [field, value] of [
    ["runId", "31000000002"],
    ["releaseTag", "all-v0.6.3"],
    ["gitSha", "deadbeef12345678"]
  ] as const) {
    await withFixture(async (paths) => {
      await assert.rejects(buildMcpRegistryPublicationEvidence({
        ...paths,
        ...source,
        [field]: value,
        registryQueryUrl: "https://registry.modelcontextprotocol.io/v0.1/servers",
        registryQueriedAt: "2026-07-13T08:01:00Z"
      }), /production evidence|MCP Registry version/i);
    });
  }
});

test("rejects a production endpoint that differs from Registry metadata", async () => {
  await withFixture(async (paths) => {
    await writeFile(paths.productionEvidencePath, JSON.stringify(productionEvidence({
      deployment: {
        environment: "production",
        worker_base_url: "https://agent-radar.zation1.workers.dev",
        mcp_endpoint: "https://example.com/api/mcp"
      }
    })), "utf8");
    await assert.rejects(buildMcpRegistryPublicationEvidence({
      ...paths,
      ...source,
      registryQueryUrl: "https://registry.modelcontextprotocol.io/v0.1/servers",
      registryQueriedAt: "2026-07-13T08:01:00Z"
    }), /production MCP endpoint/i);
  });
});

async function withFixture(run: (paths: {
  productionEvidencePath: string;
  metadataPath: string;
  registryResponsePath: string;
}) => Promise<void>): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "agent-radar-registry-evidence-"));
  const paths = {
    productionEvidencePath: join(directory, "production-evidence.json"),
    metadataPath: join(directory, "server.json"),
    registryResponsePath: join(directory, "registry-response.json")
  };
  try {
    await Promise.all([
      writeFile(paths.productionEvidencePath, JSON.stringify(productionEvidence()), "utf8"),
      writeFile(paths.metadataPath, JSON.stringify(metadata), "utf8"),
      writeFile(paths.registryResponsePath, JSON.stringify(registryResponse()), "utf8")
    ]);
    await run(paths);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
