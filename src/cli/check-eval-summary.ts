import { readFile } from "node:fs/promises";
import { validateEvalSummaryForRelease } from "../eval/check-summary.js";
import type { EvalSummary } from "../eval/runner.js";

const summaryPath = process.argv[2] ?? "public/data/eval_summary.json";
const summary = JSON.parse(await readFile(summaryPath, "utf8")) as EvalSummary;

validateEvalSummaryForRelease(summary);
console.log(`release eval passed: ${summary.passed}/${summary.total}`);
