import type { ToolRepository } from "../api/repository.js";
import { clearOAuthStateCookie, clearSessionCookie, issueOAuthStateCookie, issueSessionCookie, readOAuthStateCookie, readSessionCookie } from "./cookies.js";
import type { FeedbackStore, Vote } from "./contracts.js";
import { FeedbackRateLimitError } from "./store.js";
import { buildGitHubAuthorizeUrl, buildToolReturnPath, exchangeGitHubCode, fetchGitHubIdentity, type GitHubFetcher } from "./github-oauth.js";

export interface FeedbackHttpOptions {
  store?: FeedbackStore;
  repository: ToolRepository;
  clientId?: string;
  clientSecret?: string;
  sessionSecret?: string;
  fetcher?: GitHubFetcher;
}

export function createFeedbackHttpHandler(options: FeedbackHttpOptions) {
  return async (request: Request): Promise<Response | null> => {
    const url = new URL(request.url);
    if (url.pathname === "/api/auth/session" && request.method === "GET") {
      const identity = await session(request, options.sessionSecret);
      return json({ authenticated: Boolean(identity), user: identity });
    }
    if (url.pathname === "/api/auth/github" && request.method === "GET") {
      if (!configured(options)) return unavailable();
      const toolId = url.searchParams.get("tool_id") ?? "";
      const vote = parseVote(url.searchParams.get("vote"));
      if (toolId && (!vote || !options.repository.getToolCard(toolId))) return json({ error: "Invalid feedback intent" }, 400);
      const nonce = crypto.randomUUID();
      const callback = `${url.origin}/api/auth/github/callback`;
      const stateCookie = await issueOAuthStateCookie({ nonce, return_path: toolId ? buildToolReturnPath(toolId) : "/", ...(toolId && vote ? { tool_id: toolId, vote } : {}) }, options.sessionSecret!);
      return new Response(null, { status: 302, headers: { location: buildGitHubAuthorizeUrl(options.clientId!, nonce, callback), "set-cookie": stateCookie, "cache-control": "no-store" } });
    }
    if (url.pathname === "/api/auth/github/callback" && request.method === "GET") {
      if (!configured(options)) return unavailable();
      const nonce = url.searchParams.get("state") ?? "";
      const state = await readOAuthStateCookie(request.headers.get("cookie"), options.sessionSecret!, nonce);
      const code = url.searchParams.get("code");
      if (!state || !code) return json({ error: "Invalid or expired OAuth state" }, 400);
      try {
        const token = await exchangeGitHubCode({ code, clientId: options.clientId!, clientSecret: options.clientSecret!, fetcher: options.fetcher });
        const identity = await fetchGitHubIdentity(token, options.fetcher);
        if (state.tool_id && state.vote && options.store) await options.store.mutateVote({ user: identity, toolId: state.tool_id, vote: state.vote });
        const redirect = new URL(state.return_path, url.origin); redirect.searchParams.set("feedback", "applied");
        const headers = new Headers({ location: redirect.pathname + redirect.search, "cache-control": "no-store" });
        headers.append("set-cookie", await issueSessionCookie(identity, options.sessionSecret!)); headers.append("set-cookie", clearOAuthStateCookie());
        return new Response(null, { status: 302, headers });
      } catch { return json({ error: "GitHub sign-in failed" }, 502); }
    }
    if (url.pathname === "/api/auth/logout" && request.method === "POST") {
      if (!sameOrigin(request, url)) return json({ error: "Origin is not allowed" }, 403);
      return json({ authenticated: false }, 200, { "set-cookie": clearSessionCookie() });
    }
    const match = url.pathname.match(/^\/api\/tools\/([^/]+)\/feedback$/);
    if (!match) return null;
    const toolId = decodeURIComponent(match[1]);
    if (!options.repository.getToolCard(toolId)) return json({ error: "Tool not found" }, 404);
    if (!options.store) return unavailable();
    const identity = await session(request, options.sessionSecret);
    if (request.method === "GET") return json(await options.store.getSummary(toolId, identity?.github_user_id));
    if (request.method !== "PUT") return json({ error: "Method not allowed" }, 405);
    if (!identity) return json({ error: "Authentication required" }, 401);
    if (!sameOrigin(request, url)) return json({ error: "Origin is not allowed" }, 403);
    if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return json({ error: "Expected application/json" }, 415);
    try {
      const body = await request.json() as { vote?: unknown };
      if (body.vote !== null && body.vote !== "up" && body.vote !== "down") return json({ error: "Invalid vote" }, 400);
      return json(await options.store.mutateVote({ user: identity, toolId, vote: body.vote }));
    } catch (error) {
      if (error instanceof FeedbackRateLimitError) return json({ error: error.message }, 429);
      if (error instanceof SyntaxError) return json({ error: "Invalid JSON" }, 400);
      return json({ error: "Feedback is temporarily unavailable" }, 503);
    }
  };
}

async function session(request: Request, secret?: string) { return secret ? readSessionCookie(request.headers.get("cookie"), secret) : null; }
function configured(options: FeedbackHttpOptions): boolean { return Boolean(options.clientId && options.clientSecret && options.sessionSecret); }
function parseVote(value: string | null): Vote | null { return value === "up" || value === "down" ? value : null; }
function sameOrigin(request: Request, url: URL): boolean { return request.headers.get("origin") === url.origin; }
function unavailable() { return json({ error: "Feedback is not configured" }, 503); }
function json(body: unknown, status = 200, headers?: HeadersInit) { return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } }); }
