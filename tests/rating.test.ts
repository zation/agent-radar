import assert from "node:assert/strict";
import test from "node:test";
import { rateToolCard } from "../src/rating/engine.js";
import { reviewedToolCardFixtures } from "./fixtures/tool-card-fixtures.js";
import type { SourceRecord, ToolCard } from "../src/schema.js";

test("rates official low-risk skills as recommendable with explanations", () => {
  const card = reviewedToolCardFixtures.find((tool) => tool.id === "skill-openai-docs")!;
  const rating = rateToolCard(card);

  assert.equal(rating.rules_version, "rating_rules.v0.2");
  assert.equal(rating.schema_version, "rating_result.v2");
  assert.equal(rating.base_score, rating.overall_score);
  assert.equal(rating.recommendation_level, "recommended");
  assert.equal(rating.risk_level, "low");
  assert.ok(rating.overall_score >= 75);
  assert.ok(rating.explanations.some((explanation) => explanation.dimension === "task_fit"));
});

test("downgrades unknown code execution tools to avoid", () => {
  const unsafeCard: ToolCard = {
    ...reviewedToolCardFixtures[0],
    id: "unknown-code-execution-tool",
    name: "Unknown Code Execution Tool",
    type: "agent",
    confidence: "low",
    permissions: [{ scope: "code_execution", access: "execute", required: true, notes: "Runs generated code." }],
    security: {
      risk_level: "unknown",
      trust_level: "unknown",
      known_risks: ["unknown_code_execution"],
      requires_human_approval: true,
      security_notes: "Source and execution boundary are unknown."
    },
    maintenance: { ...reviewedToolCardFixtures[0].maintenance, status: "unknown", maintainer_type: "unknown" }
  };

  const rating = rateToolCard(unsafeCard);

  assert.equal(rating.risk_level, "high");
  assert.equal(rating.recommendation_level, "avoid");
  assert.ok(rating.penalties.includes("unknown_trust_with_execution"));
});

test("non-Skill rating semantics remain unchanged under the compatibility policy", () => {
  const expected = {
    agent: { dimension_scores: { task_fit: 90, evidence_quality: 95, documentation_quality: 85, maintenance_health: 90, integration_cost: 78, security_posture: 70, community_signal: 80 }, base_score: 84, risk_level: "high", recommendation_level: "consider", penalties: [], boosts: ["official_source", "active_maintenance", "permission_boundary_documented"] },
    mcp: { dimension_scores: { task_fit: 90, evidence_quality: 75, documentation_quality: 85, maintenance_health: 90, integration_cost: 78, security_posture: 85, community_signal: 80 }, base_score: 83, risk_level: "medium", recommendation_level: "recommended", penalties: [], boosts: ["active_maintenance", "permission_boundary_documented"] },
    framework: { dimension_scores: { task_fit: 90, evidence_quality: 95, documentation_quality: 85, maintenance_health: 90, integration_cost: 78, security_posture: 70, community_signal: 80 }, base_score: 84, risk_level: "high", recommendation_level: "consider", penalties: [], boosts: ["official_source", "active_maintenance", "permission_boundary_documented"] },
    cli: { dimension_scores: { task_fit: 90, evidence_quality: 95, documentation_quality: 85, maintenance_health: 90, integration_cost: 78, security_posture: 70, community_signal: 80 }, base_score: 84, risk_level: "high", recommendation_level: "consider", penalties: [], boosts: ["official_source", "active_maintenance", "permission_boundary_documented"] },
  } as const;

  for (const type of ["agent", "mcp", "framework", "cli"] as const) {
    const card = reviewedToolCardFixtures.find((candidate) => candidate.type === type)!;
    const rating = rateToolCard(card);
    assert.deepEqual({
      dimension_scores: rating.dimension_scores,
      base_score: rating.base_score,
      risk_level: rating.risk_level,
      recommendation_level: rating.recommendation_level,
      penalties: rating.penalties,
      boosts: rating.boosts,
    }, expected[type]);
  }
});

test("Skill policy scores deterministic content dimensions with bounded evidence context", () => {
  const card = reviewedToolCardFixtures.find((tool) => tool.id === "skill-openai-docs")!;
  const complete = skillRecord({ has_trigger_guidance: true, has_actionable_steps: true, has_boundary_guidance: true, heading_count: 3, missing_resources: [], platform_dependencies: [], dangerous_instruction_patterns: [] }, 100);
  const rating = rateToolCard(card, undefined, { sourceRecords: [complete] });

  assert.deepEqual(Object.keys(rating.dimension_scores), [
    "trigger_clarity",
    "instruction_quality",
    "task_fit",
    "boundary_clarity",
    "portability",
    "evidence_quality",
    "maintenance_health",
    "security_posture",
  ]);
  assert.equal(rating.rules_version, "rating_rules.v0.2");
  assert.equal(rating.base_score, Math.round(
    rating.dimension_scores.trigger_clarity * 0.18
    + rating.dimension_scores.instruction_quality * 0.20
    + rating.dimension_scores.task_fit * 0.20
    + rating.dimension_scores.boundary_clarity * 0.12
    + rating.dimension_scores.portability * 0.10
    + rating.dimension_scores.evidence_quality * 0.10
    + rating.dimension_scores.maintenance_health * 0.05
    + rating.dimension_scores.security_posture * 0.05
  ));

  const noTrigger = rateToolCard(card, undefined, { sourceRecords: [skillRecord({ ...complete.parsed_fields.skill_signals as Record<string, unknown>, has_trigger_guidance: false }, 100)] });
  const noBoundary = rateToolCard(card, undefined, { sourceRecords: [skillRecord({ ...complete.parsed_fields.skill_signals as Record<string, unknown>, has_boundary_guidance: false }, 100)] });
  const missingResource = rateToolCard(card, undefined, { sourceRecords: [skillRecord({ ...complete.parsed_fields.skill_signals as Record<string, unknown>, missing_resources: ["references/missing.md"] }, 100)] });
  const moreStars = rateToolCard(card, undefined, { sourceRecords: [skillRecord(complete.parsed_fields.skill_signals as Record<string, unknown>, 100000)] });

  assert.ok(noTrigger.dimension_scores.trigger_clarity < rating.dimension_scores.trigger_clarity);
  assert.equal(noTrigger.dimension_scores.instruction_quality, rating.dimension_scores.instruction_quality);
  assert.ok(noBoundary.dimension_scores.boundary_clarity < rating.dimension_scores.boundary_clarity);
  assert.equal(noBoundary.dimension_scores.task_fit, rating.dimension_scores.task_fit);
  assert.ok(missingResource.dimension_scores.instruction_quality < rating.dimension_scores.instruction_quality);
  assert.ok(missingResource.dimension_scores.portability < rating.dimension_scores.portability);
  assert.deepEqual(moreStars.dimension_scores, rating.dimension_scores);
});

function skillRecord(signals: Record<string, unknown>, stars: number): SourceRecord {
  return {
    id: "record-skill-openai-docs",
    schema_version: "source_record.v1",
    snapshot_id: "snapshot-skill-openai-docs",
    source_id: "github-topic-agent-skills",
    record_type: "repository",
    name: "OpenAI Docs Skill",
    urls: ["https://github.com/example/skills/blob/main/skills/openai-docs/SKILL.md"],
    raw_fields: {},
    parsed_fields: { stars, skill_signals: signals },
    source_confidence: "medium",
    parsed_at: "2026-07-14T00:00:00Z",
    parser_version: "github_skill_topic_parser.v1",
    warnings: [],
  };
}
