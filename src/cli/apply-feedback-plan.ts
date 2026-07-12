import { readFile } from "node:fs/promises";
import type { FeedbackProcessingPlan } from "../feedback-processing/artifacts.js";
import { applyFeedbackProcessingPlan } from "../feedback-processing/github-writeback.js";

const path = readArgument(process.argv.slice(2), "--plan");
const plan = JSON.parse(await readFile(path, "utf8")) as FeedbackProcessingPlan;
await applyFeedbackProcessingPlan(plan, { token: requiredEnv("GITHUB_TOKEN") });
console.log(JSON.stringify({ schema_version: plan.schema_version, applied_actions: plan.actions.length }));

function readArgument(values: string[], name: string): string {
  const index = values.indexOf(name);
  if (index < 0 || !values[index + 1]) throw new Error(`missing_argument: ${name}`);
  return values[index + 1];
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_environment: ${name}`);
  return value;
}
