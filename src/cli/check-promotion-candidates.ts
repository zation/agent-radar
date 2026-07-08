import { readFile } from "node:fs/promises";
import type { ToolCardPromotionCheck } from "../ingestion/promotion-check.js";

const promotionCheckPath = process.argv[2] ?? "data/promotion_candidates/promotion_check.json";
const promotionCheck = JSON.parse(await readFile(promotionCheckPath, "utf8")) as ToolCardPromotionCheck;

const summary = promotionCheck.summary;
const message = `promotion check ${promotionCheck.passed ? "passed" : "failed"}: ${summary.ready_for_publish} ready, ${summary.blocked} blocked, ${summary.validation_errors} validation errors, ${summary.validation_warnings} validation warnings`;

if (!promotionCheck.passed) {
  console.error(message);
  process.exitCode = 1;
} else {
  console.log(message);
}
