import type { RatingResult, SearchIndex, ToolCard } from "../schema.js";
import { createStaticRepository, type ToolRepository } from "./repository.js";

export interface ArtifactRepositoryText {
  toolCardsJsonl: string;
  ratingsJsonl: string;
  searchIndexJson: string;
}

export function createArtifactRepositoryFromText(input: ArtifactRepositoryText): ToolRepository {
  return createStaticRepository({
    cards: parseJsonl<ToolCard>(input.toolCardsJsonl),
    ratings: parseJsonl<RatingResult>(input.ratingsJsonl),
    index: JSON.parse(input.searchIndexJson) as SearchIndex
  });
}

function parseJsonl<T>(text: string): T[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}
