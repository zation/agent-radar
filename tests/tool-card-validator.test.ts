import assert from "node:assert/strict";
import test from "node:test";
import { seedToolCards } from "../src/data/seed-tool-cards.js";
import { checkToolCardUrls, validateToolCards } from "../src/validation/tool-card-validator.js";
import type { ToolCard } from "../src/schema.js";

test("tool card validator accepts reviewed seed cards", () => {
  const validation = validateToolCards(seedToolCards);

  assert.equal(validation.passed, true);
  assert.deepEqual(validation.errors, []);
  assert.deepEqual(validation.summary, { errors: 0, warnings: 0 });
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
  assert.equal(validation.summary.errors > 0, true);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: source_urls is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: use_cases is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: not_for is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: install_methods is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: permissions cannot include unknown scope or access/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: security risk_level cannot be unknown/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: evidence_refs is required/);
  assert.match(validation.errors.join("\n"), /invalid-tool-card: confidence must be at least medium for reliable release/);
});

test("tool card validator accepts ISO UTC timestamps with milliseconds", () => {
  const card: ToolCard = {
    ...seedToolCards[0],
    id: "millisecond-timestamp-card",
    last_checked_at: "2026-07-08T12:34:56.789Z",
    created_at: "2026-07-08T12:34:56.789Z",
    updated_at: "2026-07-08T12:34:56.789Z"
  };

  const validation = validateToolCards([card]);

  assert.equal(validation.passed, true);
});

test("tool card validator audits override evidence references", () => {
  const overrideEvidenceCard: ToolCard = {
    ...seedToolCards[0],
    id: "override-evidence-card",
    evidence_refs: ["override-openai-docs-summary-20260708"]
  };

  const missingOverrideValidation = validateToolCards([overrideEvidenceCard]);

  assert.equal(missingOverrideValidation.passed, false);
  assert.match(
    missingOverrideValidation.errors.join("\n"),
    /override-evidence-card: evidence ref override-openai-docs-summary-20260708 requires matching override record/
  );

  const auditedOverrideValidation = validateToolCards([overrideEvidenceCard], {
    overrideRecords: [
      {
        id: "override-openai-docs-summary-20260708",
        schema_version: "override_record.v1",
        target_type: "tool_card",
        target_id: "override-evidence-card",
        field: "summary",
        new_value: "Reviewed override summary.",
        reason: "Manual correction with public evidence.",
        evidence_urls: ["https://platform.openai.com/docs"],
        created_by: "maintainer",
        created_at: "2026-07-08T12:00:00Z"
      }
    ]
  });

  assert.equal(auditedOverrideValidation.passed, true);
});

test("tool card validator requires URL fields to be covered by source URLs", () => {
  const card: ToolCard = {
    ...seedToolCards[0],
    id: "url-field-evidence-card",
    source_urls: ["https://example.com/source"],
    docs_url: "https://example.com/docs",
    repo_url: "https://example.com/repo",
    package_urls: ["https://example.com/package"],
    install_methods: [
      {
        method: "npm",
        command: "npm install example",
        docs_url: "https://example.com/install",
        confidence: "high"
      }
    ]
  };

  const validation = validateToolCards([card]);

  assert.equal(validation.passed, false);
  assert.match(validation.errors.join("\n"), /url-field-evidence-card: docs_url must be included in source_urls/);
  assert.match(validation.errors.join("\n"), /url-field-evidence-card: repo_url must be included in source_urls/);
  assert.match(validation.errors.join("\n"), /url-field-evidence-card: package_urls must be included in source_urls/);
  assert.match(validation.errors.join("\n"), /url-field-evidence-card: install_methods docs_url must be included in source_urls/);
});

test("tool card URL checker records reachable failed and skipped URLs", async () => {
  const calls: Array<{ url: string; method: string }> = [];
  const fetchImpl: typeof fetch = (url, init) => {
    const requestUrl = typeof url === "string" ? url : url instanceof URL ? url.toString() : url.url;
    const method = init?.method ?? "GET";
    calls.push({ url: requestUrl, method });

    if (requestUrl === "https://example.com/head-ok") return Promise.resolve(new Response("ok", { status: 200 }));
    if (requestUrl === "https://example.com/head-405" && method === "HEAD") return Promise.resolve(new Response("", { status: 405 }));
    if (requestUrl === "https://example.com/head-405" && method === "GET") return Promise.resolve(new Response("ok", { status: 200 }));
    if (requestUrl === "https://example.com/missing") return Promise.resolve(new Response("missing", { status: 404 }));
    return Promise.reject(new Error("unexpected url"));
  };

  const card: ToolCard = {
    ...seedToolCards[0],
    id: "url-reachability-card",
    source_urls: ["https://example.com/head-ok", "https://example.com/head-405", "https://example.com/missing", "internal://manual-review/source"],
    docs_url: "https://example.com/head-ok",
    repo_url: undefined,
    homepage_url: undefined,
    package_urls: [],
    install_methods: [{ method: "manual", command: "", docs_url: "https://example.com/head-405", confidence: "high" }]
  };

  const artifact = await checkToolCardUrls([card], { fetchImpl, checkedAt: "2026-07-08T00:00:00Z" });

  assert.equal(artifact.schema_version, "tool_card_url_validation.v1");
  assert.deepEqual(artifact.summary, { checked: 3, reachable: 2, failed: 1, skipped: 1 });
  assert.equal(artifact.items.find((item) => item.url === "https://example.com/head-ok")?.status, "reachable");
  assert.equal(artifact.items.find((item) => item.url === "https://example.com/head-405")?.method, "GET");
  assert.equal(artifact.items.find((item) => item.url === "https://example.com/missing")?.status, "failed");
  assert.equal(artifact.items.find((item) => item.url === "internal://manual-review/source")?.status, "skipped");
  assert.ok(calls.some((call) => call.url === "https://example.com/head-405" && call.method === "HEAD"));
  assert.ok(calls.some((call) => call.url === "https://example.com/head-405" && call.method === "GET"));
});
