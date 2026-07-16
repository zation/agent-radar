export interface ReleaseIdentityConvergenceResult {
  schema_version: "release_identity_convergence.v1";
  version_url: string;
  expected: { release_id: string; commit_sha: string };
  actual: { release_id: string; commit_sha: string };
  attempts: number;
  started_at: string;
  converged_at: string;
  converged: true;
}

export interface WaitForReleaseIdentityOptions {
  baseUrl: string;
  releaseId: string;
  commitSha: string;
  maxAttempts?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  sleepImpl?: (milliseconds: number) => Promise<void>;
  now?: () => Date;
}

export async function waitForReleaseIdentity(
  options: WaitForReleaseIdentityOptions
): Promise<ReleaseIdentityConvergenceResult> {
  const versionUrl = productionVersionUrl(options.baseUrl);
  const maxAttempts = positiveInteger(options.maxAttempts ?? 12, "maxAttempts");
  const intervalMs = nonNegativeInteger(options.intervalMs ?? 5_000, "intervalMs");
  const requestTimeoutMs = positiveInteger(options.requestTimeoutMs ?? 10_000, "requestTimeoutMs");
  const expected = {
    release_id: singleLine(options.releaseId, "releaseId"),
    commit_sha: gitSha(options.commitSha)
  };
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleepImpl = options.sleepImpl ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const now = options.now ?? (() => new Date());
  const startedAt = now().toISOString();
  let lastFailure = "request failed";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const actual = await fetchVersionIdentity(versionUrl, fetchImpl, requestTimeoutMs);
      if (actual.release_id === expected.release_id && actual.commit_sha === expected.commit_sha) {
        return {
          schema_version: "release_identity_convergence.v1",
          version_url: versionUrl,
          expected,
          actual,
          attempts: attempt,
          started_at: startedAt,
          converged_at: now().toISOString(),
          converged: true
        };
      }
      lastFailure = actual.release_id !== expected.release_id && actual.commit_sha !== expected.commit_sha
        ? "release_id and commit_sha mismatch"
        : actual.release_id !== expected.release_id
          ? "release_id mismatch"
          : "commit_sha mismatch";
    } catch (error) {
      lastFailure = error instanceof ReleaseIdentityObservationError ? error.message : "request failed";
    }
    if (attempt < maxAttempts) await sleepImpl(intervalMs);
  }

  throw new Error(`Production release identity did not converge after ${maxAttempts} attempts (${lastFailure}).`);
}

async function fetchVersionIdentity(
  versionUrl: string,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<{ release_id: string; commit_sha: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(versionUrl, {
      method: "GET",
      headers: { accept: "application/json" },
      cache: "no-store",
      signal: controller.signal
    });
    if (!response.ok) throw new ReleaseIdentityObservationError(`HTTP ${response.status}`);
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      throw new ReleaseIdentityObservationError("response was not JSON");
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ReleaseIdentityObservationError("response JSON was malformed");
    }
    if (!isRecord(value) || !isObservedIdentity(value.release_id, value.commit_sha)) {
      throw new ReleaseIdentityObservationError("response identity was invalid");
    }
    return { release_id: value.release_id, commit_sha: value.commit_sha as string };
  } finally {
    clearTimeout(timeout);
  }
}

function productionVersionUrl(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new Error("baseUrl must be an HTTPS origin.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password
    || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("baseUrl must be an HTTPS origin.");
  }
  return new URL("/api/version", url.origin).toString();
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer.`);
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer.`);
  return value;
}

function singleLine(value: string, name: string): string {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error(`${name} must be a non-empty single-line string.`);
  }
  return value;
}

function gitSha(value: string): string {
  if (!/^[0-9a-f]{6,64}$/.test(value)) throw new Error("commitSha must be a lowercase hexadecimal commit identifier.");
  return value;
}

function isObservedIdentity(releaseId: unknown, commitSha: unknown): releaseId is string {
  return typeof releaseId === "string" && releaseId.length > 0 && releaseId === releaseId.trim()
    && !/[\u0000-\u001f\u007f]/.test(releaseId)
    && typeof commitSha === "string" && /^[0-9a-f]{6,64}$/.test(commitSha);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

class ReleaseIdentityObservationError extends Error {}
