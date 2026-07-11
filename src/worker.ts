import { createArtifactRepositoryFromText } from "./api/artifact-repository.js";
import { createApiHandler } from "./api/handler.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetsBinding;
  AGENT_RADAR_RELEASE_ID?: string;
  AGENT_RADAR_COMMIT_SHA?: string;
  AGENT_RADAR_API_VERSION?: string;
  AGENT_RADAR_WEB_VERSION?: string;
}

interface DataManifest {
  data_version?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }

    const manifest = JSON.parse(await fetchAsset(env, request, "/data/manifest.json")) as DataManifest;
    const repository = createArtifactRepositoryFromText({
      toolCardsJsonl: await fetchAsset(env, request, "/data/tool_cards.jsonl"),
      ratingsJsonl: await fetchAsset(env, request, "/data/ratings.jsonl"),
      searchIndexJson: await fetchAsset(env, request, "/data/search_index.json")
    });
    const handleRequest = createApiHandler(repository, {
      versionInfo: {
        release_id: env.AGENT_RADAR_RELEASE_ID ?? "unknown",
        commit_sha: env.AGENT_RADAR_COMMIT_SHA ?? "unknown",
        data_version: manifest.data_version ?? "unknown",
        api_version: env.AGENT_RADAR_API_VERSION ?? "unknown",
        web_version: env.AGENT_RADAR_WEB_VERSION ?? "unknown"
      }
    });
    return handleRequest(request);
  }
};

async function fetchAsset(env: Env, request: Request, path: string): Promise<string> {
  const url = new URL(path, request.url);
  const response = await env.ASSETS.fetch(new Request(url, { method: "GET" }));
  if (!response.ok) throw new Error(`Artifact not found: ${path}`);
  return response.text();
}
