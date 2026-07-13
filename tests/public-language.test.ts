import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  PUBLIC_DOCUMENT_PATHS,
  findGoldenQueryLanguageViolations,
  findPublicLanguageViolations,
  formatPublicLanguageViolation,
} from "../src/validation/public-language.js";
import type { EvalCase } from "../src/schema.js";
import { goldenQueries } from "../src/eval/golden-queries.js";

test("public document scope contains exactly the approved public files", () => {
  const paths = new Set<string>(PUBLIC_DOCUMENT_PATHS);
  assert.equal(PUBLIC_DOCUMENT_PATHS.length, 18);
  assert.deepEqual(PUBLIC_DOCUMENT_PATHS.slice(0, 3), ["README.md", "DEVELOPMENT.md", "AGENTS.md"]);
  assert.ok(paths.has("DEVELOPMENT.md"));
  assert.ok(paths.has("docs/00-product-brief.md"));
  assert.ok(paths.has("docs/14-web-ui.md"));
  assert.ok(!paths.has("docs/15-roadmap.md"));
  assert.ok(PUBLIC_DOCUMENT_PATHS.every((path) => !path.startsWith("docs/superpowers/")));
});

test("README promotes the product and delegates local development", async () => {
  const [readme, development] = await Promise.all([
    readFile("README.md", "utf8"),
    readFile("DEVELOPMENT.md", "utf8"),
  ]);

  assert.doesNotMatch(readme, /^## Current Stage$/m);
  assert.match(readme, /\[Development Guide\]\(DEVELOPMENT\.md\)/);
  assert.doesNotMatch(readme, /AGENT_RADAR_LLM_API_KEY=/);
  assert.match(development, /^# Development Guide$/m);
  assert.match(development, /^## Local Setup$/m);
  assert.match(development, /^## Development Commands$/m);
  assert.match(development, /docs\/12-deployment-and-ops\.md/);
});

test("validator reports Han, CJK punctuation, and fullwidth forms with stable locations", () => {
  const violations = findPublicLanguageViolations([{
    path: "README.md",
    content: "English heading\n中文，Ａ\n",
  }]);
  assert.deepEqual(violations.map(({ line, column, character }) => ({ line, column, character })), [
    { line: 2, column: 1, character: "中" },
    { line: 2, column: 2, character: "文" },
    { line: 2, column: 3, character: "，" },
    { line: 2, column: 4, character: "Ａ" },
  ]);
});

test("validator allows normal English technical Unicode", () => {
  assert.deepEqual(findPublicLanguageViolations([{
    path: "docs/01-requirements.md",
    content: "Coverage must be ≥ 90%. Use an en dash – only when needed.\n",
  }]), []);
});

test("validator scans only public Golden Query text fields with stable paths", () => {
  const evalCase: EvalCase = {
    id: "gq-example",
    schema_version: "eval_case.v1",
    category: "safety",
    query: { task: "删除 production data", risk_tolerance: "low" },
    expected: { recommended_action: "ask_human" },
    review_notes: "Require human confirmation.",
    severity: "critical",
    owner: "agent-radar",
    updated_at: "2026-07-13T00:00:00Z",
  };

  const violations = findGoldenQueryLanguageViolations([evalCase]);
  assert.equal(violations[0]?.path, "src/eval/golden-queries.ts:gq-example.query.task");
  assert.equal(violations[0]?.character, "删");
  assert.ok(violations.every((violation) => !violation.path.includes("expected")));
});

test("diagnostics contain file, line, column, character, and trimmed context", () => {
  const [violation] = findPublicLanguageViolations([{
    path: "AGENTS.md",
    content: "  Reject 中文 text.  \n",
  }]);
  assert.equal(
    formatPublicLanguageViolation(violation),
    'AGENTS.md:1:10 prohibited CJK character "中" in Reject 中文 text.',
  );
});

test("all approved public documents satisfy the strict language rule", async () => {
  const documents = await Promise.all(PUBLIC_DOCUMENT_PATHS.map(async (path) => ({
    path,
    content: await readFile(resolve(process.cwd(), path), "utf8"),
  })));

  assert.deepEqual(findPublicLanguageViolations(documents), []);
});

test("all 48 public Golden Query fields satisfy the strict language rule", () => {
  assert.equal(goldenQueries.length * 2, 48);
  assert.deepEqual(findGoldenQueryLanguageViolations(goldenQueries), []);
});
