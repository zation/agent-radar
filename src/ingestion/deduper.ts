import type { ToolCard } from "../schema.js";

export interface ToolCardDuplicateSignal {
  kind: "id" | "canonical_url";
  value: string;
}

export interface ToolCardDuplicateReportItem {
  tool_id: string;
  name: string;
  duplicate_of_tool_ids: string[];
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
  const items = drafts.map((draft) => buildDuplicateReportItem(draft, existingToolCards)).filter((item) => item.duplicate_of_tool_ids.length > 0);

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
  const draftKeys = canonicalToolKeys(draft);
  return existingToolCards.filter((card) => card.id === draft.id || canonicalToolKeys(card).some((key) => draftKeys.includes(key))).map((card) => card.id);
}

function buildDuplicateReportItem(draft: ToolCard, existingToolCards: ToolCard[]): ToolCardDuplicateReportItem {
  const signals = findDuplicateSignals(draft, existingToolCards);
  return {
    tool_id: draft.id,
    name: draft.name,
    duplicate_of_tool_ids: findDuplicateToolIds(draft, existingToolCards),
    match_signals: signals
  };
}

function findDuplicateSignals(draft: ToolCard, existingToolCards: ToolCard[]): ToolCardDuplicateSignal[] {
  const signals: ToolCardDuplicateSignal[] = [];
  if (existingToolCards.some((card) => card.id === draft.id)) signals.push({ kind: "id", value: draft.id });

  const existingKeys = new Set(existingToolCards.flatMap((card) => canonicalToolKeys(card)));
  for (const key of canonicalToolKeys(draft)) {
    if (existingKeys.has(key)) signals.push({ kind: "canonical_url", value: key });
  }

  return signals;
}

function canonicalToolKeys(card: ToolCard): string[] {
  return [card.repo_url, card.homepage_url, card.docs_url, ...(card.package_urls ?? [])]
    .filter((value): value is string => Boolean(value))
    .map((value) => value.toLowerCase().replace(/\.git$/, "").replace(/\/$/, ""));
}
