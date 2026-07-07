import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  CircleHelp,
  Database,
  Filter,
  Gauge,
  GitCompare,
  KeyRound,
  LoaderCircle,
  Search,
  ShieldAlert,
  Sparkles
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RecommendationResult } from "../schema.js";
import { loadUiArtifacts, recommendFromViewModels, type ToolViewModel, type UiArtifacts } from "./data.js";
import { createEvalPopoverRows } from "./eval-popover.js";
import { buildCollapsedRecommendationSummary, getRecommendationSubmitLabel } from "./recommendation-form.js";
import { buildRecommendationRunSummary } from "./recommendation-status.js";
import { createRecommendationItems, type RecommendationItem } from "./recommendation-view.js";
import "./styles.css";

const fallbackQuery = "在 Codex 中读取 Gmail 并总结待办";
const recommendationSubmitDelayMs = 350;

type Page = "tools" | "recommend";

const modelOptions = [
  "OpenAI GPT-4.1",
  "OpenAI GPT-4.1 mini",
  "Anthropic Claude Sonnet",
  "Google Gemini Pro"
];

export default function App() {
  const [artifacts, setArtifacts] = useState<UiArtifacts | null>(null);
  const [activePage, setActivePage] = useState<Page>("tools");
  const [selectedId, setSelectedId] = useState<string>("");
  const [selectedRecommendationToolId, setSelectedRecommendationToolId] = useState<string>("");
  const [query, setQuery] = useState(fallbackQuery);
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState(modelOptions[0]);
  const [riskTolerance, setRiskTolerance] = useState<"low" | "medium" | "high">("low");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recommendationRun, setRecommendationRun] = useState<{ count: number; query: string } | null>(null);
  const [isRecommendationSubmitting, setIsRecommendationSubmitting] = useState(false);
  const [isRecommendationInputCollapsed, setIsRecommendationInputCollapsed] = useState(false);

  useEffect(() => {
    void loadUiArtifacts().then((loaded) => {
      const initialRecommendation = recommendFromViewModels({ task: fallbackQuery, risk_tolerance: "low", top_k: 3 }, loaded.tools);
      setArtifacts(loaded);
      setSelectedId(loaded.tools[0]?.card.id ?? "");
      setRecommendation(initialRecommendation);
      setSelectedRecommendationToolId(initialRecommendation.candidates[0]?.tool_id ?? loaded.tools[0]?.card.id ?? "");
      setRecommendationRun({ count: 1, query: fallbackQuery });
    });
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0 });
  }, [activePage]);

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

  const recommendationItems = useMemo(() => {
    if (!recommendation || !artifacts) return [];
    return createRecommendationItems(recommendation, artifacts.tools);
  }, [artifacts, recommendation]);

  const selectedTool = filteredTools.find((tool) => tool.card.id === selectedId) ?? filteredTools[0] ?? artifacts?.tools[0];
  const selectedRecommendationTool =
    recommendationItems.find((item) => item.tool.card.id === selectedRecommendationToolId)?.tool ??
    recommendationItems[0]?.tool ??
    selectedTool;

  if (!artifacts || !selectedTool || !selectedRecommendationTool) {
    return (
      <main className="loading-shell">
        <Bot size={28} />
        <span>Loading Agent Radar data</span>
      </main>
    );
  }

  async function runRecommendation() {
    if (!artifacts || isRecommendationSubmitting || query.trim().length === 0) return;
    const submittedQuery = query.trim();
    setIsRecommendationSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, recommendationSubmitDelayMs));
      const nextRecommendation = recommendFromViewModels(
        {
          task: submittedQuery,
          risk_tolerance: riskTolerance,
          top_k: 4
        },
        artifacts.tools
      );
      setRecommendation(nextRecommendation);
      setSelectedRecommendationToolId(nextRecommendation.candidates[0]?.tool_id ?? selectedRecommendationTool.card.id);
      setRecommendationRun((current) => ({ count: (current?.count ?? 0) + 1, query: submittedQuery }));
      setIsRecommendationInputCollapsed(true);
    } finally {
      setIsRecommendationSubmitting(false);
    }
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Bot size={18} /></span>
          <strong>Agent Radar</strong>
        </div>
        <nav className="tabs" aria-label="Primary">
          {(["tools", "recommend"] as const).map((page) => (
            <button key={page} className={activePage === page ? "active" : ""} onClick={() => setActivePage(page)}>
              {page[0].toUpperCase() + page.slice(1)}
            </button>
          ))}
        </nav>
        <EvalStatusPopover summary={artifacts.evalSummary} />
      </header>

      {activePage === "tools" && (
        <section className="workspace tools-page">
          <ToolRail
            tools={filteredTools}
            allToolCount={artifacts.tools.length}
            selectedId={selectedTool.card.id}
            search={search}
            typeFilter={typeFilter}
            onSearchChange={setSearch}
            onTypeFilterChange={setTypeFilter}
            onSelectTool={setSelectedId}
          />
          <section className="detail-panel">
            <ToolDetail tool={selectedTool} />
            <CompareStrip tools={artifacts.tools.slice(0, 4)} />
          </section>
        </section>
      )}

      {activePage === "recommend" && (
        <section className="workspace recommend-page">
          <RecommendControlPanel
            query={query}
            apiKey={apiKey}
            modelName={modelName}
            riskTolerance={riskTolerance}
            recommendation={recommendation}
            recommendationRun={recommendationRun}
            recommendationItems={recommendationItems}
            selectedToolId={selectedRecommendationTool.card.id}
            isSubmitting={isRecommendationSubmitting}
            isInputCollapsed={isRecommendationInputCollapsed}
            onQueryChange={setQuery}
            onApiKeyChange={setApiKey}
            onModelNameChange={setModelName}
            onRiskToleranceChange={setRiskTolerance}
            onRunRecommendation={runRecommendation}
            onToggleInputCollapsed={setIsRecommendationInputCollapsed}
            onSelectRecommendation={setSelectedRecommendationToolId}
          />
          <section className="detail-panel">
            <ToolDetail tool={selectedRecommendationTool} />
          </section>
        </section>
      )}

    </main>
  );
}

function ToolRail({
  tools,
  allToolCount,
  selectedId,
  search,
  typeFilter,
  onSearchChange,
  onTypeFilterChange,
  onSelectTool
}: {
  tools: ToolViewModel[];
  allToolCount: number;
  selectedId: string;
  search: string;
  typeFilter: string;
  onSearchChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onSelectTool: (toolId: string) => void;
}) {
  return (
    <aside className="tool-rail" id="tools">
      <div className="rail-header">
        <div>
          <h1>Tool Cards</h1>
          <p>{allToolCount} reviewed MVP records</p>
        </div>
        <Filter size={18} />
      </div>
      <label className="search-box">
        <Search size={16} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Search tools, tags, risks" />
      </label>
      <div className="segmented" aria-label="Tool type filter">
        {["all", "skill", "mcp", "agent"].map((type) => (
          <button key={type} className={typeFilter === type ? "active" : ""} onClick={() => onTypeFilterChange(type)}>
            {type}
          </button>
        ))}
      </div>
      <div className="tool-list">
        {tools.map((tool) => (
          <button
            key={tool.card.id}
            className={`tool-row ${selectedId === tool.card.id ? "selected" : ""}`}
            onClick={() => onSelectTool(tool.card.id)}
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
  );
}

function RecommendControlPanel({
  query,
  apiKey,
  modelName,
  riskTolerance,
  recommendation,
  recommendationRun,
  recommendationItems,
  selectedToolId,
  isSubmitting,
  isInputCollapsed,
  onQueryChange,
  onApiKeyChange,
  onModelNameChange,
  onRiskToleranceChange,
  onRunRecommendation,
  onToggleInputCollapsed,
  onSelectRecommendation
}: {
  query: string;
  apiKey: string;
  modelName: string;
  riskTolerance: "low" | "medium" | "high";
  recommendation: RecommendationResult | null;
  recommendationRun: { count: number; query: string } | null;
  recommendationItems: RecommendationItem[];
  selectedToolId: string;
  isSubmitting: boolean;
  isInputCollapsed: boolean;
  onQueryChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
  onRiskToleranceChange: (value: "low" | "medium" | "high") => void;
  onRunRecommendation: () => void | Promise<void>;
  onToggleInputCollapsed: (value: boolean) => void;
  onSelectRecommendation: (toolId: string) => void;
}) {
  const collapsedSummary = buildCollapsedRecommendationSummary({ query, modelName, riskTolerance });

  return (
    <aside className="recommend-config-panel" id="recommend">
      <div className="panel-title">
        <Sparkles size={18} />
        <h1>Recommend</h1>
      </div>
      {isInputCollapsed ? (
        <button className="collapsed-recommendation-input" type="button" onClick={() => onToggleInputCollapsed(false)}>
          <span>Requirement</span>
          <strong>{collapsedSummary.title}</strong>
          <small>{collapsedSummary.meta}</small>
        </button>
      ) : (
        <section className="recommendation-form" aria-label="Recommendation input">
          <label className="field-stack">
            <span>Requirement</span>
            <textarea
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="Describe a development task to get tool recommendations"
            />
          </label>
          <label className="field-stack">
            <span>API key</span>
            <div className="input-with-icon">
              <KeyRound size={16} />
              <input
                value={apiKey}
                onChange={(event) => onApiKeyChange(event.target.value)}
                type="password"
                autoComplete="off"
                placeholder="Paste provider key"
              />
            </div>
          </label>
          <label className="field-stack">
            <span>Model</span>
            <select value={modelName} onChange={(event) => onModelNameChange(event.target.value)}>
              {modelOptions.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
          <div className="control-row">
            <span>Risk</span>
            <div className="segmented compact">
              {(["low", "medium", "high"] as const).map((risk) => (
                <button key={risk} className={riskTolerance === risk ? "active" : ""} onClick={() => onRiskToleranceChange(risk)}>
                  {risk}
                </button>
              ))}
            </div>
          </div>
          <button className="primary-action" onClick={() => void onRunRecommendation()} disabled={isSubmitting || query.trim().length === 0}>
            {isSubmitting ? <LoaderCircle className="button-spinner" size={16} /> : <Sparkles size={16} />}
            {getRecommendationSubmitLabel(isSubmitting)}
          </button>
        </section>
      )}
      {isInputCollapsed && (
        <button className="secondary-action" type="button" onClick={() => onToggleInputCollapsed(false)}>
          Edit input
        </button>
      )}
      {recommendation && recommendationRun && (
        <p className="run-summary" aria-live="polite">
          {buildRecommendationRunSummary({
            runCount: recommendationRun.count,
            action: recommendation.recommended_action,
            query: recommendationRun.query
          })}
        </p>
      )}
      {recommendation && (
        <RecommendationList
          result={recommendation}
          items={recommendationItems}
          selectedToolId={selectedToolId}
          onSelectRecommendation={onSelectRecommendation}
        />
      )}
    </aside>
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

function RecommendationList({
  result,
  items,
  selectedToolId,
  onSelectRecommendation
}: {
  result: RecommendationResult;
  items: RecommendationItem[];
  selectedToolId: string;
  onSelectRecommendation: (toolId: string) => void;
}) {
  const actionClass = result.recommended_action.replaceAll("_", "-");

  return (
    <section className="recommendation-output">
      <div className={`action-banner ${actionClass}`}>
        <AlertTriangle size={17} />
        <strong>{result.recommended_action}</strong>
      </div>
      {result.no_match_reason && <p className="no-match">{result.no_match_reason}</p>}
      <div className="recommendation-list">
        {items.map((item) => (
          <button
            className={`candidate-row ${selectedToolId === item.tool.card.id ? "selected" : ""}`}
            key={item.candidate.tool_id}
            onClick={() => onSelectRecommendation(item.tool.card.id)}
          >
            <span>{item.candidate.rank}</span>
            <strong>{item.candidate.name}</strong>
            <small>{item.candidate.recommendation_level} · {item.candidate.risk_level} · {item.candidate.fit_score}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function EvalStatusPopover({ summary }: { summary: UiArtifacts["evalSummary"] }) {
  const rows = createEvalPopoverRows(summary);

  return (
    <div className="eval-status">
      <button className="release-state" aria-describedby="eval-popover" type="button">
        <CheckCircle2 size={16} />
        <span>{summary.passed}/{summary.total} golden queries</span>
      </button>
      <section className="eval-popover" id="eval-popover" role="tooltip">
        <div className="eval-popover-header">
          <div>
            <strong>Quality Checks</strong>
            <small>Fixed release eval, not a live recommendation run</small>
          </div>
          <b>{summary.passed}/{summary.total}</b>
        </div>
        {rows.map((row) => (
          <div className="eval-row" key={row.id}>
            <span>{row.status === "passed" ? <CheckCircle2 size={15} /> : <CircleHelp size={15} />}</span>
            <strong>{row.label}</strong>
            <small>{row.action}</small>
          </div>
        ))}
      </section>
    </div>
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
