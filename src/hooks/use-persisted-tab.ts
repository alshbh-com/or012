import { useEffect, useState } from "react";

/** Persists the active tab name to localStorage so a refresh stays on the same view. */
export function usePersistedTab(key: string, initial: string): [string, (v: string) => void] {
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try { return window.localStorage.getItem(key) || initial; } catch { return initial; }
  });
  useEffect(() => {
    try { window.localStorage.setItem(key, tab); } catch { /* ignore */ }
  }, [key, tab]);
  return [tab, setTab];
}
