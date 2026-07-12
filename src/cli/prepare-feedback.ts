import { readFile, rename, writeFile } from "node:fs/promises";
import { config } from "dotenv";
import type { ToolCard } from "../schema.js";
import { classifyFeedbackIssues } from "../feedback-processing/classifier.js";
import { parseD1AggregateSnapshot } from "../feedback-processing/d1-snapshot.js";
import { createGitHubIssueReader } from "../feedback-processing/github-issues.js";
import { prepareFeedbackBuildInput } from "../feedback-processing/preparer.js";

config({ override: false, quiet: true });
const args = parseArgs(process.argv.slice(2));
const [d1Text, cardsText] = await Promise.all([readFile(args.d1QueryJson, "utf8"), readFile(args.toolCards, "utf8")]);
const cards = parseToolCards(cardsText);
const reader = createGitHubIssueReader({ token: requiredEnv("GITHUB_TOKEN") });
const [newIssues, historicalIssues] = await Promise.all([reader.listNewIssues(), reader.listHistoricalAcceptedIssues()]);
const generatedAt = new Date().toISOString();
const prepared = await prepareFeedbackBuildInput({
  voteRows: parseD1AggregateSnapshot(JSON.parse(d1Text) as unknown),
  cards,
  newIssues,
  historicalIssues,
  classify: (inputs) => classifyFeedbackIssues(inputs, {
    apiKey: requiredEnv("AGENT_RADAR_LLM_API_KEY"),
    model: requiredEnv("AGENT_RADAR_LLM_MODEL"),
    baseUrl: process.env.AGENT_RADAR_LLM_BASE_URL,
  }),
  generatedAt,
  releaseTag: requiredEnv("AGENT_RADAR_RELEASE_TAG"),
});
const temporary = `${args.output}.tmp`;
await writeFile(temporary, `${JSON.stringify(prepared, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, args.output);
console.log(JSON.stringify({ schema_version: prepared.schema_version, new_issues: newIssues.length, historical_issues: historicalIssues.length }));

function parseArgs(values: string[]): { d1QueryJson: string; toolCards: string; output: string } {
  const read = (name: string) => {
    const index = values.indexOf(name);
    if (index < 0 || !values[index + 1]) throw new Error(`missing_argument: ${name}`);
    return values[index + 1];
  };
  return { d1QueryJson: read("--d1-query-json"), toolCards: read("--tool-cards"), output: read("--output") };
}

function parseToolCards(text: string): ToolCard[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[")) return JSON.parse(trimmed) as ToolCard[];
  return trimmed.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as ToolCard);
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`missing_environment: ${name}`);
  return value;
}
