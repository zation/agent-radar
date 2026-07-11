import { useCallback, useEffect, useRef, useState } from "react";

export function useMobileDrillIn(kind: "tool" | "evaluation") {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia("(max-width: 899px)").matches);
  const [detailOpen, setDetailOpen] = useState(false);
  const scrollPosition = useRef(0);
  const origin = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 899px)");
    const onChange = () => { setIsMobile(media.matches); if (!media.matches) setDetailOpen(false); };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setDetailOpen(false);
      requestAnimationFrame(() => { window.scrollTo({ top: scrollPosition.current }); origin.current?.focus(); });
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openDetail = useCallback((id: string, element: HTMLElement) => {
    if (!isMobile) return;
    scrollPosition.current = window.scrollY;
    origin.current = element;
    window.history.pushState({ agentRadarDetail: kind, id }, "");
    setDetailOpen(true);
    window.scrollTo({ top: 0 });
  }, [isMobile, kind]);

  const closeDetail = useCallback(() => {
    const state: unknown = window.history.state;
    if (isDetailHistoryState(state, kind)) window.history.back();
    else setDetailOpen(false);
  }, [kind]);

  return { isMobile, detailOpen, openDetail, closeDetail };
}

function isDetailHistoryState(value: unknown, kind: "tool" | "evaluation"): boolean {
  return typeof value === "object" && value !== null && "agentRadarDetail" in value && value.agentRadarDetail === kind;
}
