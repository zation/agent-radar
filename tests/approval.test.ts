import assert from "node:assert/strict";
import test from "node:test";
import { buildApprovalArtifact, type ApprovalRecord } from "../src/ingestion/approval.js";

const approvalRecord: ApprovalRecord = {
  id: "approval-agent-codex-20260708",
  schema_version: "approval_record.v1",
  target_type: "tool_card_draft",
  target_id: "agent-codex",
  source_record_id: "manual-agent-radar-seed-agent-codex-20260708",
  decision: "approved",
  reason: "Reviewed official source and duplicate signal.",
  reviewer: "maintainer",
  reviewed_at: "2026-07-08T12:00:00Z"
};

test("approval artifact summarizes review decisions", () => {
  const artifact = buildApprovalArtifact([approvalRecord], "2026-07-08T12:30:00Z");

  assert.equal(artifact.schema_version, "approval_records.v1");
  assert.equal(artifact.summary.total, 1);
  assert.equal(artifact.summary.approved, 1);
  assert.equal(artifact.summary.rejected, 0);
  assert.equal(artifact.summary.needs_changes, 0);
  assert.equal(artifact.records[0]?.target_id, "agent-codex");
});

test("approval artifact rejects records without reviewer or reason", () => {
  assert.throws(
    () => buildApprovalArtifact([{ ...approvalRecord, reviewer: "", reason: "" }], "2026-07-08T12:30:00Z"),
    /reviewer is required/
  );
});
