import type { RatingResult, ToolCard } from "../schema.js";
import type { SourceRegistryReviewRequests } from "../ingestion/source-review.js";

export interface ToolViewModel {
  card: ToolCard;
  rating: RatingResult;
}

export interface UiArtifacts {
  tools: ToolViewModel[];
  evalSummary: {
    passed: number;
    total: number;
    results: Array<{ case_id: string; passed: boolean; failure_category?: string; recommended_action: string; top_tool_ids: string[] }>;
  };
  sourceReviewRequests: SourceRegistryReviewRequests;
}

export function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

export function createToolViewModels(cards: ToolCard[], ratings: RatingResult[]): ToolViewModel[] {
  const ratingByTool = new Map(ratings.map((rating) => [rating.tool_id, rating]));
  return cards
    .map((card) => {
      const rating = ratingByTool.get(card.id);
      if (!rating) throw new Error(`Missing rating for ${card.id}`);
      return { card, rating };
    })
    .sort((a, b) => b.rating.overall_score - a.rating.overall_score || a.card.name.localeCompare(b.card.name));
}

export async function loadUiArtifacts(): Promise<UiArtifacts> {
  const [cards, ratings, evalSummary, sourceReviewRequests] = await Promise.all([
    fetchArtifactJsonl<ToolCard>("/data/tool_cards.jsonl"),
    fetchArtifactJsonl<RatingResult>("/data/ratings.jsonl"),
    fetchArtifactJson<UiArtifacts["evalSummary"]>("/data/eval_summary.json"),
    fetchArtifactJson<SourceRegistryReviewRequests>("/data/source_registry_review_requests.json")
  ]);

  return {
    tools: createToolViewModels(cards, ratings),
    evalSummary,
    sourceReviewRequests
  };
}

async function fetchArtifactJsonl<T>(path: string): Promise<T[]> {
  const response = await fetch(path);
  ensureArtifactResponse(path, response);
  const text = await response.text();
  try {
    return parseJsonl<T>(text);
  } catch {
    throw artifactParseError(path);
  }
}

async function fetchArtifactJson<T>(path: string): Promise<T> {
  const response = await fetch(path);
  ensureArtifactResponse(path, response);
  try {
    return JSON.parse(await response.text()) as T;
  } catch {
    throw artifactParseError(path);
  }
}

function ensureArtifactResponse(path: string, response: Response): void {
  if (response.ok && !isHtmlResponse(response)) return;
  if (response.ok) {
    throw new Error(`UI data artifact ${path} is unavailable. Run npm run dev:data, then refresh the page.`);
  }
  const status = response.status === 0 ? "network error" : `HTTP ${response.status}`;
  throw new Error(`Missing UI artifact ${path} (${status}). Run npm run dev:data, then refresh the page.`);
}

function isHtmlResponse(response: Response): boolean {
  return (response.headers.get("content-type") ?? "").toLowerCase().includes("text/html");
}

function artifactParseError(path: string): Error {
  return new Error(`UI data artifact ${path} could not be parsed. Run npm run dev:data, then refresh the page.`);
}
