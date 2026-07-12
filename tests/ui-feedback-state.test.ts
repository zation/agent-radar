import assert from "node:assert/strict";
import test from "node:test";
import { optimisticVote, parseOAuthFeedbackReturn } from "../src/ui/feedback-state.js";

test("optimistic votes add, switch and cancel with exact count math", () => {
  const base = { tool_id: "a", up: 2, down: 1, viewer_vote: null } as const;
  const up = optimisticVote(base, "up"); assert.deepEqual(up, { ...base, up: 3, viewer_vote: "up" });
  const down = optimisticVote(up, "down"); assert.equal(down.up, 2); assert.equal(down.down, 2);
  assert.deepEqual(optimisticVote(down, null), base);
});

test("OAuth feedback return identifies the Tool whose details dialog should open", () => {
  assert.deepEqual(parseOAuthFeedbackReturn("https://radar.test/?tool=skill-a&feedback=applied"), { toolId: "skill-a" });
  assert.equal(parseOAuthFeedbackReturn("https://radar.test/?tool=skill-a"), null);
  assert.equal(parseOAuthFeedbackReturn("https://radar.test/?feedback=applied"), null);
});
