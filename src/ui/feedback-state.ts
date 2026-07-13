import type { FeedbackSummary, Vote } from "../feedback/contracts.js";

export function optimisticVote(summary: FeedbackSummary, next: Vote | null): FeedbackSummary {
  const result = { ...summary };
  if (summary.viewer_vote === "up") result.up -= 1;
  if (summary.viewer_vote === "down") result.down -= 1;
  if (next === "up") result.up += 1;
  if (next === "down") result.down += 1;
  result.viewer_vote = next;
  return result;
}

export function parseOAuthFeedbackReturn(value: string): { toolId: string } | null {
  const url = new URL(value);
  const toolId = url.searchParams.get("tool");
  return url.searchParams.get("feedback") === "applied" && toolId ? { toolId } : null;
}

export function dismissFeedbackDetailsDialog(input: {
  toolId: string;
  oauthDialogOpen: boolean;
  closeManualDialog: () => void;
  consumeOAuthFeedback: (toolId: string) => void;
}): void {
  input.closeManualDialog();
  if (input.oauthDialogOpen) input.consumeOAuthFeedback(input.toolId);
}
