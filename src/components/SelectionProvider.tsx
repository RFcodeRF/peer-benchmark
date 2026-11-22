"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { LivePeer } from "@/lib/types";

type Tab = "tab1" | "tab2";

interface SelectionState {
  tab1: string[];
  tab2: string[];
  live: LivePeer[];
}

interface SelectionApi extends SelectionState {
  isOn: (tab: Tab, id: string) => boolean;
  toggle: (tab: Tab, id: string) => void;
  reset: () => void;
  addLive: (p: LivePeer) => void;
  removeLive: (id: string) => void;
  isDefault: boolean;
}

const Ctx = createContext<SelectionApi | null>(null);
const KEY = "peer-benchmark-auswahl-v1";

export function SelectionProvider({ defaults, children }: { defaults: { tab1: string[]; tab2: string[] }; children: React.ReactNode }) {
  const initial: SelectionState = { tab1: defaults.tab1, tab2: defaults.tab2, live: [] };
  const [state, setState] = useState<SelectionState>(initial);
  const [loaded, setLoaded] = useState(false);

  // Session only: a new visitor always sees the default group.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as SelectionState;
        if (Array.isArray(parsed.tab1) && Array.isArray(parsed.tab2)) setState({ ...parsed, live: parsed.live ?? [] });
      }
    } catch {
      // storage not available: keep defaults
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      sessionStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      // ignore
    }
  }, [state, loaded]);

  const toggle = useCallback((tab: Tab, id: string) => {
    setState((s) => {
      const list = s[tab];
      return { ...s, [tab]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] };
    });
  }, []);

  const reset = useCallback(() => setState({ tab1: defaults.tab1, tab2: defaults.tab2, live: [] }), [defaults]);

  const addLive = useCallback((p: LivePeer) => {
    setState((s) => {
      const live = [...s.live.filter((l) => l.peer.id !== p.peer.id), p];
      const tab1 = p.peer.tab1.eligible && !s.tab1.includes(p.peer.id) ? [...s.tab1, p.peer.id] : s.tab1;
      const tab2 = p.peer.tab2.eligible && !s.tab2.includes(p.peer.id) ? [...s.tab2, p.peer.id] : s.tab2;
      return { tab1, tab2, live };
    });
  }, []);

  const removeLive = useCallback((id: string) => {
    setState((s) => ({ tab1: s.tab1.filter((x) => x !== id), tab2: s.tab2.filter((x) => x !== id), live: s.live.filter((l) => l.peer.id !== id) }));
  }, []);

  const api = useMemo<SelectionApi>(() => {
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((x) => b.includes(x));
    return {
      ...state,
      isOn: (tab, id) => state[tab].includes(id),
      toggle,
      reset,
      addLive,
      removeLive,
      isDefault: same(state.tab1, defaults.tab1) && same(state.tab2, defaults.tab2) && state.live.length === 0,
    };
  }, [state, toggle, reset, addLive, removeLive, defaults]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useSelection() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useSelection outside provider");
  return c;
}
