import { createArtifactRepositoryFromText } from "./api/artifact-repository.js";
import { createApiHandler } from "./api/handler.js";
import { createFeedbackHttpHandler } from "./feedback/http.js";
import { createD1FeedbackStore, type D1Database } from "./feedback/store.js";

interface AssetsBinding {
  fetch(request: Request): Promise<Response>;
}

interface Env {
  ASSETS: AssetsBinding;
  AGENT_RADAR_RELEASE_ID?: string;
  AGENT_RADAR_COMMIT_SHA?: string;
  AGENT_RADAR_API_VERSION?: string;
  AGENT_RADAR_WEB_VERSION?: string;
  AGENT_RADAR_LLM_API_KEY?: string;
  AGENT_RADAR_LLM_MODEL?: string;
  DB?: D1Database;
  GITHUB_OAUTH_CLIENT_ID?: string;
  GITHUB_OAUTH_CLIENT_SECRET?: string;
  AGENT_RADAR_SESSION_SECRET?: string;
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
    const feedbackResponse = await createFeedbackHttpHandler({
      repository,
      store: env.DB ? createD1FeedbackStore(env.DB) : undefined,
      clientId: env.GITHUB_OAUTH_CLIENT_ID,
      clientSecret: env.GITHUB_OAUTH_CLIENT_SECRET,
      sessionSecret: env.AGENT_RADAR_SESSION_SECRET
    })(request);
    if (feedbackResponse) return feedbackResponse;
    const handleRequest = createApiHandler(repository, {
      fallbackLlmApiKey: env.AGENT_RADAR_LLM_API_KEY,
      fallbackModel: env.AGENT_RADAR_LLM_MODEL,
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
