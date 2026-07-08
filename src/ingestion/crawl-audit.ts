import type { RawSourceSnapshot } from "../schema.js";

export interface CrawlAuditItem {
  source_id: string;
  source_url: string;
  snapshot_id: string;
  fetched_at: string;
  fetch_method: RawSourceSnapshot["fetch_method"];
  status: RawSourceSnapshot["status"];
  http_status?: number;
  content_hash: string;
  content_path: string;
  request_meta?: Record<string, string>;
  error_code?: string;
}

export interface CrawlAudit {
  schema_version: "crawl_audit.v1";
  generated_at: string;
  summary: {
    total: number;
    success: number;
    partial: number;
    failed: number;
  };
  items: CrawlAuditItem[];
}

export function buildCrawlAudit(snapshots: RawSourceSnapshot[], generatedAt: string): CrawlAudit {
  const items = snapshots.map((snapshot) => ({
    source_id: snapshot.source_id,
    source_url: snapshot.source_url,
    snapshot_id: snapshot.id,
    fetched_at: snapshot.fetched_at,
    fetch_method: snapshot.fetch_method,
    status: snapshot.status,
    http_status: snapshot.http_status,
    content_hash: snapshot.content_hash,
    content_path: snapshot.content_path,
    request_meta: snapshot.request_meta,
    error_code: snapshot.error?.code
  }));

  return {
    schema_version: "crawl_audit.v1",
    generated_at: generatedAt,
    summary: {
      total: items.length,
      success: items.filter((item) => item.status === "success").length,
      partial: items.filter((item) => item.status === "partial").length,
      failed: items.filter((item) => item.status === "failed").length
    },
    items
  };
}
