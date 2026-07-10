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
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
  assert.match(workflow, /gh api --method GET/);
  assert.match(workflow, /AGENT_RADAR_PRODUCTION_DEPLOYMENT_ID/);
  assert.match(workflow, /build-production-evidence\.js/);
  assert.match(workflow, /production-release-evidence\.json/);
  assert.equal(workflow.indexOf("- name: Download reviewed bundle") < workflow.indexOf("- name: Deploy Cloudflare Worker"), true);
  assert.equal(
    workflow.indexOf("Smoke test deployed Worker MCP") < workflow.indexOf("Build production release evidence"),
    true,
  );
});

test("all release workflow uniquely binds evidence to the current Actions deployment", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");

  assert.match(workflow, /permissions:\s*\n(?:\s+.*\n)*?\s+deployments:\s*write/);
  assert.match(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/deployments/);
  assert.match(workflow, /-f environment=production/);
  assert.match(workflow, /-f sha="\$GITHUB_SHA"/);
  assert.match(workflow, /-f ref="\$GITHUB_REF_NAME"/);
  assert.doesNotMatch(workflow, /\.\[0\]\.id/);
  assert.match(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/deployments\/\$\{CANDIDATE_ID\}\/statuses/);
  assert.match(workflow, /\.log_url \/\/ \\"\\"/);
  assert.match(workflow, /\.target_url \/\/ \\"\\"/);
  assert.match(workflow, /\/actions\/runs\/\$\{GITHUB_RUN_ID\}\//);
  assert.match(workflow, /CANDIDATE_ID" =~ \^\[0-9\]\+\$/);
  assert.match(workflow, /"\$\{#MATCHING_DEPLOYMENT_IDS\[@\]\}" -ne 1/);
  assert.match(workflow, /Could not uniquely identify the production deployment for this workflow run\./);
  assert.match(workflow, /AGENT_RADAR_WORKER_BASE_URL=\$WORKER_BASE_URL.*\$GITHUB_ENV/);
  assert.match(workflow, /AGENT_RADAR_PRODUCTION_DEPLOYMENT_ID=.*\$GITHUB_ENV/);
  assert.doesNotMatch(workflow, /printf[^\n]*\$DEPLOY_OUTPUT[^\n]*>&2/);
});

test("all release workflow uses a Wrangler-compatible Node runtime", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const nodeVersionMatches = [...workflow.matchAll(/node-version:\s*(\d+)/g)];

  assert.equal(nodeVersionMatches.length, 2);
  assert.equal(
    nodeVersionMatches.every((match) => Number(match[1]) >= 22),
    true,
  );
});

test("all release workflow uses Node 24-compatible GitHub actions", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");

  assert.doesNotMatch(workflow, /actions\/checkout@v[1-5]\b/);
  assert.doesNotMatch(workflow, /actions\/setup-node@v[1-5]\b/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact@v[1-6]\b/);
  assert.doesNotMatch(workflow, /actions\/download-artifact@v[1-7]\b/);
  assert.doesNotMatch(workflow, /cloudflare\/wrangler-action@v[1-3]\b/);
});
