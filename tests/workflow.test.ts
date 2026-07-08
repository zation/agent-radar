import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("pages preview workflow gates promotion candidates before deployment", async () => {
  const workflow = await readFile(".github/workflows/pages-preview.yml", "utf8");
  const promotionCheckStepIndex = workflow.indexOf("- name: Check promotion candidates");
  const deployStepIndex = workflow.indexOf("- name: Deploy Cloudflare Pages preview");

  assert.notEqual(promotionCheckStepIndex, -1);
  assert.notEqual(deployStepIndex, -1);
  assert.equal(promotionCheckStepIndex < deployStepIndex, true);
  assert.match(workflow, /run:\s*npm run promotion:check/);
});

test("pages preview workflow uses environment approval before production promotion", async () => {
  const workflow = await readFile(".github/workflows/pages-preview.yml", "utf8");
  const previewJobIndex = workflow.indexOf("preview:");
  const promoteJobIndex = workflow.indexOf("promote-production:");

  assert.notEqual(previewJobIndex, -1);
  assert.notEqual(promoteJobIndex, -1);
  assert.equal(previewJobIndex < promoteJobIndex, true);
  assert.match(workflow, /promote-production:[\s\S]*needs:\s*preview/);
  assert.match(workflow, /promote-production:[\s\S]*environment:\s*\n\s*name:\s*production/);
  assert.match(workflow, /promote-production:[\s\S]*Download reviewed preview bundle/);
});
