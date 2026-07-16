import { writeFile } from "node:fs/promises";
import { waitForReleaseIdentity } from "../release/release-identity-convergence.js";

const result = await waitForReleaseIdentity({
  baseUrl: requireEnv("AGENT_RADAR_WORKER_BASE_URL"),
  releaseId: requireEnv("AGENT_RADAR_RELEASE_ID"),
  commitSha: requireEnv("AGENT_RADAR_COMMIT_SHA"),
  maxAttempts: optionalInteger("AGENT_RADAR_IDENTITY_MAX_ATTEMPTS"),
  intervalMs: optionalInteger("AGENT_RADAR_IDENTITY_INTERVAL_MS"),
  requestTimeoutMs: optionalInteger("AGENT_RADAR_IDENTITY_REQUEST_TIMEOUT_MS")
});

const output = `${JSON.stringify(result, null, 2)}\n`;
if (process.env.AGENT_RADAR_IDENTITY_EVIDENCE) {
  await writeFile(process.env.AGENT_RADAR_IDENTITY_EVIDENCE, output, "utf8");
}
process.stdout.write(output);

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function optionalInteger(name: string): number | undefined {
  const value = process.env[name]?.trim();
  if (!value) return undefined;
  if (!/^\d+$/.test(value)) throw new Error(`${name} must be a decimal integer.`);
  return Number(value);
}
