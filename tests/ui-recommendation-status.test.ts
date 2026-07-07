import assert from "node:assert/strict";
import test from "node:test";
import { buildRecommendationRunSummary } from "../src/ui/recommendation-status.js";

test("formats a visible recommendation run summary", () => {
  const summary = buildRecommendationRunSummary({
    runCount: 2,
    action: "no_reliable_match",
    query: "自动处理线上支付退款并读取生产数据库"
  });

  assert.equal(summary, "Run 2 complete · no_reliable_match · 自动处理线上支付退款并读取生产数据库");
});
