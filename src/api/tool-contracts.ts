import * as z from "zod/v4";

export const MCP_TOOL_NAMES = [
  "search_tools",
  "get_tool_card",
  "recommend_tools",
  "explain_rating"
] as const;

const toolType = z.enum(["mcp", "skill", "agent", "framework", "cli", "prompt", "rules", "dataset", "service"]);
const riskLevel = z.enum(["low", "medium", "high", "critical", "unknown"]);
const structuredResult = z.looseObject({});

const searchInput = z.object({
  query: z.string().default(""),
  top_k: z.number().int().min(1).max(50).default(5),
  filters: z.object({
    type: toolType.optional(),
    tags: z.array(z.string()).optional(),
    risk_level: riskLevel.optional()
  }).strict().optional()
}).strict();

const toolIdInput = z.object({
  tool_id: z.string().trim().min(1)
}).strict();

const recommendationInput = z.object({
  task: z.string().trim().min(1),
  language_or_stack: z.array(z.string()).optional(),
  environment: z.array(z.string()).optional(),
  preferred_tool_types: z.array(toolType).optional(),
  allowed_permissions: z.array(z.string()).optional(),
  risk_tolerance: z.enum(["low", "medium", "high"]).optional(),
  existing_tools: z.array(z.string()).optional(),
  budget: z.string().optional(),
  output_format: z.enum(["json", "markdown"]).optional(),
  top_k: z.number().int().min(1).max(50).optional(),
  model: z.string().trim().min(1).optional()
}).strict();

const readOnlyIdempotent = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true
} as const;

export const toolContracts = {
  search_tools: {
    title: "Search Agent Radar tools",
    description: "Search Agent Radar Tool Cards by query text and optional type, tag, or risk filters.",
    input: searchInput,
    output: structuredResult,
    annotations: readOnlyIdempotent,
    http: { method: "GET_OR_POST", path: "/api/search_tools" }
  },
  get_tool_card: {
    title: "Get an Agent Radar tool card",
    description: "Return one Tool Card and its Rating Result by stable tool_id.",
    input: toolIdInput,
    output: structuredResult,
    annotations: readOnlyIdempotent,
    http: { method: "GET_OR_POST", path: "/api/get_tool_card" }
  },
  recommend_tools: {
    title: "Recommend tools",
    description: "Recommend known tools for a task using request-scoped LLM credentials when required.",
    input: recommendationInput,
    output: structuredResult,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false
    },
    http: { method: "POST", path: "/api/recommend_tools" }
  },
  explain_rating: {
    title: "Explain a tool rating",
    description: "Return rating dimensions, explanations, penalties, and boosts for one tool_id.",
    input: toolIdInput,
    output: structuredResult,
    annotations: readOnlyIdempotent,
    http: { method: "GET_OR_POST", path: "/api/explain_rating" }
  }
} as const;

export type ToolName = keyof typeof toolContracts;
export type ToolInput<Name extends ToolName> = z.infer<(typeof toolContracts)[Name]["input"]>;
