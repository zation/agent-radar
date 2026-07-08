import { createArtifactRepositoryFromText } from "./api/artifact-repository.js";
import { createApiHandler } from "./api/handler.js";

export default {
  async fetch(request: Request): Promise<Response> {
    const repository = createArtifactRepositoryFromText({
      toolCardsJsonl: await fetchArtifact(request, "/data/tool_cards.jsonl"),
      ratingsJsonl: await fetchArtifact(request, "/data/ratings.jsonl"),
      searchIndexJson: await fetchArtifact(request, "/data/search_index.json")
    });
    const handleRequest = createApiHandler(repository);
    return handleRequest(request);
  }
};

async function fetchArtifact(request: Request, path: string): Promise<string> {
  const url = new URL(path, request.url);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Artifact not found: ${path}`);
  return response.text();
}
