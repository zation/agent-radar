import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { verifyReviewSummaryChecksums, type ReviewSummaryV2 } from "../preview/review-summary.js";

const distDir = process.argv[2] ?? "dist-pages";
const summary = JSON.parse(
  await readFile(join(distDir, "data", "review_summary.v2.json"), "utf8"),
) as ReviewSummaryV2;
if (summary.schema_version !== "review_summary.v2") {
  throw new Error("review_summary_invalid_schema");
}
await verifyReviewSummaryChecksums(distDir, summary);
console.log(`Review Summary v2 checksums verified: ${Object.keys(summary.artifact_checksums).length} inputs`);
