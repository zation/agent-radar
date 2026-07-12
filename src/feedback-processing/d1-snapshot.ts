import type { FeedbackVoteRow } from "./artifacts.js";

const FORBIDDEN_KEYS = /^(github_user_id|github_login|user_id|login|vote)$/i;

export function parseD1AggregateSnapshot(value: unknown): FeedbackVoteRow[] {
  if (!Array.isArray(value)) throw new Error("d1_snapshot_invalid_envelope");
  const rows: unknown[] = [];
  for (const envelope of value) {
    if (!isRecord(envelope) || !Array.isArray(envelope.results)) throw new Error("d1_snapshot_invalid_envelope");
    rows.push(...envelope.results);
  }
  return rows.map((row) => {
    if (!isRecord(row)) throw new Error("d1_snapshot_invalid_row");
    if (Object.keys(row).some((key) => FORBIDDEN_KEYS.test(key))) throw new Error("d1_snapshot_privacy_violation");
    const { tool_id, up_count, down_count, row_count } = row;
    if (typeof tool_id !== "string" || !tool_id.trim()) throw new Error("d1_snapshot_invalid_tool_id");
    if (![up_count, down_count, row_count].every((count) => Number.isSafeInteger(count) && Number(count) >= 0)) {
      throw new Error("d1_snapshot_invalid_count");
    }
    if (Number(up_count) + Number(down_count) !== Number(row_count)) throw new Error("d1_snapshot_count_mismatch");
    return { tool_id, up_count: Number(up_count), down_count: Number(down_count), row_count: Number(row_count) };
  }).sort((left, right) => left.tool_id.localeCompare(right.tool_id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

