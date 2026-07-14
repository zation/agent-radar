import assert from "node:assert/strict";
import test from "node:test";
import { buildToolCardAutoReview } from "../src/ingestion/auto-review.js";
import { buildToolCardInterventionRequests } from "../src/ingestion/intervention-requests.js";
import type { SourceRecord, ToolCard } from "../src/schema.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";

const base = reviewedToolCardFixtures.find((card) => card.id === "agent-codex") ?? (() => {
  throw new Error("agent-codex fixture is required");
})();

test("reviewed exact-source profiles can resolve optional upstream metadata warnings", () => {
  const draft = { ...base, id: "agent-profiled", evidence_refs: ["record-profiled"] };
  const sourceRecord: SourceRecord = {
    id: "record-profiled",
    schema_version: "source_record.v1",
    snapshot_id: "snapshot-profiled",
    source_id: "github-repo-profiled",
    record_type: "repository",
    name: "owner/profiled",
    description: undefined,
    urls: ["https://github.com/owner/profiled"],
    raw_fields: {},
    parsed_fields: { source_profile: { tool_id: draft.id } },
    source_confidence: "high",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_repo_parser.v1",
    warnings: ["missing_description", "missing_license"]
  };
  const reviewQueue = {
    schema_version: "tool_card_review_queue.v1" as const,
    generated_at: "2026-07-10T00:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: draft.id,
      name: draft.name,
      source_id: sourceRecord.source_id,
      source_record_id: sourceRecord.id,
      status: "ready_for_review" as const,
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      validation_errors: [],
      validation_warnings: [],
      approval: undefined
    }]
  };

  const artifact = buildToolCardAutoReview([draft], [sourceRecord], reviewQueue, "2026-07-10T00:00:00Z");

  assert.equal(artifact.items[0]?.suggested_action, "promote");
  assert.deepEqual(artifact.items[0]?.human_review_reasons, []);
  assert.deepEqual(artifact.items[0], {
    tool_id: "agent-profiled",
    source_record_id: "record-profiled",
    suggested_action: "promote",
    confidence: 0.82,
    evidence_urls: ["https://developers.openai.com/codex"],
    key_evidence: ["source_urls:1", "confidence:high"],
    key_risks: ["risk_level:high", "filesystem_write", "shell_execution", "filesystem:read_write", "shell:execute"],
    missing_fields: [],
    human_review_reasons: [],
    scorecard: {
      evidence_quality: 10,
      field_completeness: 10,
      maintenance_health: 10,
      safety_clarity: 5,
      feedback_health: 10,
      duplicate_risk: 10,
      total: 9
    }
  });
});

test("discovery collection repositories are rejected without creating intervention debt", () => {
  const draft = { ...base, id: "mcp-awesome-catalog", name: "owner/awesome-mcp", evidence_refs: ["record-awesome"] };
  const sourceRecord: SourceRecord = {
    id: "record-awesome",
    schema_version: "source_record.v1",
    snapshot_id: "snapshot-awesome",
    source_id: "github-topic-mcp",
    record_type: "repository",
    name: "owner/awesome-mcp",
    description: "A curated list of MCP projects.",
    urls: ["https://github.com/owner/awesome-mcp"],
    raw_fields: {},
    parsed_fields: {},
    source_confidence: "medium",
    parsed_at: "2026-07-10T00:00:00Z",
    parser_version: "github_topic_parser.v1",
    warnings: []
  };
  const reviewQueue = {
    schema_version: "tool_card_review_queue.v1" as const,
    generated_at: "2026-07-10T00:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: draft.id,
      name: draft.name,
      source_id: sourceRecord.source_id,
      source_record_id: sourceRecord.id,
      status: "ready_for_review" as const,
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      validation_errors: [],
      validation_warnings: [],
      approval: undefined
    }]
  };

  const autoReview = buildToolCardAutoReview([draft], [sourceRecord], reviewQueue, "2026-07-10T00:00:00Z");
  const interventions = buildToolCardInterventionRequests(reviewQueue, "2026-07-10T00:00:00Z", undefined, autoReview);

  assert.equal(autoReview.items[0]?.suggested_action, "reject");
  assert.equal(interventions.summary.pending_intervention, 0);
});

test("Skill findings map missing resources and dangerous instructions into Auto Review v1", () => {
  const draft = skillDraft("skill-pdf");
  const sourceRecord = skillRecord(draft.id, {
    missing_resources: ["references/missing.md"],
    dangerous_instruction_patterns: ["approval_bypass"],
  });
  const result = buildToolCardAutoReview([draft], [sourceRecord], reviewQueueFor(draft, sourceRecord), "2026-07-14T00:00:00Z");
  const item = result.items[0];

  assert.deepEqual(item.missing_fields, ["referenced_resource:references/missing.md"]);
  assert.ok(item.key_risks.includes("dangerous_instruction:approval_bypass"));
  assert.equal(item.human_review_reasons.includes("skill_instruction_risk"), false);
  assert.equal(JSON.stringify(result).includes("type_review"), false);
  assert.equal(JSON.stringify(result).includes("skill.v1"), false);
});

test("Skill evidence ambiguity blocks promotion while fully evidenced known risk does not", () => {
  const ambiguousDraft = skillDraft("skill-ambiguous");
  const ambiguousRecord = skillRecord(ambiguousDraft.id, { ambiguous_dependencies: ["custom-runtime"] });
  const knownRiskDraft = skillDraft("skill-known-risk");
  const knownRiskRecord = skillRecord(knownRiskDraft.id, { dangerous_instruction_patterns: ["approval_bypass"] });

  const ambiguous = buildToolCardAutoReview([ambiguousDraft], [ambiguousRecord], reviewQueueFor(ambiguousDraft, ambiguousRecord), "2026-07-14T00:00:00Z").items[0];
  const knownRisk = buildToolCardAutoReview([knownRiskDraft], [knownRiskRecord], reviewQueueFor(knownRiskDraft, knownRiskRecord), "2026-07-14T00:00:00Z").items[0];

  assert.ok(ambiguous.human_review_reasons.includes("skill_evidence_ambiguous"));
  assert.notEqual(ambiguous.suggested_action, "promote");
  assert.ok(knownRisk.key_risks.includes("dangerous_instruction:approval_bypass"));
  assert.equal(knownRisk.human_review_reasons.includes("high_risk_requires_human_review"), false);
  assert.equal(knownRisk.suggested_action, "promote");
});

function skillDraft(id: string): ToolCard {
  const docsUrl = `https://github.com/example/skills/blob/main/skills/${id}/SKILL.md`;
  return {
    ...base,
    id,
    type: "skill" as const,
    repo_url: "https://github.com/example/skills",
    docs_url: docsUrl,
    source_urls: ["https://github.com/example/skills", docsUrl],
    evidence_refs: [`record-${id}`],
  };
}

function skillRecord(toolId: string, signalOverrides: Record<string, unknown>): SourceRecord {
  return {
    id: `record-${toolId}`,
    schema_version: "source_record.v1",
    snapshot_id: `snapshot-${toolId}`,
    source_id: "github-topic-agent-skills",
    record_type: "repository",
    name: toolId,
    description: "Use this skill when processing a supported task.",
    urls: [`https://github.com/example/skills/blob/main/skills/${toolId}/SKILL.md`],
    raw_fields: {},
    parsed_fields: {
      canonical_identity: `https://github.com/example/skills/blob/main/skills/${toolId}/SKILL.md`,
      generated_tool_profile: { tool_id: toolId, type: "skill" },
      skill_signals: {
        has_trigger_guidance: true,
        has_actionable_steps: true,
        has_boundary_guidance: true,
        referenced_resources: [],
        missing_resources: [],
        platform_dependencies: [],
        dangerous_instruction_patterns: [],
        ...signalOverrides,
      },
    },
    source_confidence: "medium",
    parsed_at: "2026-07-14T00:00:00Z",
    parser_version: "github_skill_topic_parser.v1",
    warnings: [],
  };
}

function reviewQueueFor(draft: ToolCard, sourceRecord: SourceRecord) {
  return {
    schema_version: "tool_card_review_queue.v1" as const,
    generated_at: "2026-07-14T00:00:00Z",
    summary: { total: 1, ready_for_review: 1, blocked_validation: 0 },
    items: [{
      tool_id: draft.id,
      name: draft.name,
      source_id: sourceRecord.source_id,
      source_record_id: sourceRecord.id,
      status: "ready_for_review" as const,
      duplicate_of_tool_ids: [],
      duplicate_of_draft_tool_ids: [],
      validation_errors: [],
      validation_warnings: [],
      approval: undefined,
    }],
  };
}
