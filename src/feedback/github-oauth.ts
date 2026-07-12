import type { ViewerIdentity } from "./contracts.js";

export type GitHubFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export function buildGitHubAuthorizeUrl(clientId: string, state: string, callback: string): string {
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId); url.searchParams.set("state", state); url.searchParams.set("redirect_uri", callback);
  return url.toString();
}

export async function exchangeGitHubCode(input: { code: string; clientId: string; clientSecret: string; fetcher?: GitHubFetcher }): Promise<string> {
  const response = await (input.fetcher ?? fetch)("https://github.com/login/oauth/access_token", { method: "POST", headers: { accept: "application/json", "content-type": "application/json" }, body: JSON.stringify({ client_id: input.clientId, client_secret: input.clientSecret, code: input.code }) });
  if (!response.ok) throw new Error(`GitHub OAuth exchange failed (${response.status})`);
  const body = await response.json() as { access_token?: unknown };
  if (typeof body.access_token !== "string") throw new Error("GitHub OAuth exchange returned an invalid response");
  return body.access_token;
}

export async function fetchGitHubIdentity(token: string, fetcher: GitHubFetcher = fetch): Promise<ViewerIdentity> {
  const response = await fetcher("https://api.github.com/user", { headers: { accept: "application/vnd.github+json", authorization: `Bearer ${token}`, "user-agent": "Agent-Radar" } });
  if (!response.ok) throw new Error(`GitHub identity request failed (${response.status})`);
  const body = await response.json() as { id?: unknown; login?: unknown };
  if ((typeof body.id !== "number" && typeof body.id !== "string") || typeof body.login !== "string") throw new Error("GitHub identity response was invalid");
  return { github_user_id: String(body.id), github_login: body.login };
}

export function buildToolReturnPath(toolId: string): string {
  return /^[a-z0-9][a-z0-9._-]*$/i.test(toolId) ? `/tools/${encodeURIComponent(toolId)}` : "/tools";
}
