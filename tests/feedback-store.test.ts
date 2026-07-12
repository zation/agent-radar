import assert from "node:assert/strict";
import test from "node:test";
import { FeedbackRateLimitError, createD1FeedbackStore, type D1Database } from "../src/feedback/store.js";

test("feedback store adds, switches, cancels, aggregates and refreshes login", async () => {
  const db = new MemoryD1();
  const store = createD1FeedbackStore(db);
  const user = { github_user_id: "42", github_login: "octocat" };
  const now = new Date("2026-07-12T10:00:00.000Z");

  assert.deepEqual(await store.getSummary("tool-a", "42"), { tool_id: "tool-a", up: 0, down: 0, viewer_vote: null });
  await store.mutateVote({ user, toolId: "tool-a", vote: "up" }, now);
  await store.mutateVote({ user: { ...user, github_login: "octocat-new" }, toolId: "tool-a", vote: "down" }, now);
  assert.deepEqual(await store.getSummary("tool-a", "42"), { tool_id: "tool-a", up: 0, down: 1, viewer_vote: "down" });
  assert.equal(db.votes.get("42/tool-a")?.login, "octocat-new");
  await store.mutateVote({ user, toolId: "tool-a", vote: null }, now);
  assert.deepEqual(await store.getSummary("tool-a", "42"), { tool_id: "tool-a", up: 0, down: 0, viewer_vote: null });
});

test("feedback store rejects mutation 31 in a fixed minute", async () => {
  const store = createD1FeedbackStore(new MemoryD1());
  const user = { github_user_id: "42", github_login: "octocat" };
  const now = new Date("2026-07-12T10:00:20.000Z");
  for (let index = 0; index < 30; index += 1) await store.mutateVote({ user, toolId: `tool-${index}`, vote: "up" }, now);
  await assert.rejects(() => store.mutateVote({ user, toolId: "tool-31", vote: "up" }, now), FeedbackRateLimitError);
});

class MemoryD1 implements D1Database {
  votes = new Map<string, { user: string; login: string; tool: string; vote: "up" | "down" }>();
  rates = new Map<string, { window: string; count: number }>();
  prepare(sql: string) {
    const db = this;
    let args: unknown[] = [];
    return {
      bind(...values: unknown[]) { args = values; return this; },
      async first<T>() {
        if (sql.includes("feedback_rate_limits")) {
          const [user, window] = args as string[];
          const current = db.rates.get(user);
          const count = current?.window === window ? current.count + 1 : 1;
          db.rates.set(user, { window, count });
          return { mutation_count: count } as T;
        }
        const [tool, viewer] = args as string[];
        const rows = [...db.votes.values()].filter((row) => row.tool === tool);
        return { up_count: rows.filter((row) => row.vote === "up").length, down_count: rows.filter((row) => row.vote === "down").length, viewer_vote: rows.find((row) => row.user === viewer)?.vote ?? null } as T;
      },
      async run() {
        if (sql.startsWith("DELETE")) {
          const [user, tool] = args as string[]; db.votes.delete(`${user}/${tool}`);
        } else {
          const [user, login, tool, vote] = args as [string, string, string, "up" | "down"];
          db.votes.set(`${user}/${tool}`, { user, login, tool, vote });
        }
        return { success: true };
      }
    };
  }
}
