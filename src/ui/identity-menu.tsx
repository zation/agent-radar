import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFeedback } from "./feedback-provider.js";

export function IdentityMenu() {
  const { user, signIn, signOut } = useFeedback();
  if (!user) return <Button onClick={() => signIn()} size="sm" variant="ghost"><LogIn data-icon="inline-start" />Sign in</Button>;
  return <div className="flex items-center gap-1"><span className="max-w-36 truncate text-sm font-medium">@{user.github_login}</span><Button aria-label="Sign out" onClick={() => void signOut()} size="icon-sm" variant="ghost"><LogOut /></Button></div>;
}
