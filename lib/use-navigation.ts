"use client";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
// Navigation remains local to the app; URLs shared with friends still open Home.
export function useNavigation<T extends string>(
  initial: T,
  valid: readonly T[],
) {
  const [tab, setTab] = useState<T>(initial);
  const current = useRef(initial);
  const positions = useRef<Record<string, number>>({});
  const restored = useRef(0);
  useEffect(() => {
    const before = history.scrollRestoration;
    history.scrollRestoration = "manual";
    history.replaceState(
      { ...history.state, crewTab: initial, crewScroll: 0 },
      "",
    );
    const pop = (event: PopStateEvent) => {
      const next = event.state?.crewTab;
      if (!valid.includes(next)) return;
      positions.current[current.current] = window.scrollY;
      restored.current =
        event.state?.crewScroll || positions.current[next] || 0;
      current.current = next;
      setTab(next);
    };
    window.addEventListener("popstate", pop);
    return () => {
      history.scrollRestoration = before;
      window.removeEventListener("popstate", pop);
    };
  }, [initial, valid]);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() =>
      window.scrollTo({ top: restored.current, behavior: "instant" }),
    );
    return () => cancelAnimationFrame(frame);
  }, [tab]);
  const navigate = useCallback((next: T) => {
    if (next === current.current) return;
    positions.current[current.current] = window.scrollY;
    const isDialog = !!history.state?.crewDialog;
    const base = { ...history.state };
    delete base.crewDialog;
    if (!isDialog)
      history.replaceState(
        { ...base, crewTab: current.current, crewScroll: window.scrollY },
        "",
      );
    const entry = {
      ...base,
      crewTab: next,
      crewScroll: positions.current[next] || 0,
    };
    if (isDialog) history.replaceState(entry, "");
    else history.pushState(entry, "");
    restored.current = positions.current[next] || 0;
    current.current = next;
    setTab(next);
  }, []);
  return [tab, navigate] as const;
}
