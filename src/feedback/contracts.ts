export type Vote = "up" | "down";

export interface ViewerIdentity {
  github_user_id: string;
  github_login: string;
}

export interface FeedbackSummary {
  tool_id: string;
  up: number;
  down: number;
  viewer_vote: Vote | null;
}

export interface VoteMutation {
  user: ViewerIdentity;
  toolId: string;
  vote: Vote | null;
}

export interface FeedbackStore {
  getSummary(toolId: string, viewerId?: string): Promise<FeedbackSummary>;
  mutateVote(mutation: VoteMutation, now?: Date): Promise<FeedbackSummary>;
}
