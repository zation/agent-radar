import { CheckCircle2, ChevronDown, KeyRound, LoaderCircle, Search, TriangleAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { RecommendationResult } from "../schema.js";
import type { ToolViewModel } from "./data.js";
import { getRecommendationUiState } from "./recommendation-form.js";
import { createRankedToolRows, formatRecommendationApiError, getTaskReason, parseRecommendationApiResponse, type RecommendationApiErrorBody } from "./recommendation-view.js";
import { listUiRecommendationModelOptions } from "./provider-options.js";
import { ToolDetail } from "./tool-detail.js";
import { useMobileDrillIn } from "./mobile-drill-in.js";

type RiskTolerance = "low" | "medium" | "high";
const models = listUiRecommendationModelOptions();
const types = ["all", "skill", "mcp", "agent"];

export function ToolsWorkspace({ tools }: { tools: ToolViewModel[] }) {
  const [query, setQuery] = useState(""); const [apiKey, setApiKey] = useState(""); const [model, setModel] = useState(models[0]); const [risk, setRisk] = useState<RiskTolerance>("low");
  const [result, setResult] = useState<RecommendationResult | null>(null); const [error, setError] = useState(""); const [submitting, setSubmitting] = useState(false); const [manualExpanded, setManualExpanded] = useState(false);
  const [search, setSearch] = useState(""); const [type, setType] = useState("all"); const [selectedId, setSelectedId] = useState(tools[0]?.card.id ?? "");
  const mobile = useMobileDrillIn("tool");
  const uiState = getRecommendationUiState({ isSubmitting: submitting, result, error });
  const ranked = useMemo(() => result ? createRankedToolRows(result, tools) : [], [result, tools]);
  const rows = useMemo(() => {
    const base = ranked.length ? ranked.map((row) => ({ ...row, score: row.tool.rating.overall_score })) : tools.map((tool) => ({ tool, rank: undefined, recommendationLevel: tool.rating.recommendation_level, fitScore: undefined, taskReason: undefined, score: tool.rating.overall_score }));
    const needle = search.trim().toLowerCase();
    return base.filter((row) => (type === "all" || row.tool.card.type === type) && (!needle || [row.tool.card.name, row.tool.card.summary, row.tool.card.tags.join(" ")].join(" ").toLowerCase().includes(needle)));
  }, [ranked, search, tools, type]);
  const selected = rows.find((row) => row.tool.card.id === selectedId) ?? rows[0];
  const collapsed = uiState.shouldCollapse && !manualExpanded;

  async function runRecommendation() {
    if (!query.trim() || submitting) return;
    if (!apiKey.trim()) { setError("API key is required to run a recommendation."); return; }
    setSubmitting(true); setError(""); setManualExpanded(false);
    try {
      const response = await fetch("/api/recommend_tools", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ task: query.trim(), risk_tolerance: risk, top_k: 4, api_key: apiKey.trim(), model }) });
      const body = await parseRecommendationApiResponse(response);
      if (!response.ok) throw new Error(formatRecommendationApiError(body as RecommendationApiErrorBody));
      const next = body as RecommendationResult; setResult(next); setSelectedId(next.candidates[0]?.tool_id ?? tools[0]?.card.id ?? "");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Recommendation request failed."); } finally { setSubmitting(false); }
  }
  function clearTask() { setResult(null); setError(""); setQuery(""); setManualExpanded(false); setSelectedId(tools[0]?.card.id ?? ""); }

  return <section className="tools-page page-frame">
    <section className={`recommend-command ${collapsed ? "is-collapsed" : ""}`}>
      {collapsed ? <div className="recommend-summary"><CheckCircle2 /><span><strong>{query}</strong><small>{ranked.length} candidates ranked</small></span><button onClick={() => setManualExpanded(true)} type="button">Edit<ChevronDown /></button></div> : <><div className="recommend-heading"><span className="system-label">Ask Agent Radar</span><h1>What are you trying to build?</h1><p>Describe the task. Radar ranks verified tools and preserves safety boundaries.</p></div><div className="recommend-input-row"><textarea onChange={(event) => setQuery(event.target.value)} placeholder="Describe a development task" value={query} /><button disabled={submitting || !query.trim()} onClick={() => void runRecommendation()} type="button">{submitting ? <LoaderCircle className="spin" /> : null}{submitting ? "Analyzing" : "Run recommendation"}</button></div>{uiState.inlineMessage ? <p className={`recommend-inline-status is-${uiState.kind.replaceAll("_", "-")}`} role={uiState.kind === "error" ? "alert" : "status"}>{uiState.kind === "error" || uiState.kind === "ask_human" ? <TriangleAlert /> : <span>—</span>}{uiState.inlineMessage}</p> : null}<div className="recommend-controls"><label>Model<select onChange={(event) => setModel(event.target.value)} value={model}>{models.map((item) => <option key={item} value={item}>{item}</option>)}</select></label><label>Risk<select onChange={(event) => setRisk(event.target.value as RiskTolerance)} value={risk}><option>low</option><option>medium</option><option>high</option></select></label><label><KeyRound />API key<input onChange={(event) => setApiKey(event.target.value)} placeholder="Used for this request only" type="password" value={apiKey} /></label>{result ? <button className="clear-task" onClick={clearTask} type="button"><X />Clear task</button> : null}</div></>}
    </section>
    <div className="tools-heading"><div><h2>Verified tools</h2><p>{ranked.length ? `Ranked for your current task · ${ranked.length} candidates` : `${tools.length} reviewed records`}</p></div><div className="tools-filters"><label><Search /><input onChange={(event) => setSearch(event.target.value)} placeholder="Search name, tag, capability" value={search} /></label>{types.map((item) => <button className={type === item ? "is-active" : ""} key={item} onClick={() => setType(item)} type="button">{item}</button>)}</div></div>
    {selected ? <div className={`tools-workspace ${mobile.detailOpen ? "show-mobile-detail" : ""}`}><aside className="tool-index">{rows.map((row) => <button aria-current={row.tool.card.id === selected.tool.card.id ? "true" : undefined} className={row.tool.card.id === selected.tool.card.id ? "is-selected" : ""} key={row.tool.card.id} onClick={(event) => { setSelectedId(row.tool.card.id); mobile.openDetail(row.tool.card.id, event.currentTarget); }} type="button"><i className={`tool-type-dot is-${row.tool.card.type}`} /><span><strong>{row.tool.card.name}</strong><small>{row.tool.card.type} · {row.recommendationLevel}</small></span><em>{row.rank ? String(row.rank).padStart(2, "0") : row.score}</em></button>)}</aside><ToolDetail mobileOpen={mobile.detailOpen} onMobileBack={mobile.closeDetail} taskReason={result ? getTaskReason(selected.tool.card.id, result) : undefined} tool={selected.tool} /></div> : <p className="empty-state">No tools match the current filters.</p>}
  </section>;
}
