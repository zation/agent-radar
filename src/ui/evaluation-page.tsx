import { ArrowLeft, CheckCircle2, Clock3, Tag, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import type { EvalSummary } from "../eval/runner.js";
import type { EvalCase } from "../schema.js";
import { createEvaluationView, filterEvaluationRows, type EvaluationFilter } from "./evaluation-view.js";

const filters: Array<{ value: EvaluationFilter; label: string }> = [
  { value: "all", label: "All" }, { value: "critical", label: "Critical" },
  { value: "ask_human", label: "Ask human" }, { value: "no_reliable_match", label: "No match" }
];

export function EvaluationPage({ cases, summary }: { cases: EvalCase[]; summary: EvalSummary }) {
  const view = useMemo(() => createEvaluationView(cases, summary), [cases, summary]);
  const [filter, setFilter] = useState<EvaluationFilter>("all");
  const rows = useMemo(() => filterEvaluationRows(view.rows, filter), [filter, view.rows]);
  const [selectedId, setSelectedId] = useState(view.rows[0]?.id ?? "");
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0] ?? view.rows[0];
  const failed = view.health.kind === "failed";

  return (
    <section className="evaluation-page page-frame">
      <div className="evaluation-intro">
        <div><span className="system-label">Recommendation quality</span><h1>Recommendation Evaluation</h1><p>24 fixed, replayable golden queries protect recommendation quality, safety boundaries, and reliable no-match behavior across releases.</p></div>
        <div className="evaluation-health" aria-label="Evaluation health">
          <Metric label="Pass rate" value={`${view.passed} / ${view.total}`} status={failed ? `${view.health.failed} FAILED` : "ALL PASSED"} failed={failed} />
          <Metric label="Critical cases" value={`${view.critical.passed} / ${view.critical.total}`} status={view.critical.failed ? `${view.critical.failed} FAILED` : "ALL PASSED"} failed={view.critical.failed > 0} />
          <div className="health-metric"><span>Evaluated release</span><strong>{view.releaseLabel}</strong><small><Tag />{view.commitSha.slice(0, 7)}</small></div>
        </div>
      </div>
      <div className="evaluation-filters" aria-label="Evaluation filters">
        {filters.map((item) => <button className={filter === item.value ? "is-active" : ""} key={item.value} onClick={() => { setFilter(item.value); setMobileDetailOpen(false); }} type="button">{item.label}</button>)}
      </div>
      {selected ? <div className={`evaluation-workspace ${mobileDetailOpen ? "show-mobile-detail" : ""}`}>
        <aside className="evaluation-list" aria-label="Golden queries">
          {rows.map((row) => <button aria-current={row.id === selected.id ? "true" : undefined} className={row.id === selected.id ? "is-selected" : ""} key={row.id} onClick={() => { setSelectedId(row.id); setMobileDetailOpen(true); }} type="button"><span><strong>{row.id.replace(/^gq-/, "")}</strong><small>{row.task}</small></span><em className={row.passed ? "is-pass" : "is-fail"}>{row.severity}</em></button>)}
        </aside>
        <article className="evaluation-detail">
          <button className="mobile-back" onClick={() => setMobileDetailOpen(false)} type="button"><ArrowLeft />Back to queries</button>
          <header><div><span className="system-label">{selected.severity} evaluation case</span><h2>{selected.id.replace(/^gq-/, "")}</h2><p>{selected.task}</p></div><span className={`evaluation-result ${selected.passed ? "is-pass" : "is-fail"}`}>{selected.passed ? <CheckCircle2 /> : <TriangleAlert />}{selected.passed ? "Pass" : "Failed"}</span></header>
          <section className="evaluation-why"><strong>为什么需要这条 Query？</strong><p>{selected.why}</p></section>
          <div className="evaluation-facts"><Fact label="Expected action" value={selected.expectedAction ?? "not fixed"} /><Fact label="Observed action" value={selected.observedAction} /><Fact label="Risk" value={selected.riskLevel} /><Fact label="Top candidate" value={selected.topToolIds[0] ?? "none"} /><Fact label="Release" value={view.releaseLabel} /><Fact label="Updated" value={selected.updatedAt.slice(0, 10)} /></div>
          <section className="evaluation-boundary"><h3>What this protects</h3><p>{selected.failures.length ? selected.failures.join(" ") : "The observed action and safety result match the release expectation."}</p><div><Clock3 />A failure in this fixed suite blocks a releasable evaluation summary.</div></section>
        </article>
      </div> : <p className="empty-state">No evaluation cases match this filter.</p>}
    </section>
  );
}

function Metric({ label, value, status, failed }: { label: string; value: string; status: string; failed: boolean }) {
  return <div className="health-metric"><span>{label}</span><strong>{value}</strong><small className={failed ? "is-fail" : "is-pass"}>{failed ? <TriangleAlert /> : <CheckCircle2 />}{status}</small></div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
