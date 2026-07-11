import { Bot, Tag } from "lucide-react";
import type { ReactNode } from "react";

export type Page = "tools" | "evaluation";

export function AppShell({ activePage, releaseId, onPageChange, children }: { activePage: Page; releaseId: string; onPageChange: (page: Page) => void; children: ReactNode }) {
  return (
    <main className="radar-shell">
      <header className="radar-topbar">
        <div className="radar-topbar-inner">
          <div className="radar-brand"><span className="radar-mark"><Bot /></span><strong>Agent / Radar</strong></div>
          <nav aria-label="Primary navigation" className="radar-nav">
            {(["tools", "evaluation"] as const).map((page) => (
              <button aria-current={activePage === page ? "page" : undefined} className={activePage === page ? "is-active" : ""} key={page} onClick={() => onPageChange(page)} type="button">
                {page === "tools" ? "Tools" : "Evaluation"}
              </button>
            ))}
          </nav>
          <div className="radar-release"><Tag />{releaseId}</div>
        </div>
      </header>
      {children}
    </main>
  );
}
