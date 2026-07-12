import type { FeedbackStore, FeedbackSummary, VoteMutation } from "./contracts.js";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run(): Promise<{ success: boolean }>;
}

export interface D1Database {
  prepare(sql: string): D1Statement;
}

export class FeedbackRateLimitError extends Error {
  constructor() { super("Feedback mutation rate limit exceeded"); this.name = "FeedbackRateLimitError"; }
}

const SUMMARY_SQL = `SELECT
  SUM(CASE WHEN vote = 'up' THEN 1 ELSE 0 END) AS up_count,
  SUM(CASE WHEN vote = 'down' THEN 1 ELSE 0 END) AS down_count,
  MAX(CASE WHEN github_user_id = ?2 THEN vote END) AS viewer_vote
FROM feedback_votes WHERE tool_id = ?1`;

const RATE_SQL = `INSERT INTO feedback_rate_limits (github_user_id, window_started_at, mutation_count)
VALUES (?1, ?2, 1) ON CONFLICT(github_user_id) DO UPDATE SET
window_started_at = excluded.window_started_at,
mutation_count = CASE WHEN feedback_rate_limits.window_started_at = excluded.window_started_at
  THEN feedback_rate_limits.mutation_count + 1 ELSE 1 END
RETURNING mutation_count`;

export function createD1FeedbackStore(db: D1Database): FeedbackStore {
  const getSummary = async (toolId: string, viewerId = ""): Promise<FeedbackSummary> => {
    const row = await db.prepare(SUMMARY_SQL).bind(toolId, viewerId).first<{ up_count: number | null; down_count: number | null; viewer_vote: "up" | "down" | null }>();
    return { tool_id: toolId, up: Number(row?.up_count ?? 0), down: Number(row?.down_count ?? 0), viewer_vote: row?.viewer_vote ?? null };
  };

  return {
    getSummary,
    async mutateVote({ user, toolId, vote }: VoteMutation, now = new Date()) {
      const window = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString();
      const rate = await db.prepare(RATE_SQL).bind(user.github_user_id, window).first<{ mutation_count: number }>();
      if (!rate || rate.mutation_count > 30) throw new FeedbackRateLimitError();
      if (vote === null) {
        await db.prepare("DELETE FROM feedback_votes WHERE github_user_id = ?1 AND tool_id = ?2").bind(user.github_user_id, toolId).run();
      } else {
        await db.prepare(`INSERT INTO feedback_votes (github_user_id, github_login, tool_id, vote, created_at, updated_at)
VALUES (?1, ?2, ?3, ?4, ?5, ?5) ON CONFLICT(github_user_id, tool_id) DO UPDATE SET
github_login = excluded.github_login, vote = excluded.vote, updated_at = excluded.updated_at`)
          .bind(user.github_user_id, user.github_login, toolId, vote, now.toISOString()).run();
      }
      return getSummary(toolId, user.github_user_id);
    }
  };
}
