import type { ToolCard } from "../schema.js";
import type { OverrideRecord } from "../ingestion/normalizer.js";

export interface ToolCardValidationResult {
  schema_version: "tool_card_validation.v1";
  checked_count: number;
  summary: {
    errors: number;
    warnings: number;
  };
  passed: boolean;
  errors: string[];
  warnings: string[];
}

export interface ToolCardValidationOptions {
  overrideRecords?: OverrideRecord[];
}

export interface ToolCardUrlValidationItem {
  tool_id: string;
  url: string;
  field: string;
  status: "reachable" | "failed" | "skipped";
  method?: "HEAD" | "GET";
  http_status?: number;
  reason?: string;
}

export interface ToolCardUrlValidationArtifact {
  schema_version: "tool_card_url_validation.v1";
  checked_at: string;
  summary: {
    checked: number;
    reachable: number;
    failed: number;
    skipped: number;
  };
  items: ToolCardUrlValidationItem[];
}

export interface ToolCardUrlCheckOptions {
  fetchImpl?: typeof fetch;
  checkedAt: string;
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
    validateUrlFieldEvidence(card, errors);
    validateCriticalFieldEvidence(card, warnings);
    validateOverrideEvidenceRefs(card, overrideIds, errors);
  }

  return {
    schema_version: "tool_card_validation.v1",
    checked_count: cards.length,
    summary: {
      errors: errors.length,
      warnings: warnings.length
    },
    passed: errors.length === 0,
    errors,
    warnings
  };
}

export async function checkToolCardUrls(cards: ToolCard[], options: ToolCardUrlCheckOptions): Promise<ToolCardUrlValidationArtifact> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const candidates = dedupeUrlCandidates(cards);
  const items: ToolCardUrlValidationItem[] = [];

  for (const candidate of candidates) {
    if (!isHttpUrl(candidate.url)) {
      items.push({ ...candidate, status: "skipped", reason: "non_http_url" });
      continue;
    }
    items.push(await checkUrl(candidate, fetchImpl));
  }

  return {
    schema_version: "tool_card_url_validation.v1",
    checked_at: options.checkedAt,
    summary: {
      checked: items.filter((item) => item.status !== "skipped").length,
      reachable: items.filter((item) => item.status === "reachable").length,
      failed: items.filter((item) => item.status === "failed").length,
      skipped: items.filter((item) => item.status === "skipped").length
    },
    items
  };
}

export function buildSkippedToolCardUrlValidation(cards: ToolCard[], checkedAt: string, reason: string): ToolCardUrlValidationArtifact {
  const items = dedupeUrlCandidates(cards).map((candidate) => ({
    ...candidate,
    status: "skipped" as const,
    reason
  }));

  return {
    schema_version: "tool_card_url_validation.v1",
    checked_at: checkedAt,
    summary: {
      checked: 0,
      reachable: 0,
      failed: 0,
      skipped: items.length
    },
    items
  };
}

function dedupeUrlCandidates(cards: ToolCard[]): Array<{ tool_id: string; url: string; field: string }> {
  const seen = new Set<string>();
  const candidates: Array<{ tool_id: string; url: string; field: string }> = [];

  for (const card of cards) {
    const entries = collectUrlEntries(card);
    for (const entry of entries) {
      const key = `${card.id}:${entry.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      candidates.push({ tool_id: card.id, ...entry });
    }
  }

  return candidates;
}

function collectUrlEntries(card: ToolCard): Array<{ url: string; field: string }> {
  return [
    ...card.source_urls.map((url) => ({ url, field: "source_urls" })),
    ...(card.docs_url ? [{ url: card.docs_url, field: "docs_url" }] : []),
    ...(card.repo_url ? [{ url: card.repo_url, field: "repo_url" }] : []),
    ...(card.homepage_url ? [{ url: card.homepage_url, field: "homepage_url" }] : []),
    ...(card.package_urls ?? []).map((url) => ({ url, field: "package_urls" })),
    ...card.install_methods.map((method) => ({ url: method.docs_url, field: "install_methods.docs_url" })).filter((entry) => entry.url.trim().length > 0)
  ];
}

async function checkUrl(candidate: { tool_id: string; url: string; field: string }, fetchImpl: typeof fetch): Promise<ToolCardUrlValidationItem> {
  try {
    const head = await fetchImpl(candidate.url, { method: "HEAD" });
    if (isReachableStatus(head.status)) return { ...candidate, status: "reachable", method: "HEAD", http_status: head.status };
    if (head.status !== 405) return { ...candidate, status: "failed", method: "HEAD", http_status: head.status };

    const get = await fetchImpl(candidate.url, { method: "GET" });
    return isReachableStatus(get.status)
      ? { ...candidate, status: "reachable", method: "GET", http_status: get.status }
      : { ...candidate, status: "failed", method: "GET", http_status: get.status };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "url_check_failed";
    return { ...candidate, status: "failed", method: "HEAD", reason };
  }
}

function isReachableStatus(status: number): boolean {
  return status >= 200 && status < 400;
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
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

function validateUrlFieldEvidence(card: ToolCard, errors: string[]): void {
  const sourceUrls = new Set(card.source_urls);

  if (card.docs_url && !sourceUrls.has(card.docs_url)) errors.push(`${card.id}: docs_url must be included in source_urls`);
  if (card.repo_url && !sourceUrls.has(card.repo_url)) errors.push(`${card.id}: repo_url must be included in source_urls`);
  if (card.homepage_url && !sourceUrls.has(card.homepage_url)) errors.push(`${card.id}: homepage_url must be included in source_urls`);

  if (card.package_urls?.some((url) => !sourceUrls.has(url))) {
    errors.push(`${card.id}: package_urls must be included in source_urls`);
  }

  if (card.install_methods.some((method) => method.docs_url && !sourceUrls.has(method.docs_url))) {
    errors.push(`${card.id}: install_methods docs_url must be included in source_urls`);
  }
}

function validateCriticalFieldEvidence(card: ToolCard, warnings: string[]): void {
  if (hasManualReviewEvidence(card)) return;

  for (const field of ["permissions", "security", "maintenance"]) {
    if (!hasFieldEvidence(card, field)) warnings.push(`${card.id}: ${field} lacks field-level evidence ref`);
  }
}

function hasManualReviewEvidence(card: ToolCard): boolean {
  return card.evidence_refs.some((ref) => ref.startsWith("manual-review-"));
}

function hasFieldEvidence(card: ToolCard, field: string): boolean {
  return card.evidence_refs.some((ref) => ref === `field:${field}` || ref.startsWith(`field:${field}:`) || ref.endsWith(`#${field}`));
}

function isIsoUtc(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value);
}
