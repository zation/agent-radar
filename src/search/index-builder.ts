import type { RatingResult, SearchIndex, ToolCard } from "../schema.js";

export function buildSearchIndex(cards: ToolCard[], ratings: RatingResult[]): SearchIndex {
  const ratingsByTool = new Map(ratings.map((rating) => [rating.tool_id, rating]));
  return {
    schema_version: "search_index.v1",
    built_at: "2026-07-06T00:00:00Z",
    documents: cards.map((card) => {
      const rating = ratingsByTool.get(card.id);
      return {
        tool_id: card.id,
        text: [
          card.name,
          card.summary,
          card.primary_purpose,
          card.use_cases.join(" "),
          card.not_for.join(" "),
          card.tags.join(" "),
          card.supported_agents?.join(" ") ?? ""
        ]
          .join(" ")
          .toLowerCase(),
        tags: card.tags,
        type: card.type,
        rating_overall: rating?.overall_score ?? 0,
        risk_level: rating?.risk_level ?? "unknown",
        confidence: card.confidence
      };
    })
  };
}
