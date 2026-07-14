import assert from "node:assert/strict";
import test from "node:test";
import { buildMcpToolManifest } from "../src/api/mcp-manifest.js";
import { MCP_TOOL_NAMES, toolContracts } from "../src/api/tool-contracts.js";

test("tool contracts define the public tool set once", () => {
  assert.deepEqual(MCP_TOOL_NAMES, [
    "search_tools",
    "get_tool_card",
    "recommend_tools",
    "explain_rating"
  ]);
  assert.deepEqual(Object.keys(toolContracts), MCP_TOOL_NAMES);
  assert.equal(Object.values(toolContracts).every((tool) => tool.annotations.readOnlyHint), true);
  assert.equal(toolContracts.recommend_tools.annotations.idempotentHint, false);
});

test("recommendation contract rejects legacy api_key arguments", () => {
  assert.throws(
    () => toolContracts.recommend_tools.input.parse({ task: "choose", api_key: "secret" }),
    /unrecognized key/i
  );
});

test("recommendation contract accepts the complete public query shape", () => {
  assert.deepEqual(
    toolContracts.recommend_tools.input.parse({
      task: "choose an MCP server",
      language_or_stack: ["TypeScript"],
      environment: ["Cloudflare Workers"],
      preferred_tool_types: ["mcp"],
      allowed_permissions: ["network:read"],
      risk_tolerance: "low",
      existing_tools: ["codex"],
      budget: "free",
      output_format: "json",
      top_k: 3,
      model: "openai/gpt-5-mini"
    }),
    {
      task: "choose an MCP server",
      language_or_stack: ["TypeScript"],
      environment: ["Cloudflare Workers"],
      preferred_tool_types: ["mcp"],
      allowed_permissions: ["network:read"],
      risk_tolerance: "low",
      existing_tools: ["codex"],
      budget: "free",
      output_format: "json",
      top_k: 3,
      model: "openai/gpt-5-mini"
    }
  );
});

test("MCP manifest derives schemas and annotations from shared contracts", () => {
  const manifest = buildMcpToolManifest();

  assert.deepEqual(manifest.tools.map((tool) => tool.name), MCP_TOOL_NAMES);
  assert.equal(manifest.tools.every((tool) => tool.read_only), true);
  assert.equal(manifest.tools.every((tool) => tool.annotations.readOnlyHint), true);
  assert.equal(manifest.tools.every((tool) => tool.input_schema.additionalProperties === false), true);
  const recommendation = manifest.tools.find((tool) => tool.name === "recommend_tools");
  assert.ok(recommendation);
  assert.equal(Object.hasOwn(recommendation.input_schema.properties as object, "api_key"), false);
  assert.equal(typeof recommendation.output_schema, "object");
});

test("every public MCP input parameter has a description", () => {
  const manifest = buildMcpToolManifest();

  for (const tool of manifest.tools) {
    assert.deepEqual(
      findUndescribedProperties(tool.input_schema),
      [],
      `${tool.name} has input parameters without descriptions`
    );
  }
});

function findUndescribedProperties(schema: Record<string, unknown>, parent = ""): string[] {
  const properties = schema.properties as Record<string, Record<string, unknown>> | undefined;
  if (!properties) return [];

  return Object.entries(properties).flatMap(([name, property]) => {
    const path = parent ? `${parent}.${name}` : name;
    const missing = typeof property.description === "string" && property.description.trim() ? [] : [path];
    return [...missing, ...findUndescribedProperties(property, path)];
  });
}
