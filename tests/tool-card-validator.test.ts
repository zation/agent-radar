import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { validateToolCards } from "../src/validation/tool-card-validator.js";
import type { ToolCard } from "../src/schema.js";

test("tool card validator accepts reviewed seed cards", () => {
  const validation = validateToolCards(seedToolCards);

  assert.equal(validation.passed, true);
  assert.deepEqual(validation.errors, []);
  assert.equal(validation.checked_count, seedToolCards.length);
});

test("tool card validator rejects cards missing release-quality fields", () => {
  const invalidCard: ToolCard = {
    ...seedToolCards[0],
    id: "invalid-tool-card",
    source_urls: [],
    use_cases: [],
    not_for: [],
    install_methods: [],
    permissions: [{ scope: "unknown", access: "unknown", required: true, notes: "" }],
    security: {
      ...seedToolCards[0].security,
      risk_level: "unknown",
      security_notes: ""
    },
    evidence_refs: [],
    confidence: "low",
    maturity: "unknown"
  };

  const validation = validateToolCards([invalidCard]);

  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: source_urls is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: use_cases is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: not_for is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: install_methods is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: permissions cannot include unknown scope or access/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: security risk_level cannot be unknown/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: evidence_refs is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: confidence must be at least medium for reliable release/);
});
