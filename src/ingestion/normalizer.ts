import type { SourceRecord, ToolCard, ToolType } from "../schema.js";

export interface OverrideRecord {
  id: string;
  schema_version: "override_record.v1";
  target_type: "tool_card";
  target_id: string;
  field: keyof ToolCard;
  new_value: unknown;
  reason: string;
  evidence_urls: string[];
  created_by: string;
  created_at: string;
}

export function normalizeToolCardDrafts(sourceRecords: SourceRecord[], overrideRecords: OverrideRecord[] = []): ToolCard[] {
  validateOverrideRecords(overrideRecords);
  const overridesByToolId = groupOverridesByToolId(overrideRecords);

  return sourceRecords
    .flatMap((record) => {
      if (record.record_type === "manual" && !record.warnings?.length) return [normalizeManualToolCardDraft(record, overridesByToolId.get(readToolId(record)))];
      if (record.record_type === "repository") return [normalizeRepositoryToolCardDraft(record, overridesByToolId)];
      return [];
    })
    .filter((draft): draft is ToolCard => Boolean(draft));
}

function normalizeManualToolCardDraft(record: SourceRecord, overrideRecords: OverrideRecord[] | undefined): ToolCard | undefined {
  const rawToolCard = record.raw_fields;
  if (!isToolCard(rawToolCard)) return undefined;

  const draft: ToolCard = {
    ...rawToolCard,
    evidence_refs: [record.id],
    updated_at: record.parsed_at
  };

  for (const override of overrideRecords ?? []) {
    draft[override.field] = override.new_value as never;
    draft.evidence_refs = [...new Set([...draft.evidence_refs, override.id])];
  }

  return draft;
}

function normalizeRepositoryToolCardDraft(record: SourceRecord, overridesByToolId: Map<string, OverrideRecord[]>): ToolCard | undefined {
  const repoUrl = readString(record.parsed_fields.repo_url) ?? record.urls.find((url) => url.includes("github.com"));
  const summary = record.description?.trim();
  if (!repoUrl || !summary) return undefined;

  const topics = readStringArray(record.parsed_fields.topics);
  const toolType = inferToolType(record, topics);
  const toolId = `${toolType}-${slugify(record.name)}`;
  const license = readString(record.parsed_fields.license);
  const lastCommitAt = readString(record.parsed_fields.last_commit_at);

  const draft: ToolCard = {
    id: toolId,
    schema_version: "tool_card.v1",
    name: record.name,
    type: toolType,
    secondary_types: inferSecondaryTypes(topics, toolType),
    summary,
    source_urls: [repoUrl],
    repo_url: repoUrl,
    license,
    primary_purpose: inferPrimaryPurpose(toolType, topics),
    use_cases: [`Evaluate ${record.name} for ${toolType} workflows.`],
    not_for: ["Production use before reviewing the repository, license, permissions, and install instructions."],
    tags: [...new Set([toolType, ...topics])].slice(0, 12),
    install_methods: [{ method: "source", command: "", docs_url: repoUrl, confidence: record.source_confidence }],
    auth_required: "none",
    permissions: [{ scope: "network", access: "read", required: false, notes: "Reviewing or cloning the public repository requires network access." }],
    maintenance: {
      status: lastCommitAt ? "active" : "unknown",
      last_commit_at: lastCommitAt,
      issue_activity: "unknown",
      maintainer_type: "community",
      signals: buildMaintenanceSignals(record)
    },
    security: {
      risk_level: "medium",
      trust_level: "active_open_source",
      known_risks: ["unreviewed_open_source_code"],
      requires_human_approval: false,
      security_notes: "Generated from public GitHub metadata only; review code, permissions, and install path before use."
    },
    maturity: "unknown",
    evidence_refs: [record.id],
    last_checked_at: record.parsed_at,
    confidence: record.source_confidence === "high" ? "high" : "medium",
    created_at: record.parsed_at,
    updated_at: record.parsed_at,
    ai_decision_notes: {
      when_to_use: [`Use as a discovery candidate when evaluating ${toolType} tooling.`],
      when_to_avoid: ["Avoid recommending as reliable until docs, permissions, and install method are reviewed."],
      questions_to_ask_human: ["Should this repository be trusted for the current environment?"],
      safe_defaults: ["Inspect README and permissions before installation", "Prefer read-only evaluation first"]
    }
  };

  for (const override of overridesByToolId.get(draft.id) ?? []) {
    draft[override.field] = override.new_value as never;
    draft.evidence_refs = [...new Set([...draft.evidence_refs, override.id])];
  }

  return draft;
}

function validateOverrideRecords(overrideRecords: OverrideRecord[]): void {
  for (const override of overrideRecords) {
    if (override.schema_version !== "override_record.v1") throw new Error(`${override.id}: schema_version must be override_record.v1`);
    if (override.target_type !== "tool_card") throw new Error(`${override.id}: target_type must be tool_card`);
    if (override.evidence_urls.length === 0) throw new Error(`${override.id}: evidence_urls is required`);
    if (!override.reason.trim()) throw new Error(`${override.id}: reason is required`);
    if (!override.created_by.trim()) throw new Error(`${override.id}: created_by is required`);
    if (Number.isNaN(Date.parse(override.created_at))) throw new Error(`${override.id}: created_at must be ISO 8601`);
  }
}

function groupOverridesByToolId(overrideRecords: OverrideRecord[]): Map<string, OverrideRecord[]> {
  const grouped = new Map<string, OverrideRecord[]>();
  for (const override of overrideRecords) {
    grouped.set(override.target_id, [...(grouped.get(override.target_id) ?? []), override]);
  }
  return grouped;
}

function readToolId(record: SourceRecord): string {
  const parsedToolId = record.parsed_fields.tool_id;
  return typeof parsedToolId === "string" ? parsedToolId : "";
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function inferToolType(record: SourceRecord, topics: string[]): ToolType {
  const haystack = `${record.source_id} ${record.name} ${record.description ?? ""} ${topics.join(" ")}`.toLowerCase();
  if (haystack.includes("mcp") || haystack.includes("model-context-protocol")) return "mcp";
  if (haystack.includes("cli")) return "cli";
  if (haystack.includes("framework")) return "framework";
  return "agent";
}

function inferSecondaryTypes(topics: string[], primaryType: ToolType): ToolType[] | undefined {
  const secondary = new Set<ToolType>();
  if (topics.some((topic) => topic.includes("cli"))) secondary.add("cli");
  if (topics.some((topic) => topic.includes("framework"))) secondary.add("framework");
  if (primaryType !== "agent" && topics.some((topic) => topic.includes("agent"))) secondary.add("agent");
  secondary.delete(primaryType);
  return secondary.size > 0 ? [...secondary] : undefined;
}

function inferPrimaryPurpose(toolType: ToolType, topics: string[]): string {
  if (toolType === "mcp") return "mcp_server_or_tooling";
  if (toolType === "cli") return "command_line_ai_tooling";
  if (toolType === "framework") return "agent_framework";
  const firstTopic = topics[0]?.replace(/[^a-z0-9]+/gi, "_").toLowerCase();
  return firstTopic ? `${firstTopic}_tooling` : "ai_agent_tooling";
}

function buildMaintenanceSignals(record: SourceRecord): string[] {
  const signals = ["github_repository_metadata"];
  if (typeof record.parsed_fields.stars === "number") signals.push(`stars:${record.parsed_fields.stars}`);
  if (typeof record.parsed_fields.last_commit_at === "string") signals.push("recent_commit_metadata_present");
  if (typeof record.parsed_fields.license === "string") signals.push("license_metadata_present");
  return signals;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function isToolCard(value: unknown): value is ToolCard {
  if (!isRecord(value)) return false;

  return (
    value.schema_version === "tool_card.v1" &&
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    typeof value.summary === "string" &&
    Array.isArray(value.source_urls) &&
    Array.isArray(value.use_cases) &&
    Array.isArray(value.not_for) &&
    Array.isArray(value.permissions) &&
    typeof value.security === "object" &&
    value.security !== null &&
    typeof value.confidence === "string"
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
