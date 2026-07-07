import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  Database,
  Filter,
  Gauge,
  GitCompare,
  Search,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RecommendationResult } from "../schema.js";
import { loadUiArtifacts, recommendFromViewModels, type ToolViewModel, type UiArtifacts } from "./data.js";
import { buildRecommendationRunSummary } from "./recommendation-status.js";
import "./styles.css";

const fallbackQuery = "在 Codex 中读取 Gmail 并总结待办";

export default function App() {
  const [artifacts, setArtifacts] = useState<UiArtifacts | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");
  const [query, setQuery] = useState(fallbackQuery);
  const [riskTolerance, setRiskTolerance] = useState<"low" | "medium" | "high">("low");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recommendationRun, setRecommendationRun] = useState<{ count: number; query: string } | null>(null);

  useEffect(() => {
    void loadUiArtifacts().then((loaded) => {
      setArtifacts(loaded);
      setSelectedId(loaded.tools[0]?.card.id ?? "");
      setRecommendation(recommendFromViewModels({ task: fallbackQuery, risk_tolerance: "low", top_k: 3 }, loaded.tools));
      setRecommendationRun({ count: 1, query: fallbackQuery });
    });
  }, []);

  const filteredTools = useMemo(() => {
    if (!artifacts) return [];
    const normalizedSearch = search.toLowerCase();
    return artifacts.tools.filter(({ card }) => {
      const matchesType = typeFilter === "all" || card.type === typeFilter;
      const matchesSearch =
        normalizedSearch.length === 0 ||
        [card.name, card.summary, card.tags.join(" "), card.primary_purpose].join(" ").toLowerCase().includes(normalizedSearch);
      return matchesType && matchesSearch;
    });
  }, [artifacts, search, typeFilter]);

  const selectedTool = filteredTools.find((tool) => tool.card.id === selectedId) ?? filteredTools[0] ?? artifacts?.tools[0];

  if (!artifacts || !selectedTool) {
    return (
      <main className="loading-shell">
        <Bot size={28} />
        <span>Loading Agent Radar data</span>
      </main>
    );
  }

  function runRecommendation() {
    if (!artifacts) return;
    const nextRecommendation = recommendFromViewModels(
      {
        task: query,
        risk_tolerance: riskTolerance,
        top_k: 4
      },
      artifacts.tools
    );
    setRecommendation(nextRecommendation);
    setRecommendationRun((current) => ({ count: (current?.count ?? 0) + 1, query }));
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Bot size={18} /></span>
          <strong>Agent Radar</strong>
        </div>
        <nav className="tabs" aria-label="Primary">
          <a href="#tools">Tools</a>
          <a href="#recommend">Recommend</a>
          <a href="#eval">Eval</a>
        </nav>
        <div className="release-state">
          <CheckCircle2 size={16} />
          <span>{artifacts.evalSummary.passed}/{artifacts.evalSummary.total} golden queries</span>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-rail" id="tools">
          <div className="rail-header">
            <div>
              <h1>Tool Cards</h1>
              <p>{artifacts.tools.length} reviewed MVP records</p>
            </div>
            <Filter size={18} />
          </div>
          <label className="search-box">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search tools, tags, risks" />
          </label>
          <div className="segmented" aria-label="Tool type filter">
            {["all", "skill", "mcp", "agent"].map((type) => (
              <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => setTypeFilter(type)}>
                {type}
              </button>
            ))}
          </div>
          <div className="tool-list">
            {filteredTools.map((tool) => (
              <button
                key={tool.card.id}
                className={`tool-row ${selectedTool.card.id === tool.card.id ? "selected" : ""}`}
                onClick={() => setSelectedId(tool.card.id)}
              >
                <span className={`type-dot ${tool.card.type}`} />
                <span>
                  <strong>{tool.card.name}</strong>
                  <small>{tool.card.type} · {tool.rating.recommendation_level}</small>
                </span>
                <b>{tool.rating.overall_score}</b>
              </button>
            ))}
          </div>
        </aside>

        <section className="detail-panel">
          <ToolDetail tool={selectedTool} />
          <CompareStrip tools={artifacts.tools.slice(0, 4)} />
        </section>

        <aside className="recommend-panel" id="recommend">
          <div className="panel-title">
            <Sparkles size={18} />
            <h2>Recommend</h2>
          </div>
          <textarea
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Describe a development task to get tool recommendations"
          />
          <div className="control-row">
            <span>Risk</span>
            <div className="segmented compact">
              {(["low", "medium", "high"] as const).map((risk) => (
                <button key={risk} className={riskTolerance === risk ? "active" : ""} onClick={() => setRiskTolerance(risk)}>
                  {risk}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-action" onClick={runRecommendation}>
            <Sparkles size={16} />
            Recommend tools
          </button>
          {recommendation && recommendationRun && (
            <p className="run-summary" aria-live="polite">
              {buildRecommendationRunSummary({
                runCount: recommendationRun.count,
                action: recommendation.recommended_action,
                query: recommendationRun.query
              })}
            </p>
          )}
          {recommendation && <RecommendationResultView result={recommendation} />}
          <EvalPanel summary={artifacts.evalSummary} />
        </aside>
      </section>
    </main>
  );
}

function ToolDetail({ tool }: { tool: ToolViewModel }) {
  return (
    <article className="tool-detail">
      <div className="detail-heading">
        <div>
          <span className="muted-label">{tool.card.type} / {tool.card.primary_purpose}</span>
          <h2>{tool.card.name}</h2>
          <p>{tool.card.summary}</p>
        </div>
        <ScoreBadge score={tool.rating.overall_score} risk={tool.rating.risk_level} />
      </div>
      <div className="tag-row">
        {tool.card.tags.map((tag) => <span key={tag}>{tag}</span>)}
      </div>
      <div className="detail-grid">
        <InfoBlock icon={<Gauge size={18} />} label="Rating" value={tool.rating.recommendation_level} detail={tool.rating.explanations[0]?.reason} />
        <InfoBlock icon={<ShieldAlert size={18} />} label="Risk" value={tool.rating.risk_level} detail={tool.card.security.security_notes} />
        <InfoBlock icon={<Database size={18} />} label="Evidence" value={tool.rating.evidence_quality} detail={tool.card.source_urls[0]} />
      </div>
      <section className="dimension-list">
        <h3>Rating Dimensions</h3>
        {Object.entries(tool.rating.dimension_scores).map(([dimension, score]) => (
          <div className="dimension-row" key={dimension}>
            <span>{dimension.replaceAll("_", " ")}</span>
            <div className="meter"><i style={{ width: `${score}%` }} /></div>
            <b>{score}</b>
          </div>
        ))}
      </section>
      <section className="split-lists">
        <div>
          <h3>Use Cases</h3>
          <ul>{tool.card.use_cases.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
        <div>
          <h3>Not For</h3>
          <ul>{tool.card.not_for.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      </section>
    </article>
  );
}

function RecommendationResultView({ result }: { result: RecommendationResult }) {
  const actionClass = result.recommended_action.replaceAll("_", "-");

  return (
    <section className="recommendation-output">
      <div className={`action-banner ${actionClass}`}>
        <AlertTriangle size={17} />
        <strong>{result.recommended_action}</strong>
      </div>
      {result.no_match_reason && <p className="no-match">{result.no_match_reason}</p>}
      {result.candidates.map((candidate) => (
        <article className="candidate" key={candidate.tool_id}>
          <div>
            <strong>{candidate.rank}. {candidate.name}</strong>
            <small>{candidate.recommendation_level} · {candidate.risk_level} · {candidate.fit_score}</small>
          </div>
          <p>{candidate.why[0]}</p>
        </article>
      ))}
    </section>
  );
}

function EvalPanel({ summary }: { summary: UiArtifacts["evalSummary"] }) {
  return (
    <section className="eval-panel" id="eval">
      <div className="panel-title">
        <CheckCircle2 size={18} />
        <h2>Eval</h2>
      </div>
      {summary.results.map((result) => (
        <div className="eval-row" key={result.case_id}>
          <span>{result.passed ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}</span>
          <strong>{result.case_id.replace("gq-", "")}</strong>
          <small>{result.recommended_action}</small>
        </div>
      ))}
    </section>
  );
}

function CompareStrip({ tools }: { tools: ToolViewModel[] }) {
  return (
    <section className="compare-strip" id="compare">
      <div className="panel-title">
        <GitCompare size={18} />
        <h2>Compare</h2>
      </div>
      <div className="compare-table">
        {tools.map((tool) => (
          <div className="compare-row" key={tool.card.id}>
            <strong>{tool.card.name}</strong>
            <span>{tool.card.type}</span>
            <span>{tool.rating.risk_level}</span>
            <b>{tool.rating.overall_score}</b>
          </div>
        ))}
      </div>
    </section>
  );
}

function InfoBlock({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <div className="info-block">
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <p>{detail}</p>
    </div>
  );
}

function ScoreBadge({ score, risk }: { score: number; risk: string }) {
  return (
    <div className={`score-badge ${risk}`}>
      <strong>{score}</strong>
      <span>{risk}</span>
    </div>
  );
}
