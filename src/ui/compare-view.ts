import type { ToolViewModel } from "./data.js";

export function buildCompareColumns(tools: ToolViewModel[], selectedIds: string[], maxColumns = 4): ToolViewModel[] {
  const toolsById = new Map(tools.map((tool) => [tool.card.id, tool]));
  const selectedTools = [...new Set(selectedIds)]
    .map((toolId) => toolsById.get(toolId))
    .filter((tool): tool is ToolViewModel => Boolean(tool));

  const fallbackTools = tools
    .filter((tool) => !selectedTools.some((selected) => selected.card.id === tool.card.id))
    .sort((a, b) => b.rating.overall_score - a.rating.overall_score || a.card.name.localeCompare(b.card.name));

  return [...selectedTools, ...fallbackTools].slice(0, maxColumns);
}
