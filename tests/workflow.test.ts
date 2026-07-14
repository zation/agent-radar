import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("all release workflow gates promotion candidates before Worker validation", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const buildStepIndex = workflow.indexOf("- name: Build reviewed bundle");
  const registryMetadataCheckStepIndex = workflow.indexOf("- name: Validate generated MCP Registry metadata");
  const promotionCheckStepIndex = workflow.indexOf("- name: Check promotion candidates");
  const dryRunStepIndex = workflow.indexOf("- name: Validate Worker bundle");

  assert.notEqual(registryMetadataCheckStepIndex, -1);
  assert.notEqual(buildStepIndex, -1);
  assert.notEqual(promotionCheckStepIndex, -1);
  assert.notEqual(dryRunStepIndex, -1);
  assert.equal(buildStepIndex < registryMetadataCheckStepIndex, true);
  assert.equal(promotionCheckStepIndex < dryRunStepIndex, true);
  assert.match(workflow, /npm run validate:mcp-registry -- --release-tag "\$GITHUB_REF_NAME" --metadata dist-pages\/server\.json/);
  assert.match(workflow, /run:\s*npm run promotion:check -- dist-pages\/data\/promotion_candidates\/promotion_check\.json/);
  assert.match(workflow, /run:\s*npm run data-quality:check -- dist-pages\/data\/data_quality_report\.json/);
  assert.match(workflow, /run:\s*npm run review-summary:check -- dist-pages/);
  assert.match(workflow, /AGENT_RADAR_CHECK_URLS:\s*["']?true["']?/);
  assert.match(workflow, /AGENT_RADAR_LLM_BASE_URL:\s*\$\{\{ vars\.AGENT_RADAR_LLM_BASE_URL \}\}/);
  assert.match(workflow, /Restore previous reviewed baselines/);
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
  assert.match(workflow, /deploy-production:[\s\S]*--var AGENT_RADAR_LLM_MODEL:\$\{\{ vars\.AGENT_RADAR_LLM_MODEL \|\| 'deepseek-v4-flash' \}\}/);
  assert.match(workflow, /deploy-production:[\s\S]*--var AGENT_RADAR_LLM_BASE_URL:\$\{\{ vars\.AGENT_RADAR_LLM_BASE_URL \}\}/);
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

  assert.doesNotMatch(workflow, /inputs\.ref/);
  assert.doesNotMatch(workflow, /workflow_dispatch:\s*\n\s+inputs:/);
  assert.equal(workflow.match(/ref: \$\{\{ github\.sha \}\}/g)?.length, 2);
  assert.doesNotMatch(workflow, /ref: \$\{\{ github\.ref \}\}/);
  assert.match(workflow, /Validate immutable release tag/);
  assert.match(workflow, /\[\[ "\$GITHUB_REF" != refs\/tags\/all-v\* \]\]/);
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

test("all release workflow applies feedback migrations before production deploy", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const migration = workflow.indexOf("wrangler d1 migrations apply agent-radar --remote");
  const deploy = workflow.indexOf("name: Deploy Cloudflare Worker");
  assert.ok(migration >= 0);
  assert.ok(deploy > migration);
  assert.match(workflow, /CLOUDFLARE_API_TOKEN: \$\{\{ secrets\.CLOUDFLARE_API_TOKEN \}\}/);
});

test("all release workflow prepares feedback read-only and applies it after approval before deploy", async () => {
  const workflow = await readFile(".github/workflows/release-all.yml", "utf8");
  const query = workflow.indexOf("- name: Read production feedback aggregate");
  const prepare = workflow.indexOf("- name: Prepare feedback build input");
  const build = workflow.indexOf("- name: Build reviewed bundle");
  const apply = workflow.indexOf("- name: Apply approved feedback plan");
  const migrate = workflow.indexOf("- name: Apply production D1 migrations");
  const deploy = workflow.indexOf("- name: Deploy Cloudflare Worker");
  assert.ok(query >= 0 && prepare > query && build > prepare);
  assert.ok(apply > build && migrate > apply && deploy > migrate);
  assert.match(workflow, /issues:\s*read/);
  assert.match(workflow, /issues:\s*write/);
  assert.match(workflow, /GROUP BY tool_id/);
  assert.doesNotMatch(workflow, /SELECT[^\n]*(github_user_id|github_login)/i);
  assert.match(workflow, /AGENT_RADAR_FEEDBACK_BUILD_INPUT:\s*feedback-build-input\.json/);
  assert.match(workflow, /npm run feedback:apply -- --plan reviewed-bundle\/dist-pages\/data\/feedback_processing_plan\.json/);
});

test("MCP Registry workflow publishes only evidence-bound Release All runs through GitHub OIDC", async () => {
  const workflow = await readFile(".github/workflows/publish-mcp-registry.yml", "utf8");
  const downloadEvidence = workflow.indexOf("Download source production evidence");
  const checkoutImplementation = workflow.indexOf("Checkout trusted publication workflow implementation");
  const validate = workflow.indexOf('mcp-publisher validate "$REGISTRY_METADATA_PATH"');
  const validateReleaseInputs = workflow.indexOf("validate-mcp-registry-release.js");
  const login = workflow.indexOf("mcp-publisher login github-oidc");
  const publish = workflow.indexOf('mcp-publisher publish "$REGISTRY_METADATA_PATH"');

  assert.match(workflow, /workflow_run:\s*\n\s*workflows:\s*\["Release All"\]\s*\n\s*types:\s*\[completed\]/);
  assert.match(workflow, /workflow_dispatch:[\s\S]*release_run_id:[\s\S]*required:\s*true/);
  assert.match(workflow, /permissions:\s*\n\s*contents:\s*read\s*\n\s*actions:\s*read\s*\n\s*id-token:\s*write/);
  assert.match(workflow, /github\.event\.workflow_run\.conclusion == 'success'/);
  assert.match(workflow, /repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{SOURCE_RUN_ID\}/);
  assert.match(workflow, /\.head_repository\.full_name == \$repository/);
  assert.match(workflow, /\.conclusion == "success"/);
  assert.match(workflow, /\[\[ "\$SOURCE_TAG" != all-v\* \]\]/);
  assert.doesNotMatch(workflow, /Checkout evidence SHA|path:\s*evidence-source/);
  assert.ok(downloadEvidence >= 0 && checkoutImplementation > downloadEvidence);
  assert.ok(validateReleaseInputs > checkoutImplementation && validateReleaseInputs < login);

  assert.match(workflow, /agent-radar-mcp-smoke-\$\{SOURCE_RUN_ID\}/);
  assert.match(workflow, /agent-radar-all-\$\{SOURCE_RUN_ID\}/);
  assert.equal(workflow.match(/gh run download "\$SOURCE_RUN_ID"[\s\S]*?--repo "\$GITHUB_REPOSITORY"/g)?.length, 2);
  assert.match(workflow, /RUNNER_TEMP\/agent-radar-source-evidence/);
  assert.match(workflow, /RUNNER_TEMP\/agent-radar-source-reviewed-bundle\/dist-pages\/artifact-manifest\.json/);
  assert.match(workflow, /REGISTRY_METADATA_PATH="\$RUNNER_TEMP\/agent-radar-source-reviewed-bundle\/dist-pages\/server\.json"/);
  assert.match(workflow, /REGISTRY_METADATA_PATH=\$REGISTRY_METADATA_PATH.*\$GITHUB_ENV/);
  assert.match(workflow, /production-release-evidence\.json/);
  assert.match(workflow, /\/api\/version/);
  assert.match(workflow, /AGENT_RADAR_MCP_BASE_URL="\$WORKER_BASE_URL"/);
  assert.match(workflow, /jq -r '\.remotes\[0\]\.url' "\$REGISTRY_METADATA_PATH"/);
  assert.match(workflow, /classifyMcpRegistryRecord/);
  assert.match(workflow, /registry\/releases\/download\/v1\.8\.0\/mcp-publisher_linux_amd64\.tar\.gz/);
  assert.match(workflow, /1370446bbe74d562608e8005a6ccce02d146a661fbd78674e11cc70b9618d6cf/);
  assert.ok(validate >= 0 && login > validate && publish > login);
  assert.match(workflow, /if: steps\.registry_preflight\.outputs\.publication_action == 'publish'/);
  assert.doesNotMatch(workflow, /(MCP_REGISTRY_TOKEN|REGISTRY_PAT|secrets\.[A-Za-z0-9_]*REGISTRY)/);
  assert.match(workflow, /Poll official MCP Registry/);
  assert.match(workflow, /build-mcp-registry-evidence\.js/);
  assert.match(workflow, /mcp-registry-publication-evidence-\$\{\{ env\.SOURCE_RUN_ID \}\}/);
});
