import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import {
  PUBLIC_DOCUMENT_PATHS,
  findPublicLanguageViolations,
  formatPublicLanguageViolation,
} from "../src/validation/public-language.js";

test("public document scope contains exactly the approved P1 files", () => {
  const paths = new Set<string>(PUBLIC_DOCUMENT_PATHS);
  assert.equal(PUBLIC_DOCUMENT_PATHS.length, 17);
  assert.deepEqual(PUBLIC_DOCUMENT_PATHS.slice(0, 2), ["README.md", "AGENTS.md"]);
  assert.ok(paths.has("docs/00-product-brief.md"));
  assert.ok(paths.has("docs/14-web-ui.md"));
  assert.ok(!paths.has("docs/15-roadmap.md"));
  assert.ok(PUBLIC_DOCUMENT_PATHS.every((path) => !path.startsWith("docs/superpowers/")));
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
