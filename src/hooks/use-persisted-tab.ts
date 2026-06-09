import { useEffect, useState } from "react";

/**
 * Persists the active tab to sessionStorage so a refresh keeps the same view,
 * but a cold app launch (or sign-out) returns to the default tab.
 */
export function usePersistedTab(key: string, initial: string): [string, (v: string) => void] {
  const [tab, setTab] = useState<string>(() => {
    if (typeof window === "undefined") return initial;
    try { return window.sessionStorage.getItem(key) || initial; } catch { return initial; }
  });
  useEffect(() => {
    try { window.sessionStorage.setItem(key, tab); } catch { /* ignore */ }
  }, [key, tab]);
  return [tab, setTab];
}
