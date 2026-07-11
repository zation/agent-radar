import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const featureFiles = [
  "src/ui/app-shell.tsx",
  "src/ui/tools-workspace.tsx",
  "src/ui/evaluation-page.tsx",
] as const;

async function readSource(path: string): Promise<string> {
  return readFile(path, "utf8");
}

test("feature surfaces compose form controls through shared UI components", async () => {
  for (const path of featureFiles) {
    const source = await readSource(path);
    assert.doesNotMatch(source, /<(?:button|input|textarea|select)\b/, path);
  }
});

test("UI styles do not use unreadably small 7–11px typography", async () => {
  const styles = await readSource("src/ui/styles.css");
  assert.doesNotMatch(styles, /font-size:\s*(?:7|8|9|10|11)px\b/, "src/ui/styles.css");
});

test("feature surfaces keep static interface chrome in English", async () => {
  for (const path of featureFiles) {
    const source = await readSource(path);
    assert.doesNotMatch(source, /[\u3400-\u9fff]/u, path);
  }
});

test("desktop indexes scroll within a bounded viewport height", async () => {
  for (const path of ["src/ui/tools-workspace.tsx", "src/ui/evaluation-page.tsx"]) {
    const source = await readSource(path);
    assert.match(source, /lg:max-h-\[min\(60vh,640px\)\]/, path);
    assert.match(source, /lg:overflow-y-auto/, path);
  }
});

test("dense index rows preserve readable separation and clipping", async () => {
  const toolRow = await readSource("src/ui/tool-row.tsx");
  const evaluation = await readSource("src/ui/evaluation-page.tsx");
  assert.match(toolRow, /overflow-hidden/, "src/ui/tool-row.tsx");
  assert.match(evaluation, /evaluation-index[^\"]*gap-2/, "src/ui/evaluation-page.tsx");
});

test("shared navigation and filters expose visible hover treatment", async () => {
  const button = await readSource("src/components/ui/button.tsx");
  const toggle = await readSource("src/components/ui/toggle.tsx");
  assert.match(button, /nav: \"[^\"]*my-2/, "src/components/ui/button.tsx");
  assert.match(toggle, /outline: \"[^\"]*hover:bg-accent/, "src/components/ui/toggle.tsx");
});
