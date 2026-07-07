import assert from "node:assert/strict";
import test from "node:test";
import { createEvalPopoverRows } from "../src/ui/eval-popover.js";

test("formats eval results for the topbar popover", () => {
  const rows = createEvalPopoverRows({
    total: 2,
    passed: 1,
    results: [
      {
        case_id: "gq-browser-screenshot-validation",
        passed: true,
        recommended_action: "use"
      },
      {
        case_id: "gq-no-reliable-match-high-risk",
        passed: false,
        recommended_action: "no_reliable_match"
      }
    ]
  });

  assert.deepEqual(rows, [
    {
      id: "gq-browser-screenshot-validation",
      label: "browser-screenshot-validation",
      status: "passed",
      action: "use"
    },
    {
      id: "gq-no-reliable-match-high-risk",
      label: "no-reliable-match-high-risk",
      status: "failed",
      action: "no_reliable_match"
    }
  ]);
});
