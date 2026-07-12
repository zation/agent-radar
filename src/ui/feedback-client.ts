import type { FeedbackSummary, Vote, ViewerIdentity } from "../feedback/contracts.js";

export interface SessionResponse { authenticated: boolean; user: ViewerIdentity | null }
export async function fetchSession(): Promise<SessionResponse> { return parse(await fetch("/api/auth/session")); }
export async function fetchFeedback(toolId: string): Promise<FeedbackSummary> { return parse(await fetch(feedbackPath(toolId))); }
export async function putFeedback(toolId: string, vote: Vote | null): Promise<FeedbackSummary> {
  return parse(await fetch(feedbackPath(toolId), { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ vote }) }));
}
export async function logout(): Promise<void> { await parse(await fetch("/api/auth/logout", { method: "POST", headers: { origin: window.location.origin } })); }
export function signInUrl(toolId?: string, vote?: Vote): string { const url = new URL("/api/auth/github", window.location.origin); if (toolId) url.searchParams.set("tool_id", toolId); if (vote) url.searchParams.set("vote", vote); return url.pathname + url.search; }
export function issueUrl(input: { toolId: string; vote: Vote; release: string; dataVersion: string }): string {
  const url = new URL("https://github.com/zation/agent-radar/issues/new"); url.searchParams.set("template", "tool-feedback.yml"); url.searchParams.set("tool_id", input.toolId); url.searchParams.set("vote", input.vote); url.searchParams.set("release", input.release); url.searchParams.set("data_version", input.dataVersion); url.searchParams.set("tool_url", window.location.href); return url.toString();
}
async function parse<T>(response: Response): Promise<T> { const body = await response.json() as T & { error?: string }; if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`); return body; }
function feedbackPath(toolId: string) { return `/api/tools/${encodeURIComponent(toolId)}/feedback`; }
