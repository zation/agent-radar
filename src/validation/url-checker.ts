import { lookup } from "node:dns/promises";
import type { ToolCard } from "../schema.js";
import type { ToolCardUrlValidationArtifact } from "./tool-card-validator.js";

const REVIEWED_CROSS_SITE_REDIRECTS: Record<string, string[]> = {
  "mcp-server-neon-jet.vercel.app": ["neon.com"],
  "developers.openai.com": ["learn.chatgpt.com"],
  "google.github.io": ["adk.dev"],
  "aka.ms": ["learn.microsoft.com"],
};

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
  resolveHostname?: (hostname: string) => Promise<string[]>;
  maxConcurrency?: number;
  allowBenchmarkProxyAddresses?: boolean;
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
  const resolveHostname = options.resolveHostname ?? (options.fetchImpl ? (() => Promise.resolve([])) : resolvePublicHostname);
  const maxConcurrency = options.maxConcurrency ?? 8;
  const allowBenchmarkProxyAddresses = options.allowBenchmarkProxyAddresses ?? false;
  const previousByKey = new Map(
    (options.previousArtifact?.items ?? []).map((item) => [historyKey(item), item]),
  );
  const resultByUrl = new Map<string, Promise<CheckResult>>();
  const candidates = collectUrlCandidates(cards);
  const items = await mapWithConcurrency(candidates, maxConcurrency, async (candidate) => {
    let resultPromise = resultByUrl.get(candidate.url);
    if (!resultPromise) {
      resultPromise = checkUrl(candidate.url, fetchImpl, timeoutMs, maxRetries, sleepImpl, resolveHostname, allowBenchmarkProxyAddresses);
      resultByUrl.set(candidate.url, resultPromise);
    }
    const result = await resultPromise;
    const previous = previousByKey.get(historyKey(candidate));
    return withHistory(candidate, result, previous, options.checkedAt);
  });

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

export function buildToolCardUrlValidationV1FromV2(artifact: ToolCardUrlValidationArtifactV2): ToolCardUrlValidationArtifact {
  const items = artifact.items.map((item) => ({
    tool_id: item.tool_id,
    url: item.url,
    field: item.field_path.replace(/\[\d+\]/g, ""),
    status: item.status === "reachable" ? "reachable" as const : item.status === "skipped" ? "skipped" as const : "failed" as const,
    method: item.method === "none" ? undefined : item.method,
    http_status: item.http_status,
    reason: item.reason_code,
  }));
  return {
    schema_version: "tool_card_url_validation.v1",
    checked_at: artifact.generated_at,
    summary: {
      checked: items.filter((item) => item.status !== "skipped").length,
      reachable: items.filter((item) => item.status === "reachable").length,
      failed: items.filter((item) => item.status === "failed").length,
      skipped: items.filter((item) => item.status === "skipped").length,
    },
    items,
  };
}

async function checkUrl(
  value: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
  maxRetries: number,
  sleepImpl: (milliseconds: number) => Promise<void>,
  resolveHostname: (hostname: string) => Promise<string[]>,
  allowBenchmarkProxyAddresses: boolean,
): Promise<CheckResult> {
  const parsed = safeUrl(value);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return skipped("non_http_url");
  }
  if (parsed.username || parsed.password) {
    return permanent("url_contains_credentials");
  }
  if (isPrivateNetworkHost(parsed.hostname)) {
    return permanent("private_network_target");
  }
  if (await resolvesToPrivateNetwork(parsed.hostname, resolveHostname, allowBenchmarkProxyAddresses)) return permanent("private_network_target");

  const head = await requestWithRetries(value, "HEAD", fetchImpl, timeoutMs, maxRetries, sleepImpl, resolveHostname, allowBenchmarkProxyAddresses);
  if (head.http_status === 405 || head.http_status === 501) {
    const get = await requestWithRetries(value, "GET", fetchImpl, timeoutMs, maxRetries, sleepImpl, resolveHostname, allowBenchmarkProxyAddresses);
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
  resolveHostname: (hostname: string) => Promise<string[]>,
  allowBenchmarkProxyAddresses: boolean,
): Promise<CheckResult> {
  let lastResult: CheckResult | undefined;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
    const result = await requestOnce(url, method, fetchImpl, timeoutMs, resolveHostname, allowBenchmarkProxyAddresses);
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
  resolveHostname: (hostname: string) => Promise<string[]>,
  allowBenchmarkProxyAddresses: boolean,
): Promise<CheckResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let currentUrl = url;
    const redirects: string[] = [];
    const visited = new Set([url]);
    for (let hop = 0; hop <= 5; hop += 1) {
      const response = await fetchImpl(currentUrl, {
        method,
        signal: controller.signal,
        redirect: "manual",
        headers: method === "GET" ? { Range: "bytes=0-0" } : undefined,
      });
      if (response.status < 300 || response.status >= 400) {
        return classifyResponse(response.status, method, currentUrl, redirects);
      }
      const location = response.headers.get("location");
      if (!location) {
        return { ...permanent("redirect_missing_location"), method, http_status: response.status, final_url: currentUrl, redirects };
      }
      const next = resolveUrl(location, currentUrl);
      if (!next || !(await isSafeRedirectTarget(currentUrl, next, resolveHostname, allowBenchmarkProxyAddresses)) || visited.has(next.toString())) {
        return { ...permanent("unsafe_redirect_target"), method, http_status: response.status, final_url: next?.toString(), redirects };
      }
      currentUrl = next.toString();
      redirects.push(currentUrl);
      visited.add(currentUrl);
    }
    return { ...permanent("redirect_limit_exceeded"), method, final_url: currentUrl, redirects };
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
  finalUrl: string,
  redirects: string[],
): CheckResult {
  const common = {
    method,
    http_status: status,
    final_url: finalUrl,
    redirects,
    attempt_count: 1,
  };
  if (status >= 200 && status < 400) return { ...common, status: "reachable", reason_code: `http_${status}` };
  if (status === 401 || status === 403) return { ...common, status: "auth_required", reason_code: `http_${status}` };
  if (status === 429) return { ...common, status: "rate_limited", reason_code: "http_429" };
  if (status === 404 || status === 410) return { ...common, status: "permanent_failure", reason_code: `http_${status}` };
  if (status >= 500) return { ...common, status: "transient_error", reason_code: `http_${status}` };
  return { ...common, status: "permanent_failure", reason_code: `http_${status}` };
}

async function isSafeRedirectTarget(currentUrl: string, target: URL, resolveHostname: (hostname: string) => Promise<string[]>, allowBenchmarkProxyAddresses: boolean): Promise<boolean> {
  if (!/^https?:$/.test(target.protocol) || target.username || target.password || isPrivateNetworkHost(target.hostname)) return false;
  if (await resolvesToPrivateNetwork(target.hostname, resolveHostname, allowBenchmarkProxyAddresses)) return false;
  const current = new URL(currentUrl);
  if (current.protocol === "https:" && target.protocol !== "https:") return false;
  if (current.hostname === target.hostname) return true;
  if (REVIEWED_CROSS_SITE_REDIRECTS[current.hostname]?.includes(target.hostname)) return true;
  return current.hostname.endsWith(`.${target.hostname}`) || target.hostname.endsWith(`.${current.hostname}`);
}

async function resolvePublicHostname(hostname: string): Promise<string[]> {
  return (await lookup(hostname, { all: true })).map((entry) => entry.address);
}

async function resolvesToPrivateNetwork(hostname: string, resolveHostname: (hostname: string) => Promise<string[]>, allowBenchmarkProxyAddresses: boolean): Promise<boolean> {
  try {
    return (await resolveHostname(hostname)).some((address) =>
      isPrivateNetworkHost(address) && !(allowBenchmarkProxyAddresses && isBenchmarkProxyAddress(address)),
    );
  } catch {
    return false;
  }
}

function isBenchmarkProxyAddress(address: string): boolean {
  const octets = address.split(".").map(Number);
  return octets.length === 4 && octets[0] === 198 && (octets[1] === 18 || octets[1] === 19);
}

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, concurrency), items.length) }, () => worker()));
  return results;
}

function isPrivateNetworkHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host === "::" || host.startsWith("fe80:") || /^(fc|fd)[0-9a-f]{2}:/.test(host)) return true;
  const mappedIpv4 = host.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  const octets = (mappedIpv4 ?? host).split(".").map(Number);
  if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return octets[0] === 10
    || octets[0] === 127
    || octets[0] === 0
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 100 && octets[1] >= 64 && octets[1] <= 127)
    || (octets[0] === 198 && (octets[1] === 18 || octets[1] === 19))
    || octets[0] >= 224;
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

function resolveUrl(value: string, base: string): URL | undefined {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}
