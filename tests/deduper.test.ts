import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardDuplicateReport } from "../src/ingestion/deduper.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

test("deduper reports draft matches against existing Tool Cards by id and canonical urls", () => {
  const existing = reviewedToolCardFixtures.find((card) => card.id === "agent-codex");
  assert.ok(existing);

  const report = buildToolCardDuplicateReport(
    [
      {
        ...existing,
        id: "agent-codex-draft",
        evidence_refs: ["manual-agent-radar-seed-agent-codex-20260708"]
      }
    ],
    [existing],
    "2026-07-08T00:00:00Z"
  );

  assert.equal(report.schema_version, "tool_card_duplicate_report.v1");
  assert.equal(report.summary.total_drafts, 1);
  assert.equal(report.summary.possible_duplicates, 1);
  assert.deepEqual(report.items[0]?.duplicate_of_tool_ids, ["agent-codex"]);
  assert.equal(report.items[0]?.match_signals[0]?.kind, "canonical_url");
});

test("deduper reports duplicate signals between incoming drafts", () => {
  const existing = reviewedToolCardFixtures.find((card) => card.id === "agent-codex");
  assert.ok(existing);

  const report = buildToolCardDuplicateReport(
    [
      {
        ...existing,
        id: "agent-alpha",
        name: "Agent Alpha",
        evidence_refs: ["manual-agent-radar-seed-agent-alpha-20260708"]
      },
      {
        ...existing,
        id: "agent-beta",
        name: "Agent Beta",
        evidence_refs: ["manual-agent-radar-seed-agent-beta-20260708"]
      }
    ],
    [],
    "2026-07-08T00:00:00Z"
  );

  assert.equal(report.summary.total_drafts, 2);
  assert.equal(report.summary.possible_duplicates, 2);
  assert.deepEqual(report.items[0]?.duplicate_of_draft_tool_ids, ["agent-beta"]);
  assert.equal(report.items[0]?.match_signals[0]?.kind, "draft_canonical_url");
  assert.deepEqual(report.items[1]?.duplicate_of_draft_tool_ids, ["agent-alpha"]);
});
