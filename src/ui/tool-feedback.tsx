import { ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { issueUrl } from "./feedback-client.js";
import { useFeedback } from "./feedback-provider.js";
import { dismissFeedbackDetailsDialog } from "./feedback-state.js";

export function ToolFeedback({ toolId }: { toolId: string }) {
  const feedback = useFeedback(); const { load } = feedback; const summary = feedback.summaries[toolId]; const [manualDialogOpen, setManualDialogOpen] = useState(false); const [manualVote, setManualVote] = useState<"up" | "down">("up");
  useEffect(() => load(toolId), [load, toolId]);
  const oauthVote = feedback.oauthFeedbackToolId === toolId ? summary?.viewer_vote : null;
  const oauthDialogOpen = Boolean(oauthVote);
  const dialogOpen = manualDialogOpen || oauthDialogOpen;
  const lastVote = oauthVote ?? manualVote;
  async function vote(next: "up" | "down") { setManualVote(next); const result = await feedback.vote(toolId, next); if (result.changed) setManualDialogOpen(true); }
  function setDialogOpen(open: boolean) {
    if (open) { setManualDialogOpen(true); return; }
    dismissFeedbackDetailsDialog({ toolId, oauthDialogOpen, closeManualDialog: () => setManualDialogOpen(false), consumeOAuthFeedback: feedback.consumeOAuthFeedback });
  }
  return <section aria-label="Tool feedback" className="mt-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-muted/45 p-4">
    <span className="mr-auto text-sm font-medium">Feedback</span>
    <Button aria-label="Thumbs up" aria-pressed={summary?.viewer_vote === "up"} onClick={() => void vote("up")} variant="outline"><ThumbsUp data-icon="inline-start" />{summary?.up ?? 0}</Button>
    <Button aria-label="Thumbs down" aria-pressed={summary?.viewer_vote === "down"} onClick={() => void vote("down")} variant="outline"><ThumbsDown data-icon="inline-start" />{summary?.down ?? 0}</Button>
    {feedback.errors[toolId] ? <p className="basis-full text-sm text-destructive" role="alert">{feedback.errors[toolId]}</p> : null}
    <Dialog onOpenChange={setDialogOpen} open={dialogOpen}><DialogContent><DialogHeader><DialogTitle>Add details on GitHub?</DialogTitle><DialogDescription>Your vote is saved. You can optionally explain what worked or what should improve in a structured GitHub issue.</DialogDescription></DialogHeader><DialogFooter showCloseButton><Button onClick={() => setDialogOpen(false)} render={<a href={issueUrl({ toolId, vote: lastVote, release: feedback.version.release_id, dataVersion: feedback.version.data_version })} rel="noreferrer" target="_blank" />}>Add details</Button></DialogFooter></DialogContent></Dialog>
  </section>;
}
