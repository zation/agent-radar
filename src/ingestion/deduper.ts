import type { ToolCard } from "../schema.js";

export interface ToolCardDuplicateSignal {
  kind: "id" | "canonical_url" | "package_url" | "draft_id" | "draft_canonical_url" | "draft_package_url";
  value: string;
}

export interface ToolCardDuplicateReportItem {
  tool_id: string;
  name: string;
  duplicate_of_tool_ids: string[];
  duplicate_of_draft_tool_ids: string[];
  match_signals: ToolCardDuplicateSignal[];
}

export interface ToolCardDuplicateReport {
  schema_version: "tool_card_duplicate_report.v1";
  generated_at: string;
  summary: {
    total_drafts: number;
    possible_duplicates: number;
  };
  items: ToolCardDuplicateReportItem[];
}

export function buildToolCardDuplicateReport(drafts: ToolCard[], existingToolCards: ToolCard[], generatedAt: string): ToolCardDuplicateReport {
  const items = drafts
    .map((draft) => buildDuplicateReportItem(draft, drafts, existingToolCards))
    .filter((item) => item.duplicate_of_tool_ids.length > 0 || item.duplicate_of_draft_tool_ids.length > 0);

  return {
    schema_version: "tool_card_duplicate_report.v1",
    generated_at: generatedAt,
    summary: {
      total_drafts: drafts.length,
      possible_duplicates: items.length
    },
    items
  };
}

export function findDuplicateToolIds(draft: ToolCard, existingToolCards: ToolCard[]): string[] {
  const draftKeys = canonicalAllKeys(draft);
  return existingToolCards.filter((card) => card.id === draft.id || canonicalAllKeys(card).some((key) => draftKeys.includes(key))).map((card) => card.id);
}

export function findDuplicateDraftToolIds(draft: ToolCard, drafts: ToolCard[]): string[] {
  const draftKeys = canonicalAllKeys(draft);
  return drafts
    .filter((candidate) => candidate !== draft)
    .filter((candidate) => candidate.id === draft.id || canonicalAllKeys(candidate).some((key) => draftKeys.includes(key)))
    .map((candidate) => candidate.id);
}

function buildDuplicateReportItem(draft: ToolCard, drafts: ToolCard[], existingToolCards: ToolCard[]): ToolCardDuplicateReportItem {
  const signals = findDuplicateSignals(draft, drafts, existingToolCards);
  return {
    tool_id: draft.id,
    name: draft.name,
    duplicate_of_tool_ids: findDuplicateToolIds(draft, existingToolCards),
    duplicate_of_draft_tool_ids: findDuplicateDraftToolIds(draft, drafts),
    match_signals: signals
  };
}

function findDuplicateSignals(draft: ToolCard, drafts: ToolCard[], existingToolCards: ToolCard[]): ToolCardDuplicateSignal[] {
  const signals: ToolCardDuplicateSignal[] = [];
  if (existingToolCards.some((card) => card.id === draft.id)) signals.push({ kind: "id", value: draft.id });

  const existingKeys = new Set(existingToolCards.flatMap((card) => canonicalToolKeys(card)));
  const existingPackageKeys = new Set(existingToolCards.flatMap((card) => canonicalPackageKeys(card)));
  for (const key of canonicalToolKeys(draft)) {
    if (existingKeys.has(key)) signals.push({ kind: "canonical_url", value: key });
  }
  for (const key of canonicalPackageKeys(draft)) {
    if (existingPackageKeys.has(key)) signals.push({ kind: "package_url", value: key });
  }

  if (drafts.some((candidate) => candidate !== draft && candidate.id === draft.id)) signals.push({ kind: "draft_id", value: draft.id });

  const draftKeys = new Set(drafts.filter((candidate) => candidate !== draft).flatMap((candidate) => canonicalToolKeys(candidate)));
  const draftPackageKeys = new Set(drafts.filter((candidate) => candidate !== draft).flatMap((candidate) => canonicalPackageKeys(candidate)));
  for (const key of canonicalToolKeys(draft)) {
    if (draftKeys.has(key)) signals.push({ kind: "draft_canonical_url", value: key });
  }
  for (const key of canonicalPackageKeys(draft)) {
    if (draftPackageKeys.has(key)) signals.push({ kind: "draft_package_url", value: key });
  }

  return signals;
}

function canonicalToolKeys(card: ToolCard): string[] {
  const identityUrls = card.type === "skill" && card.docs_url
    ? [card.docs_url]
    : card.repo_url
    ? [card.repo_url]
    : [card.homepage_url, card.docs_url];
  return identityUrls
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\.git$/, "").replace(/\/$/, ""));
}

function canonicalAllKeys(card: ToolCard): string[] {
  return [...canonicalToolKeys(card), ...canonicalPackageKeys(card)];
}

function canonicalPackageKeys(card: ToolCard): string[] {
  return (card.package_urls ?? []).map(canonicalPackageUrl);
}

function canonicalPackageUrl(value: string): string {
  const normalized = value.toLowerCase().replace(/\/$/, "");
  return normalized.replace("https://www.npmjs.com/package/", "npm:");
}
