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
  query: z.string().default("").describe("Free-text tool name, capability, or task to search for. Use an empty string to browse the highest-rated matching catalog entries."),
  top_k: z.number().int().min(1).max(50).default(5).describe("Maximum number of results to return, from 1 to 50. Defaults to 5."),
  filters: z.object({
    type: toolType.optional().describe("Exact Agent Radar tool type to include, such as mcp, skill, agent, framework, or cli."),
    tags: z.array(z.string()).optional().describe("Exact catalog tags that every returned tool must contain."),
    risk_level: riskLevel.optional().describe("Exact assessed risk level to include: low, medium, high, critical, or unknown.")
  }).strict().optional().describe("Optional exact-match filters applied before search ranking.")
}).strict();

const toolIdInput = z.object({
  tool_id: z.string().trim().min(1).describe("Stable Agent Radar tool identifier, usually obtained from search_tools results.")
}).strict();

const recommendationInput = z.object({
  task: z.string().trim().min(1).describe("Natural-language development task for which Agent Radar should recommend suitable AI tools."),
  language_or_stack: z.array(z.string()).optional().describe("Programming languages, frameworks, runtimes, or other stack constraints relevant to the task."),
  environment: z.array(z.string()).optional().describe("Execution contexts such as local development, CI, browser, cloud, IDE, or production."),
  preferred_tool_types: z.array(toolType).optional().describe("Agent Radar tool types to prefer when selecting candidates."),
  allowed_permissions: z.array(z.string()).optional().describe("Permission scope names the caller is willing to allow; candidates outside these boundaries are treated conservatively."),
  risk_tolerance: z.enum(["low", "medium", "high"]).optional().describe("Maximum preferred risk tolerance for the recommendation: low, medium, or high."),
  existing_tools: z.array(z.string()).optional().describe("Tools already available to the project or agent, used as compatibility and duplication context."),
  budget: z.string().optional().describe("Natural-language cost constraint, such as free, free_or_low_cost, or a project-specific budget."),
  output_format: z.enum(["json", "markdown"]).optional().describe("Preferred presentation format for recommendation content: json or markdown. MCP still returns structured content."),
  top_k: z.number().int().min(1).max(50).optional().describe("Maximum number of recommended candidates to return, from 1 to 50. Defaults to 5 when omitted."),
  model: z.string().trim().min(1).optional().describe("LLM provider model identifier recognized by Agent Radar. Omit it to use the server-configured or registry default model.")
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
