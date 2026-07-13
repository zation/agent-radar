export const REQUIRED_MCP_SMOKE_CHECK_IDS = [
  "initialize",
  "tools-list",
  "search-tools",
  "get-tool-card",
  "explain-rating",
  "recommend-missing-key",
  "write-method-rejected"
] as const;

export type McpSmokeCheckId = (typeof REQUIRED_MCP_SMOKE_CHECK_IDS)[number];
