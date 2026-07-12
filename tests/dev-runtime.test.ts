import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("default dev command runs Vite HMR and Wrangler Worker with local D1", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8")) as { scripts: Record<string, string>; devDependencies: Record<string, string> };

  assert.match(packageJson.scripts.dev, /dev:data/);
  assert.match(packageJson.scripts.dev, /pages:build/);
  assert.match(packageJson.scripts.dev, /dev:db/);
  assert.match(packageJson.scripts.dev, /concurrently/);
  assert.equal(packageJson.scripts["dev:api"], "wrangler dev --local --port 8787");
  assert.equal(packageJson.scripts["dev:db"], "CI=1 wrangler d1 migrations apply agent-radar --local");
  assert.equal(packageJson.scripts["dev:ui"], "vite --host 127.0.0.1 --port 5173 --strictPort");
  assert.ok(packageJson.devDependencies.concurrently);
});

test("Vite proxies same-origin API requests to the hot-reloading Worker", async () => {
  const config = await readFile("vite.config.ts", "utf8");

  assert.match(config, /server:\s*\{[\s\S]*proxy:\s*\{[\s\S]*["']\/api["']:\s*\{[\s\S]*target:\s*["']http:\/\/127\.0\.0\.1:8787["']/);
  assert.match(config, /changeOrigin:\s*false/);
  assert.doesNotMatch(config, /agentRadarApiDevPlugin/);
});

test("local Worker variables have a safe committed example", async () => {
  const example = await readFile(".dev.vars.example", "utf8");
  assert.match(example, /GITHUB_OAUTH_CLIENT_ID=/);
  assert.match(example, /GITHUB_OAUTH_CLIENT_SECRET=/);
  assert.match(example, /AGENT_RADAR_SESSION_SECRET=/);
  assert.doesNotMatch(example, /gh[opusr]_[A-Za-z0-9]/);
});
