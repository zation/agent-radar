import { ExternalLink } from "lucide-react";
import type { ToolViewModel } from "./data.js";

export function ToolDetail({ tool, taskReason }: { tool: ToolViewModel; taskReason?: string }) {
  const dimensions = Object.entries(tool.rating.dimension_scores);
  return <article className="tool-detail">
    <header className="tool-detail-header"><div><span className="system-label">Verified decision record · {tool.card.type}</span><h2>{tool.card.name}</h2><p>{tool.card.summary}</p></div><div className="tool-score"><strong>{tool.rating.overall_score}</strong><span>{tool.rating.risk_level} risk</span></div></header>
    <section className="decision-reason"><strong>{taskReason ? "Why Radar recommends this" : "Why this rating"}</strong><p>{taskReason ?? tool.rating.explanations[0]?.reason ?? "Evidence-backed rating for this reviewed tool record."}</p></section>
    <div className="tool-facts"><Fact label="Decision" value={tool.rating.recommendation_level} /><Fact label="Evidence" value={tool.rating.evidence_quality} /><Fact label="Maintenance" value={String(tool.rating.dimension_scores.maintenance_health ?? "unknown")} /><Fact label="Integration" value={String(tool.rating.dimension_scores.integration_cost ?? "unknown")} /></div>
    <div className="tool-boundaries"><div><strong>Good for</strong><p>{tool.card.use_cases.join(" · ") || "No reviewed use cases."}</p></div><div><strong>Not for</strong><p>{tool.card.not_for.join(" · ") || "No reviewed exclusions."}</p></div></div>
    <div className="tool-lower"><section><h3>Decision signals</h3>{dimensions.map(([name, score]) => <div className="signal-row" key={name}><span>{name.replaceAll("_", " ")}</span><div><i style={{ width: `${score}%` }} /></div><strong>{score}</strong></div>)}</section><aside><h3>Evidence & access</h3><Info label="Primary source" value={tool.card.source_urls[0] ?? "No source"} link /><Info label="Permissions" value={tool.card.permissions.map((item) => `${item.scope}:${item.access}`).join(", ") || "None declared"} /><Info label="Security note" value={tool.card.security.security_notes} /><Info label="Last verified" value={tool.card.updated_at} /></aside></div>
  </article>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function Info({ label, value, link = false }: { label: string; value: string; link?: boolean }) { return <div className="evidence-row"><strong>{label}</strong>{link ? <a href={value} rel="noreferrer" target="_blank">{value}<ExternalLink /></a> : <span>{value}</span>}</div>; }
