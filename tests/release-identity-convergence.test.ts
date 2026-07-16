import assert from "node:assert/strict";
import test from "node:test";
import { waitForReleaseIdentity } from "../src/release/release-identity-convergence.js";

const expected = {
  baseUrl: "https://agent-radar.example",
  releaseId: "all-v0.9.2",
  commitSha: "abcdef1234567890",
  intervalMs: 0,
  requestTimeoutMs: 100,
  now: sequentialClock()
};

test("release identity gate succeeds immediately on exact tag and SHA", async () => {
  const result = await waitForReleaseIdentity({
    ...expected,
    fetchImpl: () => Promise.resolve(versionResponse("all-v0.9.2", "abcdef1234567890"))
  });

  assert.equal(result.schema_version, "release_identity_convergence.v1");
  assert.equal(result.version_url, "https://agent-radar.example/api/version");
  assert.deepEqual(result.expected, { release_id: "all-v0.9.2", commit_sha: "abcdef1234567890" });
  assert.deepEqual(result.actual, result.expected);
  assert.equal(result.attempts, 1);
  assert.equal(result.converged, true);
});

test("release identity gate retries an old edge until both values converge", async () => {
  let requests = 0;
  const sleeps: number[] = [];
  const result = await waitForReleaseIdentity({
    ...expected,
    maxAttempts: 3,
    intervalMs: 25,
    sleepImpl: (milliseconds) => { sleeps.push(milliseconds); return Promise.resolve(); },
    fetchImpl: () => {
      requests += 1;
      return Promise.resolve(requests === 1
        ? versionResponse("all-v0.9.1", "1111111111111111")
        : versionResponse("all-v0.9.2", "abcdef1234567890"));
    }
  });

  assert.equal(result.attempts, 2);
  assert.deepEqual(sleeps, [25]);
});

test("release identity gate blocks after bounded mismatch exhaustion", async () => {
  await assert.rejects(
    waitForReleaseIdentity({
      ...expected,
      maxAttempts: 2,
      fetchImpl: () => Promise.resolve(versionResponse("all-v0.9.1", "1111111111111111")),
      sleepImpl: () => Promise.resolve()
    }),
    /did not converge after 2 attempts \(release_id and commit_sha mismatch\)/
  );
});

test("release identity gate retries malformed responses without leaking their body", async () => {
  const error = await captureRejection(() => waitForReleaseIdentity({
    ...expected,
    maxAttempts: 1,
    fetchImpl: () => Promise.resolve(new Response('{"secret":"do-not-log"}', {
      headers: { "content-type": "application/json" }
    }))
  }));

  assert.match(error.message, /response identity was invalid/);
  assert.doesNotMatch(error.message, /do-not-log/);
});

test("release identity gate applies a per-request timeout and blocks", async () => {
  await assert.rejects(waitForReleaseIdentity({
    ...expected,
    maxAttempts: 1,
    requestTimeoutMs: 1,
    fetchImpl: (_input, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })
  }), /did not converge after 1 attempts \(request failed\)/);
});

test("release identity gate distinguishes release and SHA mismatches", async () => {
  await assert.rejects(waitForReleaseIdentity({
    ...expected,
    maxAttempts: 1,
    fetchImpl: () => Promise.resolve(versionResponse("all-v0.9.1", "abcdef1234567890"))
  }), /release_id mismatch/);

  await assert.rejects(waitForReleaseIdentity({
    ...expected,
    maxAttempts: 1,
    fetchImpl: () => Promise.resolve(versionResponse("all-v0.9.2", "1111111111111111"))
  }), /commit_sha mismatch/);
});

function versionResponse(releaseId: string, commitSha: string): Response {
  return new Response(JSON.stringify({ release_id: releaseId, commit_sha: commitSha }), {
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

function sequentialClock(): () => Date {
  let tick = 0;
  return () => new Date(Date.UTC(2026, 6, 16, 12, 0, tick++));
}

async function captureRejection(run: () => Promise<unknown>): Promise<Error> {
  try {
    await run();
  } catch (error) {
    assert.equal(error instanceof Error, true);
    return error as Error;
  }
  throw new Error("Expected operation to reject.");
}
