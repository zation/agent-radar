import type { ToolCard } from "../schema.js";
import type {
  ToolCardFieldCandidate,
  ToolCardFieldConflictDecision,
  ToolCardNormalizationEvidence,
} from "./normalization-evidence.js";

export interface ToolCardConflictReport {
  schema_version: "tool_card_conflict_report.v1";
  generated_at: string;
  items: Array<ToolCardFieldConflictDecision & {
    canonical_identity: {
      repository?: string;
      package?: string;
      docs?: string;
      aliases: string[];
    };
    candidates: ToolCardFieldCandidate[];
    suggested_action?: "resolve_field_conflict";
  }>;
  summary: {
    resolved: number;
    unresolved: number;
    unresolved_critical: number;
  };
}

export function buildToolCardConflictReport(
  drafts: ToolCard[],
  normalizationEvidence: ToolCardNormalizationEvidence,
  generatedAt: string,
): ToolCardConflictReport {
  const draftsById = new Map(drafts.map((draft) => [draft.id, draft]));
  const items = normalizationEvidence.conflicts.flatMap((conflict) => {
    const draft = draftsById.get(conflict.tool_id);
    if (!draft) return [];
    return [{
      ...conflict,
      canonical_identity: {
        repository: draft.repo_url,
        package: draft.package_urls?.[0],
        docs: draft.docs_url,
        aliases: [draft.id],
      },
      candidates: normalizationEvidence.field_candidates.filter(
        (candidate) =>
          candidate.tool_id === conflict.tool_id &&
          candidate.tool_card_field === conflict.tool_card_field,
      ),
      suggested_action:
        conflict.resolution_status === "unresolved"
          ? "resolve_field_conflict" as const
          : undefined,
    }];
  });

  return {
    schema_version: "tool_card_conflict_report.v1",
    generated_at: generatedAt,
    items,
    summary: {
      resolved: items.filter((item) => item.resolution_status === "resolved").length,
      unresolved: items.filter((item) => item.resolution_status === "unresolved").length,
      unresolved_critical: items.filter(
        (item) => item.resolution_status === "unresolved" && item.critical,
      ).length,
    },
  };
}
