import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
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
import { loadUiArtifacts, type ToolViewModel, type UiArtifacts } from "./data.js";
import { createEvalPopoverRows } from "./eval-popover.js";
import { buildCompareColumns } from "./compare-view.js";
import { buildCollapsedRecommendationSummary, getRecommendationSubmitLabel } from "./recommendation-form.js";
import { buildRecommendationRunSummary } from "./recommendation-status.js";
import { createRecommendationItems, formatRecommendationApiError, type RecommendationApiErrorBody, type RecommendationItem } from "./recommendation-view.js";
import { listUiRecommendationModelOptions } from "./provider-options.js";
import "./styles.css";

const fallbackQuery = "在 Codex 中读取 Gmail 并总结待办";

type Page = "tools" | "recommend" | "compare";
type RiskTolerance = "low" | "medium" | "high";

const modelOptions = listUiRecommendationModelOptions();

const typeOptions = ["all", "skill", "mcp", "agent"];
const riskOptions: RiskTolerance[] = ["low", "medium", "high"];

export default function App() {
  const [artifacts, setArtifacts] = useState<UiArtifacts | null>(null);
  const [activePage, setActivePage] = useState<Page>("tools");
  const [selectedId, setSelectedId] = useState("");
  const [selectedRecommendationToolId, setSelectedRecommendationToolId] = useState("");
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [query, setQuery] = useState(fallbackQuery);
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState(modelOptions[0]);
  const [riskTolerance, setRiskTolerance] = useState<RiskTolerance>("low");
  const [typeFilter, setTypeFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null);
  const [recommendationRun, setRecommendationRun] = useState<{ count: number; query: string } | null>(null);
  const [recommendationError, setRecommendationError] = useState("");
  const [isRecommendationSubmitting, setIsRecommendationSubmitting] = useState(false);
  const [isRecommendationInputCollapsed, setIsRecommendationInputCollapsed] = useState(false);

  useEffect(() => {
    void loadUiArtifacts().then((loaded) => {
      setArtifacts(loaded);
      setSelectedId(loaded.tools[0]?.card.id ?? "");
      setSelectedRecommendationToolId(loaded.tools[0]?.card.id ?? "");
      setCompareIds(loaded.tools.slice(0, 4).map((tool) => tool.card.id));
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

  const compareColumns = useMemo(() => {
    if (!artifacts) return [];
    return buildCompareColumns(artifacts.tools, compareIds);
  }, [artifacts, compareIds]);

  const selectedTool = filteredTools.find((tool) => tool.card.id === selectedId) ?? filteredTools[0] ?? artifacts?.tools[0];
  const selectedRecommendationTool =
    recommendationItems.find((item) => item.tool.card.id === selectedRecommendationToolId)?.tool ??
    recommendationItems[0]?.tool ??
    selectedTool;

  if (!artifacts || !selectedTool || !selectedRecommendationTool) {
    return (
      <main className="grid min-h-screen place-items-center bg-background text-muted-foreground">
        <div className="flex items-center gap-2 text-sm">
          <Bot />
          <span>Loading Agent Radar data</span>
        </div>
      </main>
    );
  }

  async function runRecommendation() {
    if (!artifacts || isRecommendationSubmitting || query.trim().length === 0) return;
    const submittedQuery = query.trim();
    const submittedApiKey = apiKey.trim();
    if (!submittedApiKey) {
      setRecommendationError("API key is required to run an LLM recommendation.");
      return;
    }
    setIsRecommendationSubmitting(true);
    setRecommendationError("");
    try {
      const response = await fetch("/api/recommend_tools", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          task: submittedQuery,
          risk_tolerance: riskTolerance,
          top_k: 4,
          api_key: submittedApiKey,
          model: modelName
        })
      });
      const body = (await response.json()) as RecommendationResult | RecommendationApiErrorBody;
      if (!response.ok) {
        throw new Error(formatRecommendationApiError(body as RecommendationApiErrorBody));
      }
      const nextRecommendation = body as RecommendationResult;
      setRecommendation(nextRecommendation);
      setSelectedRecommendationToolId(nextRecommendation.candidates[0]?.tool_id ?? selectedRecommendationTool.card.id);
      setRecommendationRun((current) => ({ count: (current?.count ?? 0) + 1, query: submittedQuery }));
      setIsRecommendationInputCollapsed(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Recommendation request failed.";
      setRecommendationError(message);
    } finally {
      setIsRecommendationSubmitting(false);
    }
  }

  return (
    <main className="app-shell min-h-screen bg-background text-foreground">
      <header className="app-topbar sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto grid h-auto max-w-[1500px] grid-cols-1 items-center gap-3 px-4 py-3 md:h-14 md:grid-cols-[250px_1fr_auto] md:px-6 md:py-0">
          <div className="flex items-center gap-2 text-sm font-medium">
            <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Bot />
            </span>
            <strong>Agent Radar</strong>
          </div>
          <Tabs value={activePage} onValueChange={(value) => setActivePage(value as Page)}>
            <TabsList>
              <TabsTrigger value="tools">Tools</TabsTrigger>
              <TabsTrigger value="recommend">Recommend</TabsTrigger>
              <TabsTrigger value="compare">Compare</TabsTrigger>
            </TabsList>
          </Tabs>
          <EvalStatusPopover summary={artifacts.evalSummary} />
        </div>
      </header>

      {activePage === "tools" && (
        <section className="mx-auto grid max-w-[1500px] gap-4 p-3 md:grid-cols-[310px_minmax(520px,1fr)] md:p-5">
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
          <section className="grid min-w-0 gap-4">
            <ToolDetail tool={selectedTool} />
            <CompareStrip tools={artifacts.tools.slice(0, 4)} />
          </section>
        </section>
      )}

      {activePage === "recommend" && (
        <section className="mx-auto grid max-w-[1500px] gap-4 p-3 lg:grid-cols-[390px_minmax(520px,1fr)] md:p-5">
          <RecommendControlPanel
            query={query}
            apiKey={apiKey}
            modelName={modelName}
            riskTolerance={riskTolerance}
            recommendation={recommendation}
            recommendationRun={recommendationRun}
            recommendationError={recommendationError}
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
          <section className="min-w-0">
            <ToolDetail tool={selectedRecommendationTool} />
          </section>
        </section>
      )}

      {activePage === "compare" && (
        <ComparePage
          tools={artifacts.tools}
          columns={compareColumns}
          selectedIds={compareIds}
          onSelectCompareId={(index, toolId) =>
            setCompareIds((current) => {
              const nextIds = [...current];
              nextIds[index] = toolId;
              return nextIds;
            })
          }
        />
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
    <Card className="app-card h-fit min-w-0 md:sticky md:top-20 md:max-h-[calc(100vh-6rem)]">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Tool Cards</CardTitle>
            <CardDescription>{allToolCount} reviewed MVP records</CardDescription>
          </div>
          <Filter className="text-muted-foreground" />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 overflow-auto">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-8"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search tools, tags, risks"
          />
        </label>
        <ToggleGroup
          className="w-full flex-wrap"
          value={[typeFilter]}
          onValueChange={(values) => {
            const nextValue = values.at(-1);
            if (nextValue) onTypeFilterChange(nextValue);
          }}
          variant="outline"
          size="sm"
        >
          {typeOptions.map((type) => (
            <ToggleGroupItem className="flex-1 capitalize" key={type} value={type} aria-label={`Filter ${type}`}>
              {type}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <div className="grid gap-2">
          {tools.map((tool) => (
            <Button
              key={tool.card.id}
              type="button"
              variant={selectedId === tool.card.id ? "secondary" : "ghost"}
              className={cn("tool-row-button h-auto justify-start whitespace-normal rounded-lg p-2 text-left", selectedId === tool.card.id && "is-selected")}
              onClick={() => onSelectTool(tool.card.id)}
            >
              <span className={`type-dot ${tool.card.type}`} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{tool.card.name}</span>
                <span className="block text-xs text-muted-foreground">{tool.card.type} · {tool.rating.recommendation_level}</span>
              </span>
              <Badge className="score-pill" variant="outline">{tool.rating.overall_score}</Badge>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function RecommendControlPanel({
  query,
  apiKey,
  modelName,
  riskTolerance,
  recommendation,
  recommendationRun,
  recommendationError,
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
  riskTolerance: RiskTolerance;
  recommendation: RecommendationResult | null;
  recommendationRun: { count: number; query: string } | null;
  recommendationError: string;
  recommendationItems: RecommendationItem[];
  selectedToolId: string;
  isSubmitting: boolean;
  isInputCollapsed: boolean;
  onQueryChange: (value: string) => void;
  onApiKeyChange: (value: string) => void;
  onModelNameChange: (value: string) => void;
  onRiskToleranceChange: (value: RiskTolerance) => void;
  onRunRecommendation: () => void | Promise<void>;
  onToggleInputCollapsed: (value: boolean) => void;
  onSelectRecommendation: (toolId: string) => void;
}) {
  const collapsedSummary = buildCollapsedRecommendationSummary({ query, modelName, riskTolerance });

  return (
    <Card className="app-card h-fit min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles />
          Recommend
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 overflow-auto">
        {isInputCollapsed ? (
          <Button
            className="h-auto flex-col items-start gap-1 whitespace-normal rounded-lg p-3"
            variant="outline"
            type="button"
            onClick={() => onToggleInputCollapsed(false)}
          >
            <span className="text-xs text-muted-foreground">Requirement</span>
            <strong className="line-clamp-2 text-sm">{collapsedSummary.title}</strong>
            <span className="text-xs text-muted-foreground">{collapsedSummary.meta}</span>
          </Button>
        ) : (
          <section className="flex flex-col gap-3" aria-label="Recommendation input">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Requirement
              <Textarea
                className="min-h-28 resize-y"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="Describe a development task to get tool recommendations"
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              API key
              <span className="relative block">
                <span className="api-key-icon text-muted-foreground">
                  <KeyRound />
                </span>
                <Input
                  className="api-key-input"
                  value={apiKey}
                  onChange={(event) => onApiKeyChange(event.target.value)}
                  type="password"
                  autoComplete="off"
                  placeholder="Paste provider key"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Model
              <Select
                items={modelOptions.map((model) => ({ label: model, value: model }))}
                value={modelName}
                onValueChange={(value) => onModelNameChange(value ?? modelOptions[0])}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} sideOffset={6} className="recommend-model-menu">
                  <SelectGroup>
                    {modelOptions.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-medium">
              <span>Risk</span>
              <ToggleGroup
                value={[riskTolerance]}
                onValueChange={(values) => {
                  const nextValue = values.at(-1) as RiskTolerance | undefined;
                  if (nextValue) onRiskToleranceChange(nextValue);
                }}
                variant="outline"
                size="sm"
              >
                {riskOptions.map((risk) => (
                  <ToggleGroupItem className="capitalize" key={risk} value={risk} aria-label={`Risk ${risk}`}>
                    {risk}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
            <Button className="primary-submit" onClick={() => void onRunRecommendation()} disabled={isSubmitting || query.trim().length === 0 || apiKey.trim().length === 0}>
              {isSubmitting ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : <Sparkles data-icon="inline-start" />}
              {getRecommendationSubmitLabel(isSubmitting)}
            </Button>
          </section>
        )}
        {isInputCollapsed && (
          <Button className="secondary-edit" variant="outline" type="button" onClick={() => onToggleInputCollapsed(false)}>
            Edit input
          </Button>
        )}
        {recommendation && recommendationRun && (
          <Alert aria-live="polite">
            <Sparkles />
            <AlertTitle>Latest run</AlertTitle>
            <AlertDescription>
              {buildRecommendationRunSummary({
                runCount: recommendationRun.count,
                action: recommendation.recommended_action,
                query: recommendationRun.query
              })}
            </AlertDescription>
          </Alert>
        )}
        {recommendationError && (
          <Alert variant="destructive" aria-live="polite">
            <AlertTriangle />
            <AlertTitle>Recommendation failed</AlertTitle>
            <AlertDescription>{recommendationError}</AlertDescription>
          </Alert>
        )}
        {recommendation && (
          <RecommendationList
            result={recommendation}
            items={recommendationItems}
            selectedToolId={selectedToolId}
            onSelectRecommendation={onSelectRecommendation}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ToolDetail({ tool }: { tool: ToolViewModel }) {
  return (
    <Card className="app-card min-w-0">
      <CardHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <CardDescription>{tool.card.type} / {tool.card.primary_purpose}</CardDescription>
            <CardTitle className="mt-1 text-xl">{tool.card.name}</CardTitle>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{tool.card.summary}</p>
          </div>
          <ScoreBadge score={tool.rating.overall_score} risk={tool.rating.risk_level} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap gap-1.5">
          {tool.card.tags.map((tag) => (
            <Badge key={tag} variant="outline">
              {tag}
            </Badge>
          ))}
        </div>
        <Separator />
        <div className="grid gap-3 lg:grid-cols-3">
          <InfoBlock icon={<Gauge />} label="Rating" value={tool.rating.recommendation_level} detail={tool.rating.explanations[0]?.reason} />
          <InfoBlock icon={<ShieldAlert />} label="Risk" value={tool.rating.risk_level} detail={tool.card.security.security_notes} />
          <InfoBlock icon={<Database />} label="Evidence" value={tool.rating.evidence_quality} detail={tool.card.source_urls[0]} />
        </div>
        <section className="grid gap-3">
          <h3 className="text-sm font-medium">Rating Dimensions</h3>
          {Object.entries(tool.rating.dimension_scores).map(([dimension, score]) => (
            <div className="grid min-h-7 grid-cols-[minmax(104px,150px)_1fr_34px] items-center gap-2 text-xs" key={dimension}>
              <span className="truncate text-muted-foreground">{dimension.replaceAll("_", " ")}</span>
              <Progress className="rating-progress" value={score} />
              <b className="text-right">{score}</b>
            </div>
          ))}
        </section>
        <section className="grid gap-4 md:grid-cols-2">
          <ListBlock title="Use Cases" items={tool.card.use_cases} />
          <ListBlock title="Not For" items={tool.card.not_for} />
        </section>
      </CardContent>
    </Card>
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
  const isCaution = result.recommended_action === "ask_human" || result.recommended_action === "no_reliable_match";

  return (
    <section className="grid gap-3">
      <Alert variant="default" className={cn("action-alert", isCaution ? "is-caution" : "is-use")}>
        <AlertTriangle />
        <AlertTitle>{result.recommended_action}</AlertTitle>
        {result.no_match_reason && <AlertDescription>{result.no_match_reason}</AlertDescription>}
      </Alert>
      <div className="grid gap-2">
        {items.map((item) => (
          <Button
            className={cn("candidate-row-button h-auto grid-cols-[24px_1fr] justify-start gap-x-2 gap-y-1 whitespace-normal rounded-lg p-3 text-left", selectedToolId === item.tool.card.id && "is-selected")}
            variant={selectedToolId === item.tool.card.id ? "secondary" : "outline"}
            key={item.candidate.tool_id}
            onClick={() => onSelectRecommendation(item.tool.card.id)}
          >
            <Badge className="rank-pill" variant="outline">{item.candidate.rank}</Badge>
            <strong className="text-sm">{item.candidate.name}</strong>
            <span className="col-start-2 text-xs text-muted-foreground">
              {item.candidate.recommendation_level} · {item.candidate.risk_level} · {item.candidate.fit_score}
            </span>
          </Button>
        ))}
      </div>
    </section>
  );
}

function EvalStatusPopover({ summary }: { summary: UiArtifacts["evalSummary"] }) {
  const rows = createEvalPopoverRows(summary);

  return (
    <div className="eval-status">
      <Button className="eval-trigger w-fit" variant="outline" type="button" aria-describedby="eval-popover">
        <CheckCircle2 data-icon="inline-start" />
        {summary.passed}/{summary.total} golden queries
      </Button>
      <section className="eval-popover w-[min(380px,calc(100vw-28px))]" id="eval-popover" role="tooltip">
        <div className="grid gap-0.5 text-sm">
          <strong className="font-medium">Quality Checks</strong>
          <p className="text-muted-foreground">Fixed release eval, not a live recommendation run</p>
        </div>
        <Separator />
        <div className="grid gap-2">
          {rows.map((row) => (
            <div className="grid min-h-8 grid-cols-[18px_1fr_auto] items-center gap-2 text-xs" key={row.id}>
              <span className="text-primary">{row.status === "passed" ? <CheckCircle2 /> : <CircleHelp />}</span>
              <strong className="truncate font-medium">{row.label}</strong>
              <span className="text-muted-foreground">{row.action}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function CompareStrip({ tools }: { tools: ToolViewModel[] }) {
  return (
    <Card className="app-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GitCompare />
          Compare
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          {tools.map((tool) => (
            <div className="grid min-h-11 grid-cols-[1fr_70px_82px_42px] items-center gap-2 border-b px-3 text-xs last:border-b-0" key={tool.card.id}>
              <strong className="truncate font-medium">{tool.card.name}</strong>
              <span className="text-muted-foreground">{tool.card.type}</span>
              <span className="text-muted-foreground">{tool.rating.risk_level}</span>
              <b className="text-right">{tool.rating.overall_score}</b>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ComparePage({
  tools,
  columns,
  selectedIds,
  onSelectCompareId
}: {
  tools: ToolViewModel[];
  columns: ToolViewModel[];
  selectedIds: string[];
  onSelectCompareId: (index: number, toolId: string) => void;
}) {
  const rows = [
    { label: "Type", value: (tool: ToolViewModel) => tool.card.type },
    { label: "Score", value: (tool: ToolViewModel) => String(tool.rating.overall_score) },
    { label: "Recommendation", value: (tool: ToolViewModel) => tool.rating.recommendation_level },
    { label: "Risk", value: (tool: ToolViewModel) => tool.rating.risk_level },
    { label: "Evidence", value: (tool: ToolViewModel) => tool.rating.evidence_quality },
    { label: "Purpose", value: (tool: ToolViewModel) => tool.card.primary_purpose },
    { label: "Permissions", value: (tool: ToolViewModel) => tool.card.permissions.map((permission) => `${permission.scope}:${permission.access}`).join(", ") || "none" },
    { label: "Best for", value: (tool: ToolViewModel) => tool.card.use_cases.slice(0, 2).join("; ") },
    { label: "Avoid when", value: (tool: ToolViewModel) => tool.card.not_for.slice(0, 2).join("; ") }
  ];

  return (
    <section className="mx-auto grid max-w-[1500px] gap-4 p-3 md:p-5">
      <Card className="app-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <GitCompare />
            Compare Tool Cards
          </CardTitle>
          <CardDescription>Review fit, risk, evidence, permissions, and limits side by side.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <label className="flex min-w-0 flex-col gap-1.5 text-sm font-medium" key={index}>
              Slot {index + 1}
              <Select
                items={tools.map((tool) => ({ label: tool.card.name, value: tool.card.id }))}
                value={selectedIds[index] ?? columns[index]?.card.id ?? tools[index]?.card.id}
                onValueChange={(value) => {
                  if (value) onSelectCompareId(index, value);
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent alignItemWithTrigger={false} sideOffset={6} className="recommend-model-menu">
                  <SelectGroup>
                    {tools.map((tool) => (
                      <SelectItem key={tool.card.id} value={tool.card.id}>
                        {tool.card.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
          ))}
        </CardContent>
      </Card>
      <Card className="app-card">
        <CardContent className="overflow-x-auto p-0">
          <div className="compare-grid min-w-[920px]" style={{ gridTemplateColumns: `160px repeat(${columns.length}, minmax(180px, 1fr))` }}>
            <div className="compare-cell compare-head">Field</div>
            {columns.map((tool) => (
              <div className="compare-cell compare-head" key={tool.card.id}>
                <strong>{tool.card.name}</strong>
                <span>{tool.card.summary}</span>
              </div>
            ))}
            {rows.map((row) => (
              <div className="contents" key={row.label}>
                <div className="compare-cell compare-label">{row.label}</div>
                {columns.map((tool) => (
                  <div className="compare-cell" key={`${row.label}-${tool.card.id}`}>
                    {row.value(tool)}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function InfoBlock({ icon, label, value, detail }: { icon: ReactNode; label: string; value: string; detail?: string }) {
  return (
    <Card size="sm" className="info-block-card min-h-32">
      <CardHeader>
        <CardDescription className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          {label}
        </CardDescription>
        <CardTitle className="text-sm">{value}</CardTitle>
      </CardHeader>
      {detail && (
        <CardContent>
          <p className="break-words text-xs leading-5 text-muted-foreground">{detail}</p>
        </CardContent>
      )}
    </Card>
  );
}

function ListBlock({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-sm font-medium">{title}</h3>
      <ul className="grid gap-1 pl-4 text-sm leading-6 text-muted-foreground">
        {items.map((item) => (
          <li className="list-disc" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

function ScoreBadge({ score, risk }: { score: number; risk: string }) {
  const highRisk = risk === "high" || risk === "critical";

  return (
    <Card className={cn("score-badge-card min-w-24", highRisk ? "is-risk" : "is-trusted")} size="sm">
      <CardContent className="text-center">
        <strong className="block text-2xl leading-none">{score}</strong>
        <span className="text-xs">{risk}</span>
      </CardContent>
    </Card>
  );
}
