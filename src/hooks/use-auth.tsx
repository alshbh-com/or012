import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { initOneSignal, osLogin, osLogout } from "@/lib/onesignal";

export type AppRole = "admin" | "restaurant" | "driver";

interface AuthState {
  user: User | null;
  session: Session | null;
  roles: AppRole[];
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthCtx = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const lastUserId = useRef<string | null>(null);

  const loadRoles = async (userId: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    setRoles((data ?? []).map((r) => r.role as AppRole));
  };

  useEffect(() => {
    let mounted = true;
    try { initOneSignal(); } catch (e) { console.warn("OneSignal init failed", e); }

    // 1) Restore session first (await both session + roles before clearing loading)
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(data.session);
      if (data.session?.user) {
        lastUserId.current = data.session.user.id;
        try { osLogin(data.session.user.id); } catch { /* noop */ }
        await loadRoles(data.session.user.id);
      }
      setLoading(false);
    })();

    // 2) Listen for FUTURE auth changes only (sign in / sign out / token refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      // Ignore the initial session event — getSession() handles it above.
      if (event === "INITIAL_SESSION") return;
      // Token refresh keeps the same user; don't reset roles or loading
      if (event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
        setSession(s);
        return;
      }
      setSession(s);
      if (s?.user) {
        if (lastUserId.current !== s.user.id) {
          lastUserId.current = s.user.id;
          try { osLogin(s.user.id); } catch { /* noop */ }
          loadRoles(s.user.id);
        }
      } else {
        lastUserId.current = null;
        try { osLogout(); } catch { /* noop */ }
        setRoles([]);
      }
    });

    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  };

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthCtx.Provider value={{ user: session?.user ?? null, session, roles, loading, signIn, signOut }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export function primaryRole(roles: AppRole[]): AppRole | null {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("restaurant")) return "restaurant";
  if (roles.includes("driver")) return "driver";
  return null;
}
