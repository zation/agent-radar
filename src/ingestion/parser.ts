import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { Confidence, RawSourceSnapshot, SourceDefinition, SourceRecord, ToolCard } from "../schema.js";

interface ManualSeedPayload {
  tools?: Array<Partial<ToolCard> & { id?: string; name?: string }>;
}

export async function parseSnapshot(snapshot: RawSourceSnapshot, source: SourceDefinition, outputDir: string, now: string): Promise<SourceRecord[]> {
  if (snapshot.status !== "success") return [];
  if (source.parser === "manual_seed_parser") return parseManualSeedSnapshot(snapshot, source, outputDir, now);
  return [];
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
