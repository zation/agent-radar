import { Button } from "@/components/ui/button";
import type { ToolViewModel } from "./data.js";

export function ToolRow({ tool, active, rank, score, recommendationLevel, onSelect }: {
  tool: ToolViewModel;
  active: boolean;
  rank?: number;
  score: number;
  recommendationLevel: string;
  onSelect: (trigger: HTMLElement) => void;
}) {
  return <Button aria-current={active ? "true" : undefined} className="overflow-hidden" onClick={(event) => onSelect(event.currentTarget)} variant="row">
    <span className={`size-2.5 shrink-0 rounded-full ${tool.card.type === "skill" ? "bg-emerald-500" : tool.card.type === "mcp" ? "bg-blue-500" : "bg-amber-500"}`} />
    <span className="min-w-0 flex-1 overflow-hidden"><strong className="block truncate text-[15px] text-foreground">{tool.card.name}</strong><small className="mt-1 block truncate text-sm font-normal text-muted-foreground">{tool.card.type} · {recommendationLevel}</small></span>
    <em className="w-8 shrink-0 text-right font-mono text-base font-semibold not-italic text-foreground">{rank ? String(rank).padStart(2, "0") : score}</em>
  </Button>;
}
