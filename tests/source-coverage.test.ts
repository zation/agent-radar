import assert from "node:assert/strict";
import test from "node:test";
import { curatedGithubSources } from "../src/ingestion/curated-github-sources.js";
import { sourceRegistry, validateSourceRegistry } from "../src/ingestion/source-registry.js";

test("curated v0.3 source batch contains 25 unique exact reviewed repositories", () => {
  assert.equal(curatedGithubSources.length, 25);
  assert.equal(new Set(curatedGithubSources.map((source) => source.id)).size, 25);
  assert.equal(new Set(curatedGithubSources.map((source) => source.url.toLowerCase())).size, 25);
  assert.deepEqual(validateSourceRegistry(curatedGithubSources), []);
  for (const source of curatedGithubSources) {
    assert.equal(source.enabled, true);
    assert.equal(source.parser, "github_repo_parser");
    assert.match(source.url, /^https:\/\/github\.com\/[^/]+\/[^/]+$/);
    assert.ok(source.profile?.tool_id);
    assert.ok(source.profile?.summary);
    assert.ok(source.profile?.primary_purpose);
    assert.ok(source.profile?.tags?.length);
    assert.ok(source.profile?.use_cases?.length);
    assert.ok(source.profile?.not_for?.length);
    assert.ok(source.profile?.permissions);
    assert.ok(source.profile?.security);
    assert.ok(source.profile?.maintenance);
    assert.equal(source.access_review?.robots_txt, "reviewed");
    assert.equal(source.access_review?.terms, "reviewed");
  }
});

test("source registry includes the complete curated v0.3 batch", () => {
  const registryIds = new Set(sourceRegistry.map((source) => source.id));
  assert.ok(curatedGithubSources.every((source) => registryIds.has(source.id)));
  assert.equal(sourceRegistry.length >= 36, true);
});
