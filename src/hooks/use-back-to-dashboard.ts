import { useEffect } from "react";

/**
 * Intercepts the device back button (Android / Median WebView) so it never
 * exits the app. If the user is not on the dashboard tab, switch to dashboard;
 * otherwise re-push the history entry so the navigation is swallowed.
 */
export function useBackToDashboard(currentTab: string, goDashboard: () => void) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Seed a history entry we can "consume" with the first back press.
    try { window.history.pushState({ keep: true }, "", window.location.href); } catch { /* noop */ }
    const onPop = () => {
      if (currentTab !== "dashboard") goDashboard();
      // Re-push so the next back press is also captured (don't let app exit).
      try { window.history.pushState({ keep: true }, "", window.location.href); } catch { /* noop */ }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [currentTab, goDashboard]);
}
