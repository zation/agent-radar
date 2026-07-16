import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { formatDeliveryStatus, readDeliveryStatus, validateDeliveryDocuments } from "../src/delivery/documents.js";

test("validates and summarizes backlog plus active delivery documents", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agent-radar-delivery-"));
  try {
    mkdirSync(path.join(root, "backlog"));
    mkdirSync(path.join(root, "archived", "v0.9"), { recursive: true });
    mkdirSync(path.join(root, "v1.0"));
    writeFileSync(path.join(root, "backlog", "candidate.md"), `---
kind: backlog
id: candidate
status: ready
priority: high
domains:
  - ingestion
created_at: 2026-07-16
---
# Candidate
`);
    writeFileSync(path.join(root, "v1.0", "p1-spec.md"), `---
kind: spec
version: v1.0
increment: p1
status: approved
implementation_commits: []
---
# Spec
`);
    writeFileSync(path.join(root, "v1.0", "p1-plan.md"), `---
kind: plan
version: v1.0
increment: p1
status: active
spec: ./p1-spec.md
implementation_commits: []
---
# Plan
- [x] First
- [ ] Second
`);
    assert.deepEqual(validateDeliveryDocuments(root), []);
    const status = readDeliveryStatus(root);
    assert.equal(status.backlog[0]?.id, "candidate");
    assert.equal(status.versions[0]?.increments[0]?.completedTasks, 1);
    assert.match(formatDeliveryStatus(status), /p1 spec=approved plan=active 1\/2 tasks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("rejects an active Plan without an approved Spec and broken links", () => {
  const root = mkdtempSync(path.join(tmpdir(), "agent-radar-delivery-"));
  try {
    mkdirSync(path.join(root, "backlog"));
    mkdirSync(path.join(root, "archived"));
    mkdirSync(path.join(root, "v1.0"));
    writeFileSync(path.join(root, "v1.0", "p1-spec.md"), `---
kind: spec
version: v1.0
increment: p1
status: draft
implementation_commits: []
---
# Spec
[missing](missing.md)
`);
    writeFileSync(path.join(root, "v1.0", "p1-plan.md"), `---
kind: plan
version: v1.0
increment: p1
status: active
spec: ./p1-spec.md
implementation_commits: []
---
# Plan
`);
    const errors = validateDeliveryDocuments(root);
    assert.ok(errors.some((error) => error.includes("active Plan requires an approved Spec")));
    assert.ok(errors.some((error) => error.includes("broken Markdown link missing.md")));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
