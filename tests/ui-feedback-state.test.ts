import assert from "node:assert/strict";
import test from "node:test";
import { optimisticVote } from "../src/ui/feedback-state.js";

test("optimistic votes add, switch and cancel with exact count math", () => {
  const base = { tool_id: "a", up: 2, down: 1, viewer_vote: null } as const;
  const up = optimisticVote(base, "up"); assert.deepEqual(up, { ...base, up: 3, viewer_vote: "up" });
  const down = optimisticVote(up, "down"); assert.equal(down.up, 2); assert.equal(down.down, 2);
  assert.deepEqual(optimisticVote(down, null), base);
});
