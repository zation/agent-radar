import type { Permission, SourceDefinition, ToolType, TrustLevel } from "../schema.js";

type RiskTemplate = "mcp-network" | "sdk-network" | "agent-framework" | "coding-agent" | "browser-agent";

interface CuratedGithubRepository {
  repository: string;
  toolId: string;
  name: string;
  type: ToolType;
  summary: string;
  primaryPurpose: string;
  tags: string[];
  useCases: string[];
  notFor: string[];
  riskTemplate: RiskTemplate;
  trustLevel?: TrustLevel;
}

const repositories: CuratedGithubRepository[] = [
  { repository: "modelcontextprotocol/servers", toolId: "mcp-modelcontextprotocol-servers", name: "MCP Reference Servers", type: "mcp", summary: "Reference and community Model Context Protocol server implementations.", primaryPurpose: "mcp_reference_servers", tags: ["mcp", "reference", "servers"], useCases: ["Evaluate MCP server patterns and reference integrations."], notFor: ["Installing every example server without reviewing its permissions."], riskTemplate: "mcp-network", trustLevel: "official" },
  { repository: "modelcontextprotocol/python-sdk", toolId: "framework-modelcontextprotocol-python-sdk", name: "MCP Python SDK", type: "framework", summary: "Official Python SDK for building Model Context Protocol clients and servers.", primaryPurpose: "mcp_python_development", tags: ["mcp", "python", "sdk"], useCases: ["Build MCP clients and servers in Python."], notFor: ["Unreviewed production tool execution."], riskTemplate: "sdk-network", trustLevel: "official" },
  { repository: "openai/openai-agents-python", toolId: "framework-openai-agents-python", name: "OpenAI Agents SDK for Python", type: "framework", summary: "Python framework for building agent workflows with tools, handoffs, and tracing.", primaryPurpose: "python_agent_workflows", tags: ["agents", "python", "openai", "tracing"], useCases: ["Build tool-using Python agent workflows."], notFor: ["Autonomous sensitive actions without approval controls."], riskTemplate: "agent-framework", trustLevel: "official" },
  { repository: "openai/openai-agents-js", toolId: "framework-openai-agents-js", name: "OpenAI Agents SDK for JavaScript", type: "framework", summary: "JavaScript and TypeScript framework for agent workflows, tools, handoffs, and tracing.", primaryPurpose: "javascript_agent_workflows", tags: ["agents", "typescript", "javascript", "openai"], useCases: ["Build tool-using JavaScript agent workflows."], notFor: ["Autonomous sensitive actions without approval controls."], riskTemplate: "agent-framework", trustLevel: "official" },
  { repository: "anthropics/claude-code", toolId: "agent-claude-code", name: "Claude Code", type: "agent", summary: "Terminal coding agent for understanding, editing, and testing software projects.", primaryPurpose: "terminal_coding_agent", tags: ["coding", "terminal", "agent", "claude"], useCases: ["Inspect repositories, edit code, and run project commands."], notFor: ["Unreviewed changes in sensitive repositories."], riskTemplate: "coding-agent", trustLevel: "official" },
  { repository: "microsoft/autogen", toolId: "framework-microsoft-autogen", name: "Microsoft AutoGen", type: "framework", summary: "Framework for building multi-agent applications and conversational workflows.", primaryPurpose: "multi_agent_applications", tags: ["agents", "multi_agent", "python", "microsoft"], useCases: ["Coordinate multiple agents in application workflows."], notFor: ["Unsandboxed autonomous code execution."], riskTemplate: "agent-framework" },
  { repository: "crewAIInc/crewAI", toolId: "framework-crewai", name: "CrewAI", type: "framework", summary: "Framework for orchestrating role-based collaborative AI agents.", primaryPurpose: "role_based_agent_orchestration", tags: ["agents", "orchestration", "python", "multi_agent"], useCases: ["Build role-based multi-agent task workflows."], notFor: ["High-impact autonomous operations without review."], riskTemplate: "agent-framework" },
  { repository: "langchain-ai/langgraph", toolId: "framework-langgraph", name: "LangGraph", type: "framework", summary: "Graph-based framework for durable stateful agent workflows.", primaryPurpose: "stateful_agent_workflows", tags: ["agents", "graph", "workflow", "langchain"], useCases: ["Build stateful agent graphs with explicit control flow."], notFor: ["Implicit high-risk actions without checkpoints."], riskTemplate: "agent-framework" },
  { repository: "run-llama/llama_index", toolId: "framework-llamaindex", name: "LlamaIndex", type: "framework", summary: "Data framework for retrieval, indexing, and agent applications.", primaryPurpose: "retrieval_and_agent_data", tags: ["rag", "agents", "data", "python"], useCases: ["Connect private or public data to retrieval and agent workflows."], notFor: ["Using sensitive data without access controls."], riskTemplate: "agent-framework" },
  { repository: "browser-use/browser-use", toolId: "agent-browser-use", name: "Browser Use", type: "agent", summary: "Browser automation framework for AI agents operating web interfaces.", primaryPurpose: "browser_agent_automation", tags: ["browser", "automation", "agents", "web"], useCases: ["Automate browser tasks in isolated test sessions."], notFor: ["Unattended use of private authenticated browser sessions."], riskTemplate: "browser-agent" },
  { repository: "supabase/mcp", toolId: "mcp-supabase", name: "Supabase MCP", type: "mcp", summary: "MCP server for interacting with Supabase development resources.", primaryPurpose: "supabase_development", tags: ["mcp", "database", "supabase", "postgres"], useCases: ["Inspect and manage Supabase development projects with approval."], notFor: ["Unapproved production database changes."], riskTemplate: "mcp-network", trustLevel: "official" },
  { repository: "awslabs/mcp", toolId: "mcp-aws-labs", name: "AWS Labs MCP Servers", type: "mcp", summary: "AWS Labs collection of MCP servers for cloud development workflows.", primaryPurpose: "aws_cloud_development", tags: ["mcp", "aws", "cloud", "infrastructure"], useCases: ["Evaluate AWS-oriented MCP integrations."], notFor: ["Unapproved production cloud mutations."], riskTemplate: "mcp-network" },
  { repository: "cloudflare/mcp-server-cloudflare", toolId: "mcp-cloudflare", name: "Cloudflare MCP Server", type: "mcp", summary: "MCP server integrations for Cloudflare developer services.", primaryPurpose: "cloudflare_development", tags: ["mcp", "cloudflare", "cloud", "workers"], useCases: ["Inspect Cloudflare development resources and workflows."], notFor: ["Unapproved production configuration changes."], riskTemplate: "mcp-network", trustLevel: "official" },
  { repository: "stripe/ai", toolId: "framework-stripe-ai", name: "Stripe AI", type: "framework", summary: "Stripe-maintained AI integration tools and agent payment guidance.", primaryPurpose: "payment_agent_integrations", tags: ["payments", "agents", "stripe", "sdk"], useCases: ["Build reviewed payment-aware agent integrations in test mode."], notFor: ["Unapproved live payment or refund operations."], riskTemplate: "sdk-network", trustLevel: "official" },
  { repository: "mongodb-js/mongodb-mcp-server", toolId: "mcp-mongodb", name: "MongoDB MCP Server", type: "mcp", summary: "MCP server for interacting with MongoDB data and developer tooling.", primaryPurpose: "mongodb_development", tags: ["mcp", "database", "mongodb", "data"], useCases: ["Inspect MongoDB development data with explicit scope."], notFor: ["Unapproved writes to production databases."], riskTemplate: "mcp-network" },
  { repository: "microsoft/mcp", toolId: "mcp-microsoft", name: "Microsoft MCP", type: "mcp", summary: "Microsoft resources and implementations for Model Context Protocol development.", primaryPurpose: "microsoft_mcp_development", tags: ["mcp", "microsoft", "reference", "development"], useCases: ["Evaluate Microsoft MCP integrations and examples."], notFor: ["Assuming every example is production hardened."], riskTemplate: "mcp-network" },
  { repository: "auth0/auth0-mcp-server", toolId: "mcp-auth0", name: "Auth0 MCP Server", type: "mcp", summary: "MCP server for Auth0 identity development and tenant workflows.", primaryPurpose: "auth0_identity_development", tags: ["mcp", "auth0", "identity", "security"], useCases: ["Inspect Auth0 development configuration with approval."], notFor: ["Unapproved production identity changes."], riskTemplate: "mcp-network", trustLevel: "official" },
  { repository: "pydantic/pydantic-ai", toolId: "framework-pydantic-ai", name: "Pydantic AI", type: "framework", summary: "Python agent framework with typed models, tools, and validation.", primaryPurpose: "typed_python_agents", tags: ["agents", "python", "pydantic", "typed"], useCases: ["Build typed Python agent applications."], notFor: ["High-risk tool execution without approval gates."], riskTemplate: "agent-framework" },
  { repository: "agno-agi/agno", toolId: "framework-agno", name: "Agno", type: "framework", summary: "Python framework for building agent systems with tools, knowledge, and workflows.", primaryPurpose: "python_agent_systems", tags: ["agents", "python", "workflow", "knowledge"], useCases: ["Build tool-using Python agent systems."], notFor: ["Unreviewed autonomous access to sensitive systems."], riskTemplate: "agent-framework" },
  { repository: "huggingface/smolagents", toolId: "framework-smolagents", name: "Smolagents", type: "framework", summary: "Lightweight Hugging Face framework for code and tool-using agents.", primaryPurpose: "lightweight_agent_development", tags: ["agents", "huggingface", "python", "code_agents"], useCases: ["Prototype compact tool-using agents."], notFor: ["Unsandboxed code agents in sensitive environments."], riskTemplate: "agent-framework" },
  { repository: "google/adk-python", toolId: "framework-google-adk", name: "Google Agent Development Kit for Python", type: "framework", summary: "Google Python toolkit for developing and evaluating agent applications.", primaryPurpose: "google_agent_development", tags: ["agents", "google", "python", "sdk"], useCases: ["Build and evaluate Python agent applications."], notFor: ["Unapproved access to production Google Cloud resources."], riskTemplate: "agent-framework", trustLevel: "official" },
  { repository: "microsoft/semantic-kernel", toolId: "framework-semantic-kernel", name: "Semantic Kernel", type: "framework", summary: "Microsoft SDK for integrating AI models, plugins, and agent workflows.", primaryPurpose: "enterprise_agent_sdk", tags: ["agents", "microsoft", "sdk", "plugins"], useCases: ["Build model and plugin orchestration applications."], notFor: ["Executing privileged plugins without approval."], riskTemplate: "agent-framework" },
  { repository: "OpenHands/OpenHands", toolId: "agent-openhands", name: "OpenHands", type: "agent", summary: "Open-source software development agent platform for coding tasks.", primaryPurpose: "software_development_agent", tags: ["coding", "agent", "development", "automation"], useCases: ["Run coding tasks in a controlled workspace."], notFor: ["Unreviewed autonomous changes or commands."], riskTemplate: "coding-agent" },
  { repository: "Aider-AI/aider", toolId: "agent-aider", name: "Aider", type: "agent", summary: "Terminal pair-programming agent for editing code with language models.", primaryPurpose: "terminal_pair_programming", tags: ["coding", "terminal", "agent", "git"], useCases: ["Edit code collaboratively from a terminal workflow."], notFor: ["Accepting changes without reviewing diffs and tests."], riskTemplate: "coding-agent" },
  { repository: "continuedev/continue", toolId: "agent-continue", name: "Continue", type: "agent", summary: "Open-source coding assistant platform for IDE and agent workflows.", primaryPurpose: "ide_coding_assistant", tags: ["coding", "ide", "agent", "development"], useCases: ["Use coding assistance and agent workflows in supported IDEs."], notFor: ["Unreviewed repository-wide autonomous changes."], riskTemplate: "coding-agent" },
];

export const curatedGithubSources: SourceDefinition[] = repositories.map(toSourceDefinition);

function toSourceDefinition(config: CuratedGithubRepository): SourceDefinition {
  const url = `https://github.com/${config.repository}`;
  const trustLevel = config.trustLevel ?? "well_known_org";
  return {
    id: `github-repo-${slugify(config.repository)}`,
    name: `GitHub repository ${config.repository}`,
    url,
    source_type: "github",
    covered_tool_types: [config.type],
    collection_method: "api",
    recommended_frequency: "weekly",
    trust_level: trustLevel,
    field_coverage: ["name", "description", "repo_url", "homepage_url", "stars", "license", "last_commit_at", "profile"],
    rate_limits: "GitHub public API rate limits",
    terms_notes: "Public metadata for one exact official or maintainer-controlled repository; all drafts pass deterministic release gates.",
    access_review: {
      robots_txt: "reviewed",
      terms: "reviewed",
      reviewed_by: "agent-radar",
      reviewed_at: "2026-07-10T00:00:00Z",
      notes: "Public GitHub API metadata for one exact repository; no cookies, private repositories, or user credentials.",
    },
    parser: "github_repo_parser",
    profile: {
      tool_id: config.toolId,
      name: config.name,
      type: config.type,
      summary: config.summary,
      tags: config.tags,
      primary_purpose: config.primaryPurpose,
      use_cases: config.useCases,
      not_for: config.notFor,
      install_methods: [{ method: "source", command: "", docs_url: url, confidence: "high" }],
      auth_required: "none",
      permissions: permissionsFor(config.riskTemplate),
      security: {
        risk_level: config.riskTemplate === "sdk-network" ? "medium" : "high",
        trust_level: trustLevel,
        known_risks: risksFor(config.riskTemplate),
        requires_human_approval: true,
        security_notes: "Review requested scopes, credentials, generated changes, and target environment before use.",
      },
      maturity: "stable",
      maintenance: {
        status: "active",
        issue_activity: "unknown",
        maintainer_type: trustLevel === "official" ? "official" : "company",
        signals: ["exact_github_repository_metadata"],
      },
    },
    failure_policy: "skip this source and preserve previous stable data",
    enabled: true,
    owner: "agent-radar",
    last_reviewed_at: "2026-07-10T00:00:00Z",
  };
}

function permissionsFor(template: RiskTemplate): Permission[] {
  if (template === "coding-agent") {
    return [
      { scope: "filesystem", access: "read_write", required: true, notes: "Reads and edits workspace files." },
      { scope: "shell", access: "execute", required: true, notes: "Runs project commands and tests." },
      { scope: "network", access: "read_write", required: true, notes: "Calls model providers and remote development services." },
      { scope: "secrets", access: "read", required: false, notes: "May use provider or deployment credentials." },
    ];
  }
  if (template === "browser-agent") {
    return [
      { scope: "browser", access: "execute", required: true, notes: "Controls a browser session." },
      { scope: "network", access: "read_write", required: true, notes: "Loads and interacts with web pages." },
      { scope: "secrets", access: "read", required: false, notes: "May encounter authenticated browser state." },
    ];
  }
  return [
    { scope: "network", access: "read_write", required: true, notes: "Connects to model, tool, or service APIs." },
    { scope: "code_execution", access: "execute", required: template === "agent-framework", notes: "Agent tools may execute application code." },
    { scope: "secrets", access: "read", required: false, notes: "May use API or service credentials." },
  ];
}

function risksFor(template: RiskTemplate): string[] {
  if (template === "coding-agent") return ["filesystem_write", "shell_execution", "secret_exposure"];
  if (template === "browser-agent") return ["browser_session_access", "web_action_execution"];
  if (template === "mcp-network") return ["remote_service_access", "tool_action_execution"];
  if (template === "sdk-network") return ["credential_handling", "remote_api_calls"];
  return ["code_execution", "tool_action_execution", "credential_handling"];
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
