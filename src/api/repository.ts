import type { RatingResult, SearchIndex, ToolCard } from "../schema.js";

export interface ToolRepository {
  listToolCards(): ToolCard[];
  listRatings(): RatingResult[];
  getToolCard(toolId: string): ToolCard | undefined;
  getRating(toolId: string): RatingResult | undefined;
  getSearchIndex(): SearchIndex;
}

export interface StaticRepositoryInput {
  cards: ToolCard[];
  ratings: RatingResult[];
  index: SearchIndex;
}

export function createStaticRepository(input: StaticRepositoryInput): ToolRepository {
  const cardsById = new Map(input.cards.map((card) => [card.id, card]));
  const ratingsByToolId = new Map(input.ratings.map((rating) => [rating.tool_id, rating]));
  return {
    listToolCards: () => input.cards,
    listRatings: () => input.ratings,
    getToolCard: (toolId) => cardsById.get(toolId),
    getRating: (toolId) => ratingsByToolId.get(toolId),
    getSearchIndex: () => input.index
  };
}
