import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Tool feedback Issue Form contains structured fields and safety warning", async () => {
  const text = await readFile(".github/ISSUE_TEMPLATE/tool-feedback.yml", "utf8");
  for (const id of ["tool_id", "vote", "release", "data_version", "tool_url", "reason"]) assert.match(text, new RegExp(`id: ${id}`));
  for (const warning of ["tokens", "secrets", "private code", "email", "customer data", "full prompt"]) assert.match(text, new RegExp(warning));
  assert.match(text, /labels: \["tool-feedback"\]/); assert.match(text, /id: reason[\s\S]*required: true/);
  assert.match(text, /type: input\s+id: vote[\s\S]*description: Prefilled by Agent Radar; please do not edit\./);
});
