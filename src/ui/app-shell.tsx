import { Tag } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { IdentityMenu } from "./identity-menu.js";

export type Page = "tools" | "evaluation";

export function AppShell({ activePage, releaseId, onPageChange, children }: { activePage: Page; releaseId: string; onPageChange: (page: Page) => void; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#edf2f0] text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-md">
        <div className="mx-auto grid h-16 max-w-[1480px] grid-cols-[1fr_auto_1fr] items-center px-5 md:px-8">
          <div className="flex items-center gap-3 text-base font-semibold tracking-tight uppercase"><img src="/logo.svg" alt="" aria-hidden="true" className="h-8 w-auto" /><strong>Agent / Radar</strong></div>
          <nav aria-label="Primary navigation" className="radar-navigation flex h-full items-center gap-2">
            {(["tools", "evaluation"] as const).map((page) => (
              <Button aria-current={activePage === page ? "page" : undefined} key={page} onClick={() => onPageChange(page)} variant="nav">
                {page === "tools" ? "Tools" : "Evaluation"}
              </Button>
            ))}
          </nav>
          <div className="flex items-center justify-self-end gap-2 text-muted-foreground"><span className="flex items-center gap-1 font-mono text-sm font-semibold"><Tag className="size-4" />{releaseId}</span><IdentityMenu /></div>
        </div>
      </header>
      {children}
    </main>
  );
}
