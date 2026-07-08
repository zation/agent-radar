import type { SourceDefinition } from "../schema.js";

export type CrawlPlanStatus = "ready" | "disabled" | "blocked";

export interface CrawlPlanItem {
  source_id: string;
  source_url: string;
  collection_method: SourceDefinition["collection_method"];
  recommended_frequency: SourceDefinition["recommended_frequency"];
  parser: string;
  status: CrawlPlanStatus;
  reason: string;
}

export interface SourceCrawlPlan {
  schema_version: "source_crawl_plan.v1";
  generated_at: string;
  summary: {
    total: number;
    ready: number;
    blocked: number;
  };
  items: CrawlPlanItem[];
}

export function buildSourceCrawlPlan(sources: SourceDefinition[], generatedAt: string): SourceCrawlPlan {
  const items = sources.map((source) => {
    const hasParser = Boolean(source.parser?.trim());
    const status: CrawlPlanStatus = source.enabled && hasParser ? "ready" : "blocked";
    return {
      source_id: source.id,
      source_url: source.url,
      collection_method: source.collection_method,
      recommended_frequency: source.recommended_frequency,
      parser: source.parser ?? "",
      status,
      reason: status === "ready" ? "enabled_source_ready_for_crawl" : "enabled_source_missing_parser"
    };
  });

  return {
    schema_version: "source_crawl_plan.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      ready: items.filter((item) => item.status === "ready").length,
      blocked: items.filter((item) => item.status === "blocked").length
    },
    items
  };
}
