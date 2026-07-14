import assert from "node:assert/strict";
import { execFile as execFileCallback } from "node:child_process";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { promisify } from "node:util";
import {
  registryVersionFromTag,
  validateMcpRegistryMetadata
} from "../src/release/mcp-registry.js";

const execFile = promisify(execFileCallback);
const metadata = JSON.parse(await readFile("server.json", "utf8")) as unknown;

test("server.json defines exact remote-only Agent Radar Registry metadata", () => {
  const validated = validateMcpRegistryMetadata(metadata, { releaseTag: "all-v0.6.4" });

  assert.equal(validated.$schema, "https://static.modelcontextprotocol.io/schemas/2025-12-11/server.schema.json");
  assert.equal(validated.name, "io.github.zation/agent-radar");
  assert.equal(validated.title, "Agent Radar");
  assert.equal(validated.description, "Search, inspect, recommend, and explain rated AI tools through Agent Radar.");
  assert.equal(validated.version, "0.6.4");
  assert.deepEqual(validated.repository, { url: "https://github.com/zation/agent-radar", source: "github" });
  assert.deepEqual(validated.remotes, [{
    type: "streamable-http",
    url: "https://agent-radar.zation1.workers.dev/api/mcp",
    headers: [{
      name: "X-Agent-Radar-LLM-API-Key",
      description: "LLM provider API key used only by recommend_tools.",
      isRequired: false,
      isSecret: true,
      format: "string"
    }]
  }]);
  assert.equal(Object.hasOwn(validated, "packages"), false);
});

test("Registry version mapping accepts only canonical all-v SemVer tags", () => {
  assert.equal(registryVersionFromTag("all-v0.6.0"), "0.6.0");
  assert.equal(registryVersionFromTag("all-v1.2.3-beta.1"), "1.2.3-beta.1");
  for (const invalid of ["v0.6.0", "all-v0.6", "all-v01.2.3", "all-v0.6.0\ninjected", "all-v0.6.0+build"]) {
    assert.throws(() => registryVersionFromTag(invalid), /canonical all-v SemVer/);
  }
});

test("Registry metadata validator rejects immutable field drift", () => {
  const valid = metadata as Record<string, unknown>;
  const cases: Array<[string, Record<string, unknown>]> = [
    ["version", { ...valid, version: "0.6.3" }],
    ["name", { ...valid, name: "io.github.other/agent-radar" }],
    ["schema", { ...valid, $schema: "https://example.com/schema.json" }],
    ["repository", { ...valid, repository: { url: "https://github.com/other/repo", source: "github" } }],
    ["remote", { ...valid, remotes: [{ type: "sse", url: "https://agent-radar.zation1.workers.dev/api/mcp" }] }],
    ["packages", { ...valid, packages: [] }]
  ];
  for (const [field, value] of cases) {
    assert.throws(
      () => validateMcpRegistryMetadata(value, { releaseTag: "all-v0.6.4" }),
      new RegExp(field, "i")
    );
  }
});

test("Registry metadata validator rejects header weakening and extra remotes", () => {
  const valid = metadata as Record<string, unknown>;
  const remote = (valid.remotes as Array<Record<string, unknown>>)[0];
  assert.throws(() => validateMcpRegistryMetadata({
    ...valid,
    remotes: [{ ...remote, headers: [{ name: "X-Agent-Radar-LLM-API-Key", isRequired: false, isSecret: false, format: "string" }] }]
  }, { releaseTag: "all-v0.6.4" }), /header/i);
  assert.throws(() => validateMcpRegistryMetadata({
    ...valid,
    remotes: [remote, remote]
  }, { releaseTag: "all-v0.6.4" }), /remote/i);
});

test("Registry validation CLI accepts the checked-in v0.6 metadata", async () => {
  const { stdout } = await execFile(process.execPath, [
    "dist/src/cli/validate-mcp-registry.js",
    "--release-tag",
    "all-v0.6.4"
  ]);
  assert.match(stdout, /io\.github\.zation\/agent-radar@0\.6\.4/);
});
