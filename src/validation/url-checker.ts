import type { ToolCard } from "../schema.js";

export type ToolCardUrlValidationStatusV2 =
  | "reachable"
  | "permanent_failure"
  | "auth_required"
  | "rate_limited"
  | "transient_error"
  | "skipped";

export interface ToolCardUrlValidationItemV2 {
  tool_id: string;
  field_path: string;
  url: string;
  status: ToolCardUrlValidationStatusV2;
  reason_code: string;
  method: "HEAD" | "GET" | "none";
  http_status?: number;
  final_url?: string;
  redirects: string[];
  checked_at: string;
  attempt_count: number;
  consecutive_failure_count: number;
  last_success_at?: string;
  history_status: "continued" | "no_baseline";
  critical: boolean;
}

export interface ToolCardUrlValidationArtifactV2 {
  schema_version: "tool_card_url_validation.v2";
  generated_at: string;
  options: { enabled: boolean; timeout_ms: number; max_retries: number };
  items: ToolCardUrlValidationItemV2[];
  summary: Record<ToolCardUrlValidationStatusV2, number> & {
    blocking: number;
    stale: number;
  };
}

export interface ToolCardUrlCheckOptionsV2 {
  fetchImpl?: typeof fetch;
  checkedAt: string;
  timeoutMs?: number;
  maxRetries?: number;
  previousArtifact?: ToolCardUrlValidationArtifactV2;
  sleepImpl?: (milliseconds: number) => Promise<void>;
}

interface UrlCandidate {
  tool_id: string;
  field_path: string;
  url: string;
  critical: boolean;
}

interface CheckResult {
  status: ToolCardUrlValidationStatusV2;
  reason_code: string;
  method: "HEAD" | "GET" | "none";
  http_status?: number;
  final_url?: string;
  redirects: string[];
  attempt_count: number;
}

export async function checkToolCardUrlsV2(
  cards: ToolCard[],
  options: ToolCardUrlCheckOptionsV2,
): Promise<ToolCardUrlValidationArtifactV2> {
  const timeoutMs = options.timeoutMs ?? 5000;
  const maxRetries = options.maxRetries ?? 2;
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const previousByKey = new Map(
    (options.previousArtifact?.items ?? []).map((item) => [historyKey(item), item]),
  );
  const resultByUrl = new Map<string, Promise<CheckResult>>();
  const candidates = collectUrlCandidates(cards);
  for (const candidate of candidates) {
    let resultPromise = resultByUrl.get(candidate.url);
    if (!resultPromise) {
      resultPromise = checkUrl(candidate.url, fetchImpl, timeoutMs, maxRetries, sleepImpl);
      resultByUrl.set(candidate.url, resultPromise);
    }
  }
  const items = await Promise.all(candidates.map(async (candidate) => {
    const result = await resultByUrl.get(candidate.url)!;
    const previous = previousByKey.get(historyKey(candidate));
    return withHistory(candidate, result, previous, options.checkedAt);
  }));

  return buildArtifact(items, options.checkedAt, true, timeoutMs, maxRetries);
}

export function buildSkippedToolCardUrlValidationV2(
  cards: ToolCard[],
  checkedAt: string,
  reasonCode: string,
): ToolCardUrlValidationArtifactV2 {
  const items = collectUrlCandidates(cards).map((candidate) => ({
    ...candidate,
    status: "skipped" as const,
    reason_code: reasonCode,
    method: "none" as const,
    redirects: [],
    checked_at: checkedAt,
    attempt_count: 0,
    consecutive_failure_count: 0,
    history_status: "no_baseline" as const,
  }));
  return buildArtifact(items, checkedAt, false, 5000, 2);
}

async function checkUrl(
  value: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxRetries: number,
  sleepImpl: (milliseconds: number) => Promise<void>,
): Promise<CheckResult> {
  const parsed = safeUrl(value);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return skipped("non_http_url");
  }
  if (parsed.username || parsed.password) {
    return permanent("url_contains_credentials");
  }

  const head = await requestWithRetries(value, "HEAD", fetchImpl, timeoutMs, maxRetries, sleepImpl);
  if (head.http_status === 405 || head.http_status === 501) {
    const get = await requestWithRetries(value, "GET", fetchImpl, timeoutMs, maxRetries, sleepImpl);
    return { ...get, attempt_count: head.attempt_count + get.attempt_count };
  }
  return head;
}

async function requestWithRetries(
  url: string,
  method: "HEAD" | "GET",
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxRetries: number,
  sleepImpl: (milliseconds: number) => Promise<void>,
): Promise<CheckResult> {
  let lastResult: CheckResult | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const result = await requestOnce(url, method, fetchImpl, timeoutMs);
    lastResult = { ...result, attempt_count: attempt };
    if (!isRetryable(lastResult) || attempt > maxRetries) return lastResult;
    await sleepImpl(50 * attempt);
  }
  return lastResult ?? transient(method, "request_failed", 0);
}

async function requestOnce(
  url: string,
  method: "HEAD" | "GET",
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method,
      signal: controller.signal,
      redirect: "follow",
      headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
    });
    const finalUrl = response.url || url;
    const finalParsed = safeUrl(finalUrl);
    if (!finalParsed || !/^https?:$/.test(finalParsed.protocol) || finalParsed.username || finalParsed.password) {
      return {
        ...permanent("unsafe_redirect_target"),
        method,
        http_status: response.status,
        final_url: finalUrl,
        redirects: finalUrl === url ? [] : [finalUrl],
      };
    }
    return classifyResponse(response.status, method, url, finalUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "request_failed";
    if (/ENOTFOUND|certificate|CERT_|ERR_TLS|domain/i.test(message)) {
      return { ...permanent("dns_or_tls_failure"), method };
    }
    return {
      ...transient(method, controller.signal.aborted ? "request_timeout" : "network_error", 1),
    };
  } finally {
    clearTimeout(timer);
  }
}

function classifyResponse(
  status: number,
  method: "HEAD" | "GET",
  originalUrl: string,
  finalUrl: string,
): CheckResult {
  const common = {
    method,
    http_status: status,
    final_url: finalUrl,
    redirects: finalUrl === originalUrl ? [] : [finalUrl],
    attempt_count: 1,
  };
  if (status >= 200 && status < 400) return { ...common, status: "reachable", reason_code: `http_${status}` };
  if (status === 401 || status === 403) return { ...common, status: "auth_required", reason_code: `http_${status}` };
  if (status === 429) return { ...common, status: "rate_limited", reason_code: "http_429" };
  if (status === 404 || status === 410) return { ...common, status: "permanent_failure", reason_code: `http_${status}` };
  if (status >= 500) return { ...common, status: "transient_error", reason_code: `http_${status}` };
  return { ...common, status: "permanent_failure", reason_code: `http_${status}` };
}

function withHistory(
  candidate: UrlCandidate,
  result: CheckResult,
  previous: ToolCardUrlValidationItemV2 | undefined,
  checkedAt: string,
): ToolCardUrlValidationItemV2 {
  const succeeded = result.status === "reachable";
  const previousSucceeded = previous?.status === "reachable";
  return {
    ...candidate,
    ...result,
    checked_at: checkedAt,
    consecutive_failure_count: succeeded
      ? 0
      : previous && !previousSucceeded
        ? previous.consecutive_failure_count + 1
        : 1,
    last_success_at: succeeded
      ? checkedAt
      : previousSucceeded
        ? previous.checked_at
        : previous?.last_success_at,
    history_status: previous ? "continued" : "no_baseline",
  };
}

function buildArtifact(
  items: ToolCardUrlValidationItemV2[],
  generatedAt: string,
  enabled: boolean,
  timeoutMs: number,
  maxRetries: number,
): ToolCardUrlValidationArtifactV2 {
  const count = (status: ToolCardUrlValidationStatusV2): number =>
    items.filter((item) => item.status === status).length;
  return {
    schema_version: "tool_card_url_validation.v2",
    generated_at: generatedAt,
    options: { enabled, timeout_ms: timeoutMs, max_retries: maxRetries },
    items,
    summary: {
      reachable: count("reachable"),
      permanent_failure: count("permanent_failure"),
      auth_required: count("auth_required"),
      rate_limited: count("rate_limited"),
      transient_error: count("transient_error"),
      skipped: count("skipped"),
      blocking: items.filter(isBlocking).length,
      stale: items.filter((item) => isStale(item, generatedAt)).length,
    },
  };
}

function isBlocking(item: ToolCardUrlValidationItemV2): boolean {
  if (!item.critical) return false;
  if (item.status === "permanent_failure") return true;
  return item.status === "transient_error" && item.consecutive_failure_count >= 2;
}

function isStale(item: ToolCardUrlValidationItemV2, generatedAt: string): boolean {
  if (!item.last_success_at) return false;
  return Date.parse(generatedAt) - Date.parse(item.last_success_at) > 30 * 24 * 60 * 60 * 1000;
}

function collectUrlCandidates(cards: ToolCard[]): UrlCandidate[] {
  return cards.flatMap((card) => {
    const entries: Array<Omit<UrlCandidate, "tool_id">> = [
      ...card.source_urls.map((url, index) => ({ url, field_path: `source_urls[${index}]`, critical: true })),
      ...(card.docs_url ? [{ url: card.docs_url, field_path: "docs_url", critical: true }] : []),
      ...(card.repo_url ? [{ url: card.repo_url, field_path: "repo_url", critical: true }] : []),
      ...(card.homepage_url ? [{ url: card.homepage_url, field_path: "homepage_url", critical: false }] : []),
      ...(card.package_urls ?? []).map((url, index) => ({ url, field_path: `package_urls[${index}]`, critical: true })),
      ...card.install_methods.flatMap((method, index) =>
        method.docs_url.trim()
          ? [{ url: method.docs_url, field_path: `install_methods[${index}].docs_url`, critical: true }]
          : [],
      ),
    ];
    return entries.map((entry) => ({ tool_id: card.id, ...entry }));
  });
}

function isRetryable(result: CheckResult): boolean {
  return result.status === "rate_limited" || result.status === "transient_error";
}

function skipped(reasonCode: string): CheckResult {
  return { status: "skipped", reason_code: reasonCode, method: "none", redirects: [], attempt_count: 0 };
}

function permanent(reasonCode: string): CheckResult {
  return { status: "permanent_failure", reason_code: reasonCode, method: "none", redirects: [], attempt_count: 0 };
}

function transient(method: "HEAD" | "GET", reasonCode: string, attemptCount: number): CheckResult {
  return { status: "transient_error", reason_code: reasonCode, method, redirects: [], attempt_count: attemptCount };
}

function historyKey(item: Pick<ToolCardUrlValidationItemV2, "tool_id" | "field_path" | "url">): string {
  return `${item.tool_id}\u0000${item.field_path}\u0000${item.url}`;
}

function safeUrl(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    return undefined;
  }
}
