import type { ToolCard } from "../schema.js";
import type { OverrideRecord } from "../ingestion/normalizer.js";

export interface ToolCardValidationResult {
  schema_version: "tool_card_validation.v1";
  checked_count: number;
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface ToolCardValidationOptions {
  overrideRecords?: OverrideRecord[];
}

export function validateToolCards(cards: ToolCard[], options: ToolCardValidationOptions = {}): ToolCardValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const seenIds = new Set<string>();
  const overrideIds = new Set((options.overrideRecords ?? []).map((record) => record.id));

  for (const card of cards) {
    if (seenIds.has(card.id)) errors.push(`${card.id}: duplicate tool id`);
    seenIds.add(card.id);

    validateRequiredStrings(card, errors);
    validateReleaseQuality(card, errors, warnings);
    validateOverrideEvidenceRefs(card, overrideIds, errors);
  }

  return {
    schema_version: "tool_card_validation.v1",
    checked_count: cards.length,
    passed: errors.length === 0,
    errors,
    warnings
  };
}

function validateOverrideEvidenceRefs(card: ToolCard, overrideIds: Set<string>, errors: string[]): void {
  for (const ref of card.evidence_refs) {
    if (ref.startsWith("override-") && !overrideIds.has(ref)) {
      errors.push(`${card.id}: evidence ref ${ref} requires matching override record`);
    }
  }
}

function validateRequiredStrings(card: ToolCard, errors: string[]): void {
  if (!card.id.trim()) errors.push("tool id is required");
  if (card.schema_version !== "tool_card.v1") errors.push(`${card.id}: schema_version must be tool_card.v1`);
  if (!card.name.trim()) errors.push(`${card.id}: name is required`);
  if (!card.summary.trim()) errors.push(`${card.id}: summary is required`);
  if (!card.primary_purpose.trim()) errors.push(`${card.id}: primary_purpose is required`);
  if (!isIsoUtc(card.last_checked_at)) errors.push(`${card.id}: last_checked_at must be ISO 8601 UTC`);
  if (!isIsoUtc(card.created_at)) errors.push(`${card.id}: created_at must be ISO 8601 UTC`);
  if (!isIsoUtc(card.updated_at)) errors.push(`${card.id}: updated_at must be ISO 8601 UTC`);
}

function validateReleaseQuality(card: ToolCard, errors: string[], warnings: string[]): void {
  if (card.source_urls.length === 0) errors.push(`${card.id}: source_urls is required`);
  if (card.use_cases.length === 0) errors.push(`${card.id}: use_cases is required`);
  if (card.not_for.length === 0) errors.push(`${card.id}: not_for is required`);
  if (card.tags.length === 0) warnings.push(`${card.id}: tags is empty`);
  if (card.install_methods.length === 0) errors.push(`${card.id}: install_methods is required`);
  if (card.evidence_refs.length === 0) errors.push(`${card.id}: evidence_refs is required`);
  if (card.confidence === "low" || card.confidence === "unknown") {
    errors.push(`${card.id}: confidence must be at least medium for reliable release`);
  }
  if (card.security.risk_level === "unknown") errors.push(`${card.id}: security risk_level cannot be unknown`);
  if (!card.security.security_notes.trim()) errors.push(`${card.id}: security_notes is required`);
  if (card.maintenance.status === "deprecated") errors.push(`${card.id}: deprecated cards cannot enter reliable release`);
  if (card.maturity === "deprecated") errors.push(`${card.id}: deprecated maturity cannot enter reliable release`);

  for (const permission of card.permissions) {
    if (permission.scope === "unknown" || permission.access === "unknown") {
      errors.push(`${card.id}: permissions cannot include unknown scope or access`);
      break;
    }
    if (!permission.notes.trim()) warnings.push(`${card.id}: permission ${permission.scope} is missing notes`);
  }
}

function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}
