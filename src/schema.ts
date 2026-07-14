export type Confidence = "high" | "medium" | "low" | "unknown";
export type ToolType = "mcp" | "skill" | "agent" | "framework" | "cli" | "prompt" | "rules" | "dataset" | "service";
export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type TrustLevel = "official" | "well_known_org" | "active_open_source" | "individual" | "commercial" | "unknown";
export type RecommendationLevel = "recommended" | "consider" | "situational" | "avoid" | "insufficient_evidence";
export type RecommendedAction = "use" | "compare" | "ask_human" | "avoid" | "no_reliable_match";
export type SafetyReasonCode =
  | "permission_unknown" | "trust_unknown" | "filesystem_read" | "filesystem_write"
  | "network_access" | "browser_control" | "email_access" | "database_read"
  | "database_write" | "cloud_access" | "cloud_admin" | "payment_access"
  | "shell_execution" | "code_execution" | "secrets_access"
  | "permission_not_allowed" | "risk_tolerance_exceeded" | "unknown_trust_code_execution";
export type SourceType = "official_registry" | "official_docs" | "github" | "package_registry" | "community_list" | "news" | "manual";
export type CollectionMethod = "api" | "http" | "git_clone" | "manual" | "rss";

export interface GitHubDiscoveryConfig {
  query: string;
  sort: "stars";
  order: "desc";
  repository_limit: number;
  expansion?: {
    kind: "skill_manifests";
    root: "skills/";
    manifest: "SKILL.md";
  };
}

export interface InstallMethod {
  method: "npm" | "pip" | "brew" | "docker" | "source" | "hosted" | "manual" | "unknown";
  command: string;
  docs_url: string;
  confidence: Confidence;
}

export interface Permission {
  scope:
    | "filesystem"
    | "network"
    | "browser"
    | "email"
    | "database"
    | "cloud"
    | "payment"
    | "shell"
    | "code_execution"
    | "secrets"
    | "unknown";
  access: "read" | "write" | "read_write" | "execute" | "admin" | "unknown";
  required: boolean;
  notes: string;
}

export interface Maintenance {
  status: "active" | "slow" | "inactive" | "deprecated" | "unknown";
  last_release_at?: string;
  last_commit_at?: string;
  issue_activity: "active" | "limited" | "inactive" | "unknown";
  maintainer_type: "official" | "company" | "community" | "individual" | "unknown";
  signals: string[];
}

export interface Security {
  risk_level: RiskLevel;
  trust_level: TrustLevel;
  known_risks: string[];
  requires_human_approval: boolean;
  security_notes: string;
}

export interface ToolCard {
  id: string;
  schema_version: "tool_card.v1";
  name: string;
  type: ToolType;
  secondary_types?: ToolType[];
  summary: string;
  source_urls: string[];
  repo_url?: string;
  homepage_url?: string;
  docs_url?: string;
  package_urls?: string[];
  license?: string;
  primary_purpose: string;
  use_cases: string[];
  not_for: string[];
  tags: string[];
  supported_agents?: string[];
  runtime_requirements?: Record<string, string>;
  install_methods: InstallMethod[];
  auth_required: "none" | "api_key" | "oauth" | "account" | "unknown";
  permissions: Permission[];
  maintenance: Maintenance;
  security: Security;
  maturity: "experimental" | "beta" | "stable" | "deprecated" | "unknown";
  evidence_refs: string[];
  last_checked_at: string;
  confidence: Confidence;
  created_at: string;
  updated_at: string;
  ai_decision_notes?: {
    when_to_use: string[];
    when_to_avoid: string[];
    questions_to_ask_human: string[];
    safe_defaults: string[];
  };
}

export interface RatingExplanation {
  dimension: string;
  score: number;
  reason: string;
  evidence_refs: string[];
}

export interface RatingResult {
  id: string;
  schema_version: "rating_result.v2";
  tool_id: string;
  tool_type: ToolType;
  rules_version: "rating_rules.v0.2";
  base_score: number;
  overall_score: number;
  feedback_adjustment: FeedbackAdjustment;
  recommendation_level: RecommendationLevel;
  risk_level: RiskLevel;
  dimension_scores: Record<string, number>;
  explanations: RatingExplanation[];
  penalties: string[];
  boosts: string[];
  evidence_quality: Confidence;
  rated_at: string;
}

export interface FeedbackAdjustment {
  d1: number;
  accepted_issues: number;
  raw: number;
  applied: number;
  cap: 3;
  rules_version: "feedback_rules.v0.1";
  vote_snapshot_checksum: `sha256:${string}`;
  accepted_issue_ids: number[];
}

export interface RecommendationQuery {
  task: string;
  language_or_stack?: string[];
  environment?: string[];
  preferred_tool_types?: ToolType[];
  allowed_permissions?: string[];
  risk_tolerance?: "low" | "medium" | "high";
  existing_tools?: string[];
  budget?: string;
  output_format?: "json" | "markdown";
  top_k?: number;
}

export interface QueryUnderstanding {
  intent: string;
  task_domains: string[];
  required_capabilities: string[];
  likely_permissions: string[];
  tool_type_hints: ToolType[];
  risk_flags: string[];
  confidence: Confidence;
}

export interface RecommendationCandidate {
  tool_id: string;
  name: string;
  rank: number;
  recommendation_level: RecommendationLevel;
  fit_score: number;
  risk_level: RiskLevel;
  tags: string[];
  why: string[];
  risks: string[];
  not_for: string[];
  next_steps: string[];
  evidence_refs: string[];
}

export interface RecommendationSafetyAssessment {
  risk_level: RiskLevel;
  reason_codes: SafetyReasonCode[];
  requires_human_approval: boolean;
  approval_reason?: string;
  confirmation_questions: string[];
  safe_defaults: string[];
  maximum_allowed_action: RecommendedAction;
}

export interface RejectedCandidate {
  tool_id: string;
  reason: string;
}

export interface RecommendationResult {
  id: string;
  schema_version: "recommendation_result.v2";
  release: { release_id: string; commit_sha: string };
  query: RecommendationQuery;
  query_understanding: QueryUnderstanding;
  recommended_action: RecommendedAction;
  safety_assessment: RecommendationSafetyAssessment;
  candidates: RecommendationCandidate[];
  rejected_candidates: RejectedCandidate[];
  no_match_reason?: string;
}

export interface SearchDocument {
  tool_id: string;
  text: string;
  tags: string[];
  type: ToolType;
  rating_overall: number;
  risk_level: RiskLevel;
  confidence: Confidence;
}

export interface SearchIndex {
  schema_version: "search_index.v1";
  built_at: string;
  documents: SearchDocument[];
}

export interface EvalCase {
  id: string;
  schema_version: "eval_case.v1";
  category: "recommendation" | "safety" | "rating";
  query: RecommendationQuery;
  expected: {
    acceptable_tool_types?: ToolType[];
    must_include_tags?: string[];
    must_warn_permissions?: string[];
    recommended_action?: RecommendedAction;
    minimum_risk_level?: RiskLevel;
    requires_human_approval?: boolean;
    must_include_reason_codes?: SafetyReasonCode[];
    must_include_confirmation_questions?: boolean;
    must_include_safe_defaults?: boolean;
    should_not_recommend?: string[];
  };
  review_notes: string;
  severity: "critical" | "major" | "minor";
  owner: string;
  updated_at: string;
}

export interface SourceDefinition {
  id: string;
  name: string;
  url: string;
  source_type: SourceType;
  covered_tool_types: ToolType[];
  collection_method: CollectionMethod;
  recommended_frequency: "daily" | "weekly" | "monthly" | "manual";
  trust_level: TrustLevel;
  field_coverage: string[];
  rate_limits?: string;
  terms_notes: string;
  access_review?: {
    robots_txt: "reviewed" | "not_applicable";
    terms: "reviewed" | "not_applicable";
    reviewed_by: string;
    reviewed_at: string;
    notes: string;
  };
  parser?: string;
  github_discovery?: GitHubDiscoveryConfig;
  profile?: {
    tool_id?: string;
    name?: string;
    type?: ToolType;
    secondary_types?: ToolType[];
    summary?: string;
    tags?: string[];
    primary_purpose?: string;
    use_cases?: string[];
    not_for?: string[];
    supported_agents?: string[];
    install_methods?: InstallMethod[];
    auth_required?: ToolCard["auth_required"];
    permissions?: Permission[];
    security?: Security;
    maturity?: ToolCard["maturity"];
    docs_url?: string;
    homepage_url?: string;
    maintenance?: Partial<Maintenance>;
    ai_decision_notes?: ToolCard["ai_decision_notes"];
  };
  failure_policy: string;
  enabled: boolean;
  owner?: string;
  last_reviewed_at: string;
}

export interface RawSourceSnapshot {
  id: string;
  schema_version: "raw_snapshot.v1";
  source_id: string;
  source_url: string;
  fetched_at: string;
  fetch_method: "http" | "api" | "manual" | "file_import";
  status: "success" | "partial" | "failed";
  http_status?: number;
  content_type?: string;
  content_hash: string;
  content_path: string;
  request_meta?: Record<string, string>;
  error?: {
    code: string;
    message: string;
  };
}

export interface SourceRecord {
  id: string;
  schema_version: "source_record.v1";
  snapshot_id: string;
  source_id: string;
  record_type: "repository" | "package" | "registry_entry" | "doc_page" | "list_item" | "manual";
  name: string;
  description?: string;
  urls: string[];
  raw_fields: Record<string, unknown>;
  parsed_fields: Record<string, unknown>;
  source_confidence: Confidence;
  parsed_at: string;
  parser_version: string;
  warnings?: string[];
}
