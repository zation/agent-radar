import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardDuplicateReport } from "../src/ingestion/deduper.js";
import { seedToolCards } from "../src/data/seed-tool-cards.js";

test("deduper reports draft matches against existing Tool Cards by id and canonical urls", () => {
  const existing = seedToolCards.find((card) => card.id === "agent-codex");
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
