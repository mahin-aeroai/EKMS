import { createContext, useContext, useEffect, useState, type PropsWithChildren } from "react";
import type { AuthSession } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/**
 * Session context for the whole app. Every tab's "Not signed in" error (see
 * lib/copilot.ts's authHeader, and the direct supabase.from(...) calls in
 * surveys/documents) comes from there being no session at all yet -- this is
 * what produces one.
 *
 * Mirrors the web app's auth (email + password via supabase.auth), minus the
 * TOTP/MFA step-up in src/app/login/page.tsx -- that's a real gap for anyone
 * with MFA enrolled, out of scope for this first pass.
 */

interface AuthContextValue {
  session: AuthSession | null;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useSession() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useSession must be used within a SessionProvider");
  return ctx;
}

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string): Promise<string | null> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return <AuthContext.Provider value={{ session, isLoading, signIn, signOut }}>{children}</AuthContext.Provider>;
}
