import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { ToolCardPromotionCheck } from "../ingestion/promotion-check.js";

type PromotionCheckSummary = Omit<ToolCardPromotionCheck["summary"], "ready_for_publish"> & {
  ready_for_publish?: number;
  ready_for_manual_merge?: number;
};

type PromotionCheckForCli = Omit<ToolCardPromotionCheck, "summary"> & {
  summary: PromotionCheckSummary;
};

export function formatPromotionCheckMessage(promotionCheck: PromotionCheckForCli): string {
  const summary = promotionCheck.summary;
  const readyCount = summary.ready_for_publish ?? summary.ready_for_manual_merge ?? 0;
  return `promotion check ${promotionCheck.passed ? "passed" : "failed"}: ${readyCount} ready, ${summary.blocked} blocked, ${summary.validation_errors} validation errors, ${summary.validation_warnings} validation warnings`;
}

async function main(): Promise<void> {
  const promotionCheckPath = process.argv[2] ?? "dist-pages/data/promotion_candidates/promotion_check.json";
  const promotionCheck = JSON.parse(await readFile(promotionCheckPath, "utf8")) as PromotionCheckForCli;
  const message = formatPromotionCheckMessage(promotionCheck);

  if (!promotionCheck.passed) {
    console.error(message);
    process.exitCode = 1;
  } else {
    console.log(message);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
