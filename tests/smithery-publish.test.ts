import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Smithery publish script declares the optional recommendation key as a header", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const command = packageJson.scripts?.["publish:smithery"];

  assert.ok(command, "package.json must expose publish:smithery");
  assert.match(command, /^npx --yes @smithery\/cli@4\.11\.1 mcp publish /);
  assert.match(command, /https:\/\/agent-radar\.zation1\.workers\.dev\/api\/mcp/);
  assert.match(command, /-n zation1\/agent-radar/);

  const schemaArgument = command.match(/--config-schema '(.+)'$/)?.[1];
  assert.ok(schemaArgument, "publish command must include an inline config schema");

  const schema = JSON.parse(schemaArgument) as {
    required?: string[];
    properties?: Record<string, {
      type?: string;
      title?: string;
      description?: string;
      "x-from"?: { header?: string };
    }>;
  };
  assert.equal(schema.required, undefined);
  assert.deepEqual(schema.properties?.llmApiKey, {
    type: "string",
    title: "LLM API Key",
    description: "Optional LLM provider API key used only by recommend_tools.",
    "x-from": { header: "X-Agent-Radar-LLM-API-Key" }
  });
});
