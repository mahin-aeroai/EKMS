import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase env vars are not set (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). " +
      "Data-backed workspaces will fail to fetch until these are configured."
  );
}

// createBrowserClient throws immediately if given an empty string, and every
// page in this app (including Next's auto-generated /_not-found) renders
// through AppShell, which imports this module -- so a missing env var used
// to fail the ENTIRE production build, not just the Supabase-backed pages.
// Falling back to harmless placeholder values keeps the build (and every
// non-Supabase page, like the Cut File Tool) working even if these vars are
// ever unset; real Supabase calls will simply fail at runtime with a clear
// network/auth error instead of taking the whole site down at build time.
const FALLBACK_SUPABASE_URL = "https://placeholder.supabase.co";
const FALLBACK_SUPABASE_ANON_KEY = "placeholder-anon-key";

/**
 * Shared browser-safe Supabase client — for Client Components ("use client")
 * only. Built with createBrowserClient from @supabase/ssr so it automatically
 * reads/writes the auth session cookie set by /login and refreshed by
 * middleware.ts. Every read/write from this client runs as the signed-in
 * user, which matters now that RLS policies require
 * `auth.role() = 'authenticated'` instead of being wide open.
 *
 * Server Components must NOT import this — they need a per-request client
 * that can see the incoming request's cookies. Use
 * `createServerSupabaseClient()` from "@/lib/supabase-server" instead (see
 * src/app/workspaces/customer/page.tsx for the pattern).
 *
 * Row/table types (CustomerRow, JobOrderRow, etc.) live in
 * "@mmdi/shared/rows" now, shared with the Expo app.
 */
export const supabase = createBrowserClient(
  supabaseUrl || FALLBACK_SUPABASE_URL,
  supabaseAnonKey || FALLBACK_SUPABASE_ANON_KEY
);
