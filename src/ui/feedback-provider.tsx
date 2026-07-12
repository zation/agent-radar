import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { FeedbackSummary, Vote, ViewerIdentity } from "../feedback/contracts.js";
import { fetchFeedback, fetchSession, logout as requestLogout, putFeedback, signInUrl } from "./feedback-client.js";
import { optimisticVote } from "./feedback-state.js";

interface FeedbackContextValue {
  user: ViewerIdentity | null; version: { release_id: string; data_version: string }; summaries: Record<string, FeedbackSummary>; errors: Record<string, string>; load(toolId: string): void;
  vote(toolId: string, vote: Vote): Promise<{ changed: boolean }>; signIn(toolId?: string, vote?: Vote): void; signOut(): Promise<void>;
}
const Context = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<ViewerIdentity | null>(null); const [summaries, setSummaries] = useState<Record<string, FeedbackSummary>>({}); const [errors, setErrors] = useState<Record<string, string>>({});
  const [version, setVersion] = useState({ release_id: "unknown", data_version: "unknown" });
  useEffect(() => { void Promise.all([fetchSession(), fetch("/api/version").then((response) => response.json() as Promise<{ release_id: string; data_version: string }>)]).then(([session, nextVersion]) => { setUser(session.user); setVersion(nextVersion); }).catch(() => undefined); }, []);
  const load = useCallback((toolId: string) => { if (summaries[toolId]) return; void fetchFeedback(toolId).then((value) => setSummaries((current) => ({ ...current, [toolId]: value }))).catch(() => setErrors((current) => ({ ...current, [toolId]: "Feedback is unavailable." }))); }, [summaries]);
  const value = useMemo<FeedbackContextValue>(() => ({ user, version, summaries, errors, load,
    async vote(toolId, next) {
      if (!user) { window.location.assign(signInUrl(toolId, next)); return { changed: false }; }
      const before = summaries[toolId] ?? { tool_id: toolId, up: 0, down: 0, viewer_vote: null };
      const target = before.viewer_vote === next ? null : next; setErrors((current) => ({ ...current, [toolId]: "" })); setSummaries((current) => ({ ...current, [toolId]: optimisticVote(before, target) }));
      try { const result = await putFeedback(toolId, target); setSummaries((current) => ({ ...current, [toolId]: result })); return { changed: target !== null }; }
      catch (error) { setSummaries((current) => ({ ...current, [toolId]: before })); setErrors((current) => ({ ...current, [toolId]: error instanceof Error ? error.message : "Feedback failed." })); return { changed: false }; }
    },
    signIn(toolId, vote) { window.location.assign(signInUrl(toolId, vote)); },
    async signOut() { await requestLogout(); setUser(null); setSummaries((current) => Object.fromEntries(Object.entries(current).map(([id, summary]) => [id, { ...summary, viewer_vote: null }]))); }
  }), [errors, load, summaries, user, version]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useFeedback() { const value = useContext(Context); if (!value) throw new Error("useFeedback must be used inside FeedbackProvider"); return value; }
