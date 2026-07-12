export const FEEDBACK_RULES_VERSION = "feedback_rules.v0.1" as const;
export const FEEDBACK_CLASSIFIER_VERSION = "feedback_classifier.v0.1" as const;

export const PROCESSING_LABELS = [
  "feedback-accepted",
  "feedback-rejected",
  "feedback-needs-human-review",
  "feedback-deprecated",
] as const;

export type FeedbackVote = "up" | "down";
export type FeedbackDecision = "accepted" | "rejected" | "needs-human-review";
export type FeedbackReasonCode =
  | "valid_experience"
  | "invalid_context"
  | "insufficient_information"
  | "security_sensitive"
  | "conflicting_evidence";

export interface GitHubIssueSnapshot {
  number: number;
  html_url: string;
  user: { id: number } | null;
  state: "open" | "closed";
  created_at: string;
  updated_at: string;
  title: string;
  body: string | null;
  labels: string[];
}

export interface ParsedFeedbackIssue {
  issue_number: number;
  issue_url: string;
  github_user_id: number;
  tool_id: string;
  vote: FeedbackVote;
  reason: string;
  created_at: string;
  updated_at: string;
  processing_labels: string[];
}

