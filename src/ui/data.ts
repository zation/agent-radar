import type { RatingResult, RecommendationQuery, RecommendationResult, ToolCard } from "../schema.js";
import { recommendTools } from "../recommendation/engine.js";
import { buildSearchIndex } from "../search/index-builder.js";

export interface ToolViewModel {
  card: ToolCard;
  rating: RatingResult;
}

export interface UiArtifacts {
  tools: ToolViewModel[];
  evalSummary: {
    passed: number;
    total: number;
    results: Array<{ case_id: string; passed: boolean; recommended_action: string; top_tool_ids: string[] }>;
  };
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
  const [cardsText, ratingsText, evalSummary] = await Promise.all([
    fetch("/data/tool_cards.jsonl").then((response) => response.text()),
    fetch("/data/ratings.jsonl").then((response) => response.text()),
    fetch("/data/eval_summary.json").then((response) => response.json())
  ]);

  return {
    tools: createToolViewModels(parseJsonl<ToolCard>(cardsText), parseJsonl<RatingResult>(ratingsText)),
    evalSummary
  };
}

export function recommendFromViewModels(query: RecommendationQuery, tools: ToolViewModel[]): RecommendationResult {
  const cards = tools.map((tool) => tool.card);
  const ratings = tools.map((tool) => tool.rating);
  return recommendTools(query, cards, ratings, buildSearchIndex(cards, ratings));
}
