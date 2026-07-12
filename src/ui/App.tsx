import { AlertTriangle, Bot } from "lucide-react";
import { useEffect, useState } from "react";
import { AppShell, type Page } from "./app-shell.js";
import { loadUiArtifacts, type UiArtifacts } from "./data.js";
import { EvaluationPage } from "./evaluation-page.js";
import { ToolsWorkspace } from "./tools-workspace.js";
import "./styles.css";
import { FeedbackProvider } from "./feedback-provider.js";

export default function App() {
  const [artifacts, setArtifacts] = useState<UiArtifacts | null>(null);
  const [activePage, setActivePage] = useState<Page>("tools");
  const [loadError, setLoadError] = useState("");
  useEffect(() => { void loadUiArtifacts().then(setArtifacts).catch((error: unknown) => setLoadError(error instanceof Error ? error.message : "Failed to load Agent Radar data.")); }, []);
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }); }, [activePage]);
  if (!artifacts) return <main className="loading-screen">{loadError ? <div><AlertTriangle /><strong>Agent Radar data is not available</strong><p>{loadError}</p></div> : <div><Bot className="spin" />Loading Agent Radar data</div>}</main>;
  return <FeedbackProvider><AppShell activePage={activePage} onPageChange={setActivePage} releaseId={artifacts.evalSummary.release.release_id}>
    {activePage === "tools" ? <ToolsWorkspace tools={artifacts.tools} /> : <EvaluationPage cases={artifacts.goldenQueries} summary={artifacts.evalSummary} />}
  </AppShell></FeedbackProvider>;
}
