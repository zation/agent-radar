import type { Permission, SourceDefinition, SourceRecord, ToolCard, ToolType } from "../schema.js";
import {
  buildNormalizationEvidence,
  mergeNormalizationEvidence,
  orderSourceRecords,
  type ToolCardNormalizationEvidence,
} from "./normalization-evidence.js";

type SourceProfile = NonNullable<SourceDefinition["profile"]>;

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

export function normalizeToolCardDraftsWithEvidence(
  sourceRecords: SourceRecord[],
  overrideRecords: OverrideRecord[] = [],
  sourceDefinitions: SourceDefinition[] = [],
): { drafts: ToolCard[]; evidence: ToolCardNormalizationEvidence } {
  validateOverrideRecords(overrideRecords);
  const overridesByToolId = groupOverridesByToolId(overrideRecords);
  const evidence: ToolCardNormalizationEvidence[] = [];
  const manualDrafts = sourceRecords.flatMap((record) => {
    if (record.record_type !== "manual" || record.warnings?.length) return [];
    const overrides = overridesByToolId.get(readToolId(record)) ?? [];
    const draft = normalizeManualToolCardDraft(record, overrides);
    if (draft) evidence.push(buildNormalizationEvidence(draft, [record], overrides, sourceDefinitions));
    return draft ? [draft] : [];
  });
  const sourceBackedDrafts = groupSourceBackedRecords(sourceRecords).flatMap((groupedRecords) => {
    const records = orderSourceRecords(groupedRecords, sourceDefinitions);
    const draft = normalizeSourceBackedToolCardDraft(records, overridesByToolId);
    if (!draft) return [];
    const overrides = overridesByToolId.get(draft.id) ?? [];
    evidence.push(buildNormalizationEvidence(draft, records, overrides, sourceDefinitions));
    return [draft];
  });

  return {
    drafts: [...manualDrafts, ...sourceBackedDrafts],
    evidence: mergeNormalizationEvidence(evidence),
  };
}

export function normalizeToolCardDrafts(sourceRecords: SourceRecord[], overrideRecords: OverrideRecord[] = []): ToolCard[] {
  return normalizeToolCardDraftsWithEvidence(sourceRecords, overrideRecords).drafts;
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

function normalizeSourceBackedToolCardDraft(records: SourceRecord[], overridesByToolId: Map<string, OverrideRecord[]>): ToolCard | undefined {
  const primaryRecord = choosePrimaryRecord(records);
  const mergedFields = mergeParsedFields(records);
  const profile = mergeSourceProfiles(records);
  const repoUrl = readString(mergedFields.repo_url) ?? records.flatMap((record) => record.urls).find((url) => url.includes("github.com"));
  const summary = profile.summary ?? records.find((record) => record.description?.trim())?.description?.trim();
  const packageUrl = readString(mergedFields.package_url);
  const homepageUrl = profile.homepage_url ?? readString(mergedFields.homepage_url);
  const docsUrl = profile.docs_url ?? readString(mergedFields.docs_url);
  if ((!repoUrl && !docsUrl && !homepageUrl) || !summary) return undefined;

  const topics = [...new Set([...readStringArray(mergedFields.topics), ...readStringArray(mergedFields.keywords)])];
  const toolType = profile.type ?? inferToolType(primaryRecord, topics);
  const toolId = profile.tool_id ?? `${toolType}-${slugify(primaryRecord.name)}`;
  const license = normalizeLicense(readString(mergedFields.license));
  const lastCommitAt = readString(mergedFields.last_commit_at);
  const lastReleaseAt = readString(mergedFields.last_release_at);
  const packageName = readString(mergedFields.package_name);
  const sourceUrls = [...new Set([repoUrl, packageUrl, homepageUrl, docsUrl, ...records.flatMap((record) => record.urls)].filter((url): url is string => Boolean(url)))];
  const tags = [...new Set([toolType, ...topics, ...(profile.tags ?? [])])].slice(0, 16);
  const installMethods = profile.install_methods ?? buildInstallMethods(repoUrl, packageUrl, packageName, primaryRecord.source_confidence);
  if (installMethods.length === 0) installMethods.push({ method: "manual", command: "", docs_url: docsUrl ?? homepageUrl ?? sourceUrls[0] ?? "", confidence: primaryRecord.source_confidence });

  const draft: ToolCard = {
    id: toolId,
    schema_version: "tool_card.v1",
    name: profile.name ?? primaryRecord.name,
    type: toolType,
    secondary_types: profile.secondary_types ?? inferSecondaryTypes(topics, toolType),
    summary,
    source_urls: sourceUrls,
    repo_url: repoUrl,
    homepage_url: homepageUrl,
    docs_url: docsUrl,
    package_urls: packageUrl ? [packageUrl] : undefined,
    license,
    primary_purpose: profile.primary_purpose ?? inferPrimaryPurpose(toolType, tags),
    use_cases: profile.use_cases ?? [`Evaluate ${profile.name ?? primaryRecord.name} for ${toolType} workflows.`],
    not_for: profile.not_for ?? ["Production use before reviewing the repository, license, permissions, and install instructions."],
    tags,
    supported_agents: profile.supported_agents,
    install_methods: installMethods,
    auth_required: profile.auth_required ?? "none",
    permissions: profile.permissions ?? defaultPermissions(repoUrl),
    maintenance: {
      status: profile.maintenance?.status ?? (lastCommitAt || lastReleaseAt ? "active" : "unknown"),
      last_release_at: lastReleaseAt,
      last_commit_at: lastCommitAt,
      issue_activity: profile.maintenance?.issue_activity ?? "unknown",
      maintainer_type: profile.maintenance?.maintainer_type ?? inferMaintainerType(profile),
      signals: [...new Set([...(profile.maintenance?.signals ?? []), ...buildMaintenanceSignals(mergedFields)])]
    },
    security: profile.security ?? {
      risk_level: "medium",
      trust_level: "active_open_source",
      known_risks: ["unreviewed_open_source_code"],
      requires_human_approval: false,
      security_notes: "Generated from public GitHub metadata only; review code, permissions, and install path before use."
    },
    maturity: profile.maturity ?? "unknown",
    evidence_refs: [...records.map((record) => record.id), ...buildProfileFieldEvidenceRefs(records, profile, mergedFields)],
    last_checked_at: primaryRecord.parsed_at,
    confidence: records.some((record) => record.source_confidence === "high") ? "high" : "medium",
    created_at: primaryRecord.parsed_at,
    updated_at: primaryRecord.parsed_at,
    ai_decision_notes: profile.ai_decision_notes ?? {
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

function buildProfileFieldEvidenceRefs(records: SourceRecord[], profile: SourceProfile, fields: Record<string, unknown>): string[] {
  const refs: string[] = [];
  const profileFieldRef = (field: keyof SourceProfile): string => {
    const profileInfo = records.map(readProfileInfo).find((candidate) => candidate?.profile[field] !== undefined);
    return `field:${String(field)}:${profileInfo?.path ?? "source_profile"}`;
  };
  if (profile.permissions) refs.push(profileFieldRef("permissions"));
  if (profile.security) refs.push(profileFieldRef("security"));
  if (profile.maintenance) refs.push(profileFieldRef("maintenance"));
  else if (typeof fields.last_commit_at === "string" || typeof fields.last_release_at === "string") refs.push("field:maintenance:source_record");
  return refs;
}

function groupSourceBackedRecords(sourceRecords: SourceRecord[]): SourceRecord[][] {
  const groups = new Map<string, SourceRecord[]>();
  const ungrouped: SourceRecord[][] = [];

  for (const record of sourceRecords) {
    if (record.record_type !== "repository" && record.record_type !== "package" && record.record_type !== "doc_page") continue;
    const key = canonicalRecordKey(record);
    if (!key) {
      ungrouped.push([record]);
      continue;
    }
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }

  return [...groups.values(), ...ungrouped];
}

function canonicalRecordKey(record: SourceRecord): string | undefined {
  const profile = readSourceProfile(record);
  const canonicalIdentity = readString(record.parsed_fields.canonical_identity);
  if (canonicalIdentity) return `identity:${canonicalUrl(canonicalIdentity)}`;
  const repoUrl = readString(record.parsed_fields.repo_url) ?? record.urls.find((url) => url.includes("github.com"));
  if (repoUrl) return `repo:${canonicalUrl(repoUrl)}`;
  const packageUrl = readString(record.parsed_fields.package_url);
  if (packageUrl) return `package:${canonicalPackageUrl(packageUrl)}`;
  const docsUrl = readString(record.parsed_fields.docs_url);
  if (docsUrl) return `docs:${canonicalUrl(docsUrl)}`;
  if (profile?.tool_id) return `profile:${profile.tool_id}`;
  return undefined;
}

function choosePrimaryRecord(records: SourceRecord[]): SourceRecord {
  return records.find((record) => record.record_type === "repository" && record.name.includes("/")) ?? records[0];
}

function mergeParsedFields(records: SourceRecord[]): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  for (const record of records) {
    for (const [key, value] of Object.entries(record.parsed_fields)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        const incoming = copyArrayValues(value);
        const existingValue = merged[key];
        const existing = Array.isArray(existingValue) ? copyArrayValues(existingValue) : [];
        merged[key] = [...new Set<unknown>([...existing, ...incoming])];
      } else if (merged[key] === undefined) {
        merged[key] = value;
      }
    }
  }
  return merged;
}

function copyArrayValues(value: unknown[]): unknown[] {
  return Array.from(value, (item: unknown) => item);
}

function buildInstallMethods(repoUrl: string | undefined, packageUrl: string | undefined, packageName: string | undefined, confidence: SourceRecord["source_confidence"]): ToolCard["install_methods"] {
  const methods: ToolCard["install_methods"] = [];
  if (packageUrl && packageName) methods.push({ method: "npm", command: `npm install ${packageName}`, docs_url: packageUrl, confidence });
  if (repoUrl) methods.push({ method: "source", command: "", docs_url: repoUrl, confidence });
  return methods;
}

function defaultPermissions(repoUrl: string | undefined): Permission[] {
  return [
    {
      scope: "network",
      access: "read",
      required: false,
      notes: repoUrl ? "Reviewing or cloning the public repository requires network access." : "Reviewing the public source page requires network access."
    }
  ];
}

function inferMaintainerType(profile: SourceProfile): ToolCard["maintenance"]["maintainer_type"] {
  if (profile.security?.trust_level === "official") return "official";
  if (profile.security?.trust_level === "well_known_org" || profile.security?.trust_level === "commercial") return "company";
  return "community";
}

function mergeSourceProfiles(records: SourceRecord[]): SourceProfile {
  const merged: SourceProfile = {};
  for (const record of records) {
    const profile = readSourceProfile(record);
    if (!profile) continue;
    for (const [key, value] of Object.entries(profile) as Array<[keyof SourceProfile, SourceProfile[keyof SourceProfile]]>) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        const existing = Array.isArray(merged[key]) ? (merged[key] as unknown[]) : [];
        (merged as Record<string, unknown>)[key] = [...new Set([...existing, ...value])];
      } else if (isRecord(value) && isRecord(merged[key])) {
        (merged as Record<string, unknown>)[key] = { ...(merged[key] as Record<string, unknown>), ...value };
      } else if (merged[key] === undefined) {
        (merged as Record<string, unknown>)[key] = value;
      }
    }
  }
  return merged;
}

function readSourceProfile(record: SourceRecord): SourceProfile | undefined {
  return readProfileInfo(record)?.profile;
}

function readProfileInfo(record: SourceRecord): { profile: SourceProfile; path: "source_profile" | "generated_tool_profile" } | undefined {
  const reviewed = record.parsed_fields.source_profile;
  if (isRecord(reviewed)) return { profile: reviewed, path: "source_profile" };
  const generated = record.parsed_fields.generated_tool_profile;
  return isRecord(generated) ? { profile: generated, path: "generated_tool_profile" } : undefined;
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

function normalizeLicense(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === "mit") return "MIT";
  return trimmed;
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

function buildMaintenanceSignals(fields: Record<string, unknown>): string[] {
  const signals = ["github_repository_metadata"];
  if (typeof fields.package_name === "string") signals.push("package_registry_metadata");
  if (typeof fields.stars === "number") signals.push(`stars:${fields.stars}`);
  if (typeof fields.last_commit_at === "string") signals.push("recent_commit_metadata_present");
  if (typeof fields.last_release_at === "string") signals.push("package_release_metadata_present");
  if (typeof fields.license === "string") signals.push("license_metadata_present");
  return signals;
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function canonicalUrl(value: string): string {
  return value.toLowerCase().replace(/^git\+/, "").replace(/\.git$/, "").replace(/\/$/, "");
}

function canonicalPackageUrl(value: string): string {
  return canonicalUrl(value).replace("https://www.npmjs.com/package/", "npm:");
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
