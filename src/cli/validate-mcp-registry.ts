import { readFile } from "node:fs/promises";
import { validateMcpRegistryMetadata } from "../release/mcp-registry.js";

function optionValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const releaseTag = optionValue("--release-tag");
  const metadataPath = optionValue("--metadata") ?? "dist-pages/server.json";
  if (!releaseTag) {
    throw new Error("Missing required --release-tag");
  }

  const metadata = JSON.parse(await readFile(metadataPath, "utf8")) as unknown;
  const validated = validateMcpRegistryMetadata(metadata, { releaseTag });
  process.stdout.write(`MCP Registry metadata valid: ${validated.name}@${validated.version}\n`);
}

await main();
