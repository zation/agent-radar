import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeToolCardDraftsWithEvidence,
  type OverrideRecord,
} from "../src/ingestion/normalizer.js";
import type { SourceDefinition, SourceRecord } from "../src/schema.js";

function sourceDefinition(id: string, trustLevel: SourceDefinition["trust_level"]): SourceDefinition {
  return {
    id,
    name: id,
    url: `https://example.com/${id}`,
    source_type: "github",
    covered_tool_types: ["mcp"],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: trustLevel,
    field_coverage: ["description", "repo_url", "license"],
    terms_notes: "Public metadata test fixture.",
    parser: "github_repo_parser",
    failure_policy: "skip",
    enabled: true,
    owner: "test",
    last_reviewed_at: "2026-07-10T00:00:00Z",
  };
}

function repositoryRecord(overrides: Partial<SourceRecord> & Pick<SourceRecord, "id" | "source_id">): SourceRecord {
  const { id, source_id, ...rest } = overrides;
  return {
    id,
    schema_version: "source_record.v1",
    snapshot_id: `snapshot-${overrides.id}`,
    source_id,
    record_type: "repository",
    name: "example/tool",
    description: "Example tool summary.",
    urls: ["https://github.com/example/tool"],
    raw_fields: {},
    parsed_fields: {
      repo_url: "https://github.com/example/tool",
      license: "MIT",
      source_profile: {
        tool_id: "mcp-example-tool",
        type: "mcp",
      },
    },
    source_confidence: "medium",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_repo_parser.v1",
    warnings: [],
    ...rest,
  };
}

test("normalization evidence keeps every cross-source field candidate", () => {
  const records = [
    repositoryRecord({
      id: "record-discovery",
      source_id: "source-discovery",
      description: "Discovery summary.",
      urls: ["https://github.com/example/tool", "https://discovery.example.com/tool"],
      parsed_fields: {
        repo_url: "https://github.com/example/tool",
        license: "Apache-2.0",
        source_profile: { tool_id: "mcp-example-tool", type: "mcp" },
      },
    }),
    repositoryRecord({
      id: "record-official",
      source_id: "source-official",
      description: "Official summary.",
      source_confidence: "high",
    }),
  ];

  const result = normalizeToolCardDraftsWithEvidence(records, [], [
    sourceDefinition("source-discovery", "active_open_source"),
    sourceDefinition("source-official", "official"),
  ]);

  assert.equal(result.drafts.length, 1);
  assert.deepEqual(
    result.evidence.field_candidates
      .filter((item) => item.tool_card_field === "summary")
      .map((item) => item.source_record_id)
      .sort(),
    ["record-discovery", "record-official"],
  );
  assert.deepEqual(
    result.evidence.field_candidates
      .filter((item) => item.tool_card_field === "license")
      .map((item) => item.source_record_id)
      .sort(),
    ["record-discovery", "record-official"],
  );
  assert.ok(
    result.evidence.field_candidates.some(
      (item) =>
        item.tool_card_field === "source_urls" &&
        item.source_record_id === "record-discovery" &&
        item.source_field_path === "urls[1]",
    ),
  );
  assert.ok(
    result.evidence.field_candidates
      .filter((item) => item.source_field_path.startsWith("derived."))
      .every((item) =>
        (item.input_source_field_paths?.length ?? 0) > 0
        && item.input_source_field_paths?.every((path) => !path.startsWith("derived_dependencies.") && !path.startsWith("parser:")),
      ),
  );
});

test("derived provenance names the exact normalizer inputs", () => {
  const result = normalizeToolCardDraftsWithEvidence([repositoryRecord({
    id: "record-derived",
    source_id: "source-derived",
    parsed_fields: {
      repo_url: "https://github.com/example/tool",
      package_url: "https://www.npmjs.com/package/example-tool",
      package_name: "example-tool",
      topics: ["mcp"],
      keywords: ["agent"],
    },
  })]);
  const dependencies = (field: string) => result.evidence.field_candidates
    .find((item) => item.tool_card_field === field && item.source_field_path === `derived.${field}`)
    ?.input_source_field_paths;

  assert.deepEqual(dependencies("type"), ["source_id", "name", "description", "parsed_fields.topics", "parsed_fields.keywords"]);
  assert.deepEqual(dependencies("permissions"), ["parsed_fields.repo_url", "urls"]);
  assert.deepEqual(dependencies("install_methods"), [
    "parsed_fields.repo_url",
    "parsed_fields.package_url",
    "parsed_fields.package_name",
    "parsed_fields.docs_url",
    "parsed_fields.homepage_url",
    "source_confidence",
    "urls",
  ]);
});

test("manual install fallback provenance includes docs and homepage inputs", () => {
  const result = normalizeToolCardDraftsWithEvidence([repositoryRecord({
    id: "record-docs-only",
    source_id: "source-docs-only",
    urls: ["https://docs.example.com/tool"],
    parsed_fields: {
      docs_url: "https://docs.example.com/tool",
      homepage_url: "https://example.com/tool",
    },
  })]);
  const selection = result.evidence.field_candidates.find(
    (item) => item.tool_card_field === "install_methods" && item.source_field_path === "derived.install_methods",
  );

  assert.equal(result.drafts[0]?.install_methods[0]?.method, "manual");
  assert.ok(selection?.input_source_field_paths?.includes("parsed_fields.docs_url"));
  assert.ok(selection?.input_source_field_paths?.includes("parsed_fields.homepage_url"));
});

test("normalizer selects official direct evidence before discovery metadata", () => {
  const records = [
    repositoryRecord({
      id: "record-discovery",
      source_id: "source-discovery",
      description: "Discovery summary.",
      source_confidence: "high",
    }),
    repositoryRecord({
      id: "record-official",
      source_id: "source-official",
      description: "Official summary.",
      source_confidence: "medium",
    }),
  ];

  const result = normalizeToolCardDraftsWithEvidence(records, [], [
    sourceDefinition("source-discovery", "active_open_source"),
    sourceDefinition("source-official", "official"),
  ]);
  const selection = result.evidence.field_selections.find(
    (item) => item.tool_card_field === "summary",
  );

  assert.equal(result.drafts[0]?.summary, "Official summary.");
  assert.equal(selection?.reason_code, "official_direct_evidence");
  assert.deepEqual(selection?.selected_source_record_ids, ["record-official"]);
});

test("normalizer resolves formatting-only differences to a normalized value", () => {
  const records = [
    repositoryRecord({
      id: "record-a",
      source_id: "source-a",
      parsed_fields: {
        repo_url: "https://github.com/example/tool",
        license: " mit ",
        source_profile: { tool_id: "mcp-example-tool", type: "mcp" },
      },
    }),
    repositoryRecord({
      id: "record-b",
      source_id: "source-b",
      parsed_fields: {
        repo_url: "https://github.com/example/tool",
        license: "MIT",
        source_profile: { tool_id: "mcp-example-tool", type: "mcp" },
      },
    }),
  ];

  const result = normalizeToolCardDraftsWithEvidence(records, [], [
    sourceDefinition("source-a", "active_open_source"),
    sourceDefinition("source-b", "active_open_source"),
  ]);
  const conflict = result.evidence.conflicts.find(
    (item) => item.tool_card_field === "license",
  );

  assert.equal(result.drafts[0]?.license, "MIT");
  assert.equal(conflict?.conflict_type, "format_difference");
  assert.equal(conflict?.resolution_status, "resolved");
});

test("normalization evidence records an override conflict only for its declared field", () => {
  const record = repositoryRecord({
    id: "record-official",
    source_id: "source-official",
    description: "Original summary.",
  });
  const override: OverrideRecord = {
    id: "override-summary",
    schema_version: "override_record.v1",
    target_type: "tool_card",
    target_id: "mcp-example-tool",
    field: "summary",
    new_value: "Corrected summary.",
    reason: "Official documentation clarified the scope.",
    evidence_urls: ["https://example.com/evidence"],
    created_by: "reviewer",
    created_at: "2026-07-10T01:00:00Z",
  };

  const result = normalizeToolCardDraftsWithEvidence(
    [record],
    [override],
    [sourceDefinition("source-official", "official")],
  );
  const summarySelection = result.evidence.field_selections.find(
    (item) => item.tool_card_field === "summary",
  );
  const overrideConflicts = result.evidence.conflicts.filter(
    (item) => item.conflict_type === "override",
  );

  assert.equal(result.drafts[0]?.summary, "Corrected summary.");
  assert.equal(summarySelection?.override_record_id, "override-summary");
  assert.deepEqual(summarySelection?.override_evidence_urls, ["https://example.com/evidence"]);
  assert.equal(summarySelection?.override_reason, "Official documentation clarified the scope.");
  assert.equal(summarySelection?.override_created_by, "reviewer");
  assert.equal(summarySelection?.override_created_at, "2026-07-10T01:00:00Z");
  assert.equal(summarySelection?.reason_code, "explicit_override");
  assert.deepEqual(
    overrideConflicts.map((item) => item.tool_card_field),
    ["summary"],
  );
});

test("normalizer selects exact repository metadata before topic discovery", () => {
  const discoverySource = sourceDefinition("source-discovery", "active_open_source");
  discoverySource.url = "https://github.com/topics/mcp";
  const exactSource = sourceDefinition("source-exact", "well_known_org");
  exactSource.url = "https://github.com/example/tool";
  const records = [
    repositoryRecord({
      id: "record-discovery",
      source_id: discoverySource.id,
      description: "Discovery summary.",
      source_confidence: "high",
    }),
    repositoryRecord({
      id: "record-exact",
      source_id: exactSource.id,
      description: "Exact repository summary.",
      source_confidence: "medium",
    }),
  ];

  const result = normalizeToolCardDraftsWithEvidence(records, [], [discoverySource, exactSource]);
  const selection = result.evidence.field_selections.find(
    (item) => item.tool_card_field === "summary",
  );

  assert.equal(result.drafts[0]?.summary, "Exact repository summary.");
  assert.equal(selection?.reason_code, "exact_metadata");
});

test("normalization evidence leaves equal-rank critical semantic conflicts unresolved", () => {
  const records = [
    repositoryRecord({
      id: "record-a",
      source_id: "source-a",
      description: "First incompatible scope.",
    }),
    repositoryRecord({
      id: "record-b",
      source_id: "source-b",
      description: "Second incompatible scope.",
    }),
  ];

  const result = normalizeToolCardDraftsWithEvidence(records, [], [
    sourceDefinition("source-a", "active_open_source"),
    sourceDefinition("source-b", "active_open_source"),
  ]);
  const conflict = result.evidence.conflicts.find(
    (item) => item.tool_card_field === "summary",
  );
  const selection = result.evidence.field_selections.find(
    (item) => item.tool_card_field === "summary",
  );

  assert.equal(conflict?.critical, true);
  assert.equal(conflict?.conflict_type, "semantic_conflict");
  assert.equal(conflict?.resolution_status, "unresolved");
  assert.equal(conflict?.reason_code, "equal_rank_semantic_conflict");
  assert.equal(selection?.reason_code, "unresolved_conflict_fallback");
});

test("normalizer merges discovery and profiled exact records by canonical repository", () => {
  const discovery = repositoryRecord({
    id: "record-discovery",
    source_id: "source-discovery",
    parsed_fields: {
      repo_url: "https://github.com/example/tool",
      license: "MIT",
    },
  });
  const exact = repositoryRecord({
    id: "record-exact",
    source_id: "source-exact",
    parsed_fields: {
      repo_url: "https://github.com/example/tool",
      license: "MIT",
      source_profile: { tool_id: "mcp-example-tool", type: "mcp" },
    },
  });

  const discoverySource = sourceDefinition("source-discovery", "active_open_source");
  discoverySource.url = "https://github.com/topics/mcp";
  const exactSource = sourceDefinition("source-exact", "well_known_org");
  exactSource.url = "https://github.com/example/tool";
  const result = normalizeToolCardDraftsWithEvidence(
    [discovery, exact],
    [],
    [discoverySource, exactSource],
  );

  assert.equal(result.drafts.length, 1);
  assert.equal(result.drafts[0]?.id, "mcp-example-tool");
  assert.deepEqual(result.drafts[0]?.evidence_refs.slice(0, 2), ["record-exact", "record-discovery"]);
});

test("normalization evidence attributes generated Skill profile fields to their real paths", () => {
  const docsUrl = "https://github.com/anthropics/skills/blob/main/skills/pdf/SKILL.md";
  const record = repositoryRecord({
    id: "record-skill-pdf",
    source_id: "github-topic-agent-skills",
    name: "PDF Skill",
    description: "Use this skill when working with PDFs.",
    urls: ["https://github.com/anthropics/skills", docsUrl],
    parsed_fields: {
      canonical_identity: docsUrl,
      repo_url: "https://github.com/anthropics/skills",
      docs_url: docsUrl,
      generated_tool_profile: {
        tool_id: "skill-anthropics-skills-pdf",
        type: "skill",
        summary: "Use this skill when working with PDFs.",
        permissions: [],
        security: {
          risk_level: "low",
          trust_level: "active_open_source",
          known_risks: ["untrusted_skill_instructions"],
          requires_human_approval: false,
          security_notes: "Review first.",
        },
      },
    },
  });

  const result = normalizeToolCardDraftsWithEvidence([record]);

  assert.equal(result.drafts[0]?.id, "skill-anthropics-skills-pdf");
  assert.ok(result.evidence.field_candidates.some((item) => item.tool_card_field === "type" && item.source_field_path === "parsed_fields.generated_tool_profile.type"));
  assert.ok(result.evidence.field_candidates.some((item) => item.tool_card_field === "canonical_identity" && item.source_field_path === "parsed_fields.canonical_identity"));
});
