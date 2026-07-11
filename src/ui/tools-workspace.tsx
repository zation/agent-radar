import { CheckCircle2, ChevronDown, KeyRound, LoaderCircle, Search, TriangleAlert, X } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { RecommendationResult } from "../schema.js";
import type { ToolViewModel } from "./data.js";
import { getRecommendationUiState } from "./recommendation-form.js";
import { createRankedToolRows, formatRecommendationApiError, getTaskReason, parseRecommendationApiResponse, type RecommendationApiErrorBody } from "./recommendation-view.js";
import { listUiRecommendationModelOptions } from "./provider-options.js";
import { ToolDetail } from "./tool-detail.js";
import { ToolRow } from "./tool-row.js";
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

  return <section className="mx-auto max-w-[1480px] px-5 py-6 md:px-8 md:py-8">
    <section className="rounded-xl bg-[#12382f] p-5 text-[#eff9f5] shadow-lg md:p-6">
      {collapsed ? <div className="grid grid-cols-[auto_1fr_auto] items-center gap-4"><CheckCircle2 className="size-6 text-emerald-300" /><span className="min-w-0"><strong className="block truncate text-base">{query}</strong><small className="mt-1 block text-sm text-emerald-100/70">{ranked.length} candidates ranked</small></span><Button className="text-emerald-50 hover:bg-white/10" onClick={() => setManualExpanded(true)} variant="ghost">Edit<ChevronDown /></Button></div> : <><div><span className="font-mono text-xs font-semibold tracking-[.13em] text-emerald-300 uppercase">Ask Agent Radar</span><h1 className="mt-2 text-2xl font-semibold tracking-tight md:text-3xl">What are you trying to build?</h1><p className="mt-1 text-base text-emerald-100/70">Describe the task. Radar ranks verified tools and preserves safety boundaries.</p></div><div className="mt-5 grid gap-3 md:grid-cols-[1fr_210px]"><Textarea className="min-h-20 border-emerald-700 bg-emerald-950/25 text-base text-white placeholder:text-emerald-100/45 focus-visible:border-emerald-300 focus-visible:ring-emerald-300/25" onChange={(event) => setQuery(event.target.value)} placeholder="Describe a development task" value={query} /><Button className="h-full min-h-12 bg-emerald-300 text-base font-semibold text-emerald-950 hover:bg-emerald-200" disabled={submitting || !query.trim()} onClick={() => void runRecommendation()}>{submitting ? <LoaderCircle className="animate-spin" /> : null}{submitting ? "Analyzing" : "Run recommendation"}</Button></div>{uiState.inlineMessage ? <p className={`mt-3 flex items-start gap-2 border-t border-emerald-700/70 pt-3 text-sm ${uiState.kind === "error" ? "text-red-300" : uiState.kind === "ask_human" ? "text-amber-300" : "text-emerald-100/70"}`} role={uiState.kind === "error" ? "alert" : "status"}>{uiState.kind === "error" || uiState.kind === "ask_human" ? <TriangleAlert className="size-4 shrink-0" /> : <span>—</span>}{uiState.inlineMessage}</p> : null}<div className="mt-4 flex flex-wrap items-end gap-3"><Control label="Model"><Select onValueChange={(value) => value && setModel(value)} value={model}><SelectTrigger className="w-52 border-emerald-700 bg-emerald-950/25 text-emerald-50"><SelectValue /></SelectTrigger><SelectContent>{models.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Control><Control label="Risk"><Select onValueChange={(value) => value && setRisk(value)} value={risk}><SelectTrigger className="w-32 border-emerald-700 bg-emerald-950/25 text-emerald-50"><SelectValue /></SelectTrigger><SelectContent>{(["low", "medium", "high"] as const).map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent></Select></Control><Control label="API key" icon={<KeyRound className="size-4" />}><Input className="w-64 border-emerald-700 bg-emerald-950/25 text-emerald-50 placeholder:text-emerald-100/40" onChange={(event) => setApiKey(event.target.value)} placeholder="Used for this request only" type="password" value={apiKey} /></Control>{result ? <Button className="ml-auto text-emerald-100 hover:bg-white/10" onClick={clearTask} variant="ghost"><X />Clear task</Button> : null}</div></>}
    </section>
    <div className="mt-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between"><div><h2 className="text-2xl font-semibold tracking-tight">Verified tools</h2><p className="mt-1 text-base text-muted-foreground">{ranked.length ? `Ranked for your current task · ${ranked.length} candidates` : `${tools.length} reviewed records`}</p></div><div className="flex flex-col gap-3 sm:flex-row"><label className="relative block"><Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" /><Input className="h-10 w-full pl-9 text-base sm:w-72" onChange={(event) => setSearch(event.target.value)} placeholder="Search name, tag, capability" value={search} /></label><ToggleGroup onValueChange={(value) => value[0] && setType(value[0])} value={[type]} variant="outline">{types.map((item) => <ToggleGroupItem aria-label={`Filter by ${item}`} className="h-10 px-4 text-sm capitalize" key={item} value={item}>{item}</ToggleGroupItem>)}</ToggleGroup></div></div>
    {selected ? <div className={`mt-5 grid gap-5 lg:grid-cols-[340px_minmax(0,1fr)] ${mobile.detailOpen ? "[&_.tool-index]:hidden lg:[&_.tool-index]:block" : "[&_.tool-detail-mobile]:hidden"}`}><aside className="tool-index grid content-start gap-1 rounded-xl border border-border bg-card p-2 shadow-sm">{rows.map((row) => <ToolRow active={row.tool.card.id === selected.tool.card.id} key={row.tool.card.id} onSelect={(trigger) => { setSelectedId(row.tool.card.id); mobile.openDetail(row.tool.card.id, trigger); }} rank={row.rank} recommendationLevel={row.recommendationLevel} score={row.score} tool={row.tool} />)}</aside><div className={mobile.detailOpen ? "tool-detail-mobile block" : "hidden lg:block"}><ToolDetail mobileOpen={mobile.detailOpen} onMobileBack={mobile.closeDetail} taskReason={result ? getTaskReason(selected.tool.card.id, result) : undefined} tool={selected.tool} /></div></div> : <p className="mt-5 rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">No tools match the current filters.</p>}
  </section>;
}

function Control({ label, icon, children }: { label: string; icon?: ReactNode; children: ReactNode }) {
  return <label className="grid gap-1.5 text-sm text-emerald-100/70"><span className="flex items-center gap-1.5">{icon}{label}</span>{children}</label>;
}
