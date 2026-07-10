import assert from "node:assert/strict";
import test from "node:test";
import {
  assertDataQualityReport,
  buildDataQualityReport,
  type BuildDataQualityReportOptions,
  type DataQualityReport,
} from "../src/validation/data-quality-report.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

function buildReport(overrides: Partial<BuildDataQualityReportOptions> = {}): DataQualityReport {
  return buildDataQualityReport({
    toolCards: [reviewedToolCardFixtures[0]],
    fieldProvenanceV2: {
      summary: { critical_coverage: 1 },
      items: [],
    },
    conflictReport: { summary: { unresolved: 0, unresolved_critical: 0 }, items: [] },
    urlValidationV2: {
      summary: {
        reachable: 1,
        permanent_failure: 0,
        auth_required: 0,
        rate_limited: 0,
        transient_error: 0,
        skipped: 0,
        blocking: 0,
        stale: 0,
      },
      items: [],
    },
    validation: { summary: { errors: 0, warnings: 0 }, errors: [], warnings: [] },
    duplicateCandidates: 0,
    unresolvedDuplicates: 0,
    parserWarnings: 0,
    interventions: 0,
    promotionBlocked: 0,
    dataVersion: "data-test",
    generatedAt: "2026-07-10T00:00:00Z",
    ...overrides,
  });
}

test("data quality report recomputes metrics and passes clean inputs", () => {
  const report = buildReport();

  assert.equal(report.schema_version, "data_quality_report.v1");
  assert.equal(report.tool_cards.total, 1);
  assert.equal(report.tool_cards.by_type[reviewedToolCardFixtures[0].type], 1);
  assert.equal(report.completeness.required_field_rate, 1);
  assert.equal(report.provenance.critical_coverage, 1);
  assert.equal(report.comparison.status, "no_baseline");
  assert.deepEqual(report.gates, []);
  assert.equal(report.status, "pass");
  assert.doesNotThrow(() => assertDataQualityReport(report));
});

test("data quality report emits stable blocking gate evidence", () => {
  const report = buildReport({
    fieldProvenanceV2: {
      summary: { critical_coverage: 0.9 },
      items: [],
    },
    conflictReport: { summary: { unresolved: 1, unresolved_critical: 1 }, items: [] },
    urlValidationV2: {
      summary: {
        reachable: 0,
        permanent_failure: 1,
        auth_required: 0,
        rate_limited: 0,
        transient_error: 0,
        skipped: 0,
        blocking: 1,
        stale: 0,
      },
      items: [],
    },
    validation: {
      summary: { errors: 1, warnings: 0 },
      errors: ["agent-example: invalid"],
      warnings: [],
    },
    unresolvedDuplicates: 1,
    interventions: 1,
    promotionBlocked: 1,
  });

  assert.equal(report.status, "blocked");
  assert.deepEqual(
    report.gates.map((gate) => gate.reason_code),
    [
      "critical_provenance_incomplete",
      "unresolved_critical_field_conflict",
      "unresolved_duplicate",
      "blocking_url_validation",
      "tool_card_validation_failed",
      "pending_intervention",
      "promotion_blocked",
    ],
  );
  assert.ok(report.gates.every((gate) => gate.evidence_path && gate.suggested_action));
  assert.throws(() => assertDataQualityReport(report), /critical_provenance_incomplete/);
});

test("data quality report compares absolute metrics with the previous release", () => {
  const previous = buildReport();
  const report = buildReport({
    toolCards: [reviewedToolCardFixtures[0], reviewedToolCardFixtures[1]],
    previousReport: previous,
  });

  assert.equal(report.comparison.status, "compared");
  assert.equal(report.comparison.deltas.tool_cards_total, 1);
});

test("data quality report blocks a release outside the configured coverage range", () => {
  const report = buildReport({ coverageRange: { min: 50, max: 150 } });

  assert.equal(report.status, "blocked");
  assert.equal(report.gates[0]?.reason_code, "tool_card_coverage_out_of_range");
});
