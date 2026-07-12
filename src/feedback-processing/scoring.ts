import type { FeedbackAdjustment } from "../schema.js";
import type { FeedbackToolSummary } from "./artifacts.js";
import { FEEDBACK_RULES_VERSION } from "./contracts.js";

export const EMPTY_FEEDBACK_SNAPSHOT_CHECKSUM = `sha256:${"0".repeat(64)}` as const;

export function calculateFeedbackAdjustment(summary: FeedbackToolSummary, voteSnapshotChecksum: `sha256:${string}`): FeedbackAdjustment {
  const d1Tenths = (summary.up_count - summary.down_count) * 2;
  const issueTenths = Math.round(summary.issue_adjustment * 10);
  const rawTenths = d1Tenths + issueTenths;
  const appliedTenths = Math.max(-30, Math.min(30, rawTenths));
  if (summary.d1_adjustment !== d1Tenths / 10 || summary.raw_adjustment !== rawTenths / 10 || summary.applied_adjustment !== appliedTenths / 10) {
    throw new Error(`feedback_summary_math_mismatch: ${summary.tool_id}`);
  }
  return {
    d1: d1Tenths / 10,
    accepted_issues: issueTenths / 10,
    raw: rawTenths / 10,
    applied: appliedTenths / 10,
    cap: 3,
    rules_version: FEEDBACK_RULES_VERSION,
    vote_snapshot_checksum: voteSnapshotChecksum,
    accepted_issue_ids: [...summary.accepted_issue_ids].sort((left, right) => left - right),
  };
}

export function emptyFeedbackAdjustment(voteSnapshotChecksum: `sha256:${string}` = EMPTY_FEEDBACK_SNAPSHOT_CHECKSUM): FeedbackAdjustment {
  return {
    d1: 0,
    accepted_issues: 0,
    raw: 0,
    applied: 0,
    cap: 3,
    rules_version: FEEDBACK_RULES_VERSION,
    vote_snapshot_checksum: voteSnapshotChecksum,
    accepted_issue_ids: [],
  };
}
