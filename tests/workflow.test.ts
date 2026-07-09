import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all release workflow gates promotion candidates before Worker validation", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const promotionCheckStepIndex = workflow.indexOf("- name: Check promotion candidates");
  const dryRunStepIndex = workflow.indexOf("- name: Validate Worker bundle");

  assert.notEqual(promotionCheckStepIndex, -1);
  assert.notEqual(dryRunStepIndex, -1);
  assert.equal(promotionCheckStepIndex < dryRunStepIndex, true);
  assert.match(workflow, /run:\s*npm run promotion:check/);
  assert.match(workflow, /tags:\s*\n\s+- "all-v\*"/);
});

test("all release workflow uses environment approval before Worker deploy", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const buildJobIndex = workflow.indexOf("build-reviewed-bundle:");
  const deployJobIndex = workflow.indexOf("deploy-production:");

  assert.notEqual(buildJobIndex, -1);
  assert.notEqual(deployJobIndex, -1);
  assert.equal(buildJobIndex < deployJobIndex, true);
  assert.match(workflow, /deploy-production:[\s\S]*needs:\s*build-reviewed-bundle/);
  assert.match(workflow, /deploy-production:[\s\S]*environment:\s*\n\s*name:\s*production/);
  assert.match(workflow, /deploy-production:[\s\S]*Download reviewed bundle/);
  assert.match(workflow, /deploy-production:[\s\S]*Deploy Cloudflare Worker/);
  assert.match(workflow, /deploy-production:[\s\S]*command: >\s*\n\s*deploy/);
  assert.match(workflow, /deploy-production:[\s\S]*--name=\$\{\{ vars\.CLOUDFLARE_PROJECT_NAME \|\| 'agent-radar' \}\}/);
  assert.match(workflow, /deploy-production:[\s\S]*Smoke test deployed Worker MCP/);
  assert.match(workflow, /deploy-production:[\s\S]*AGENT_RADAR_MCP_BASE_URL="\$WORKER_BASE_URL"/);
  assert.equal(workflow.indexOf("- name: Download reviewed bundle") < workflow.indexOf("- name: Deploy Cloudflare Worker"), true);
});
