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

// 10 Sept 2026: EVERY page that reads/writes Supabase from the browser
// (not just login) turned out to hit the same net::ERR_QUIC_PROTOCOL_ERROR
// reported on Mahin's Windows/corporate-network team -- confirmed via
// DevTools on the login pages first (see authRetry.ts and the /api/auth/*
// routes), and confirmed again once Mahin reported those fixes alone
// weren't enough: "whenever database is linked those pages are broken".
// Makes sense -- the auth-specific fixes only covered the login flow's own
// direct browser -> <project>.supabase.co calls; every OTHER page's data
// reads/writes go through THIS shared client, straight to the same
// Cloudflare-fronted host, over the same broken QUIC path.
//
// Root fix instead of patching endpoint by endpoint: route every browser
// call this client makes through our own domain instead. `/api/supabase-
// proxy/[...path]/route.ts` transparently forwards any request to the real
// Supabase URL server-side (Vercel's network, unaffected by the user's
// local network), so setting THIS client's url to a same-origin path makes
// literally every auth/rest call it issues same-origin -- no code at any
// of the dozens of call sites across the app needs to change.
//
// The one thing that must NOT change: the cookie/localStorage key this
// client stores its session under. @supabase/ssr derives that key from the
// project ref in whatever URL is passed to it (`sb-<ref>-auth-token`) --
// if left to auto-derive from the proxy path above, it'd compute a
// DIFFERENT key from this app's own hostname instead of the real project
// ref, while every server-side client (supabase-server.ts, supabase-
// middleware.ts, supabase-route.ts) keeps deriving the original key from
// the real NEXT_PUBLIC_SUPABASE_URL (they're unchanged, still calling
// Supabase directly -- server-to-server has no QUIC problem to route
// around). A key mismatch would mean the browser writes its session under
// one cookie name and the server reads a different one -- everyone would
// silently look signed out. cookieOptions.name below pins this client's
// key to the SAME derivation, from the SAME real URL, so it always matches
// regardless of which URL is actually used for network calls.
function deriveAuthCookieName(url: string): string {
  try {
    return `sb-${new URL(url).hostname.split(".")[0]}-auth-token`;
  } catch {
    return "sb-placeholder-auth-token";
  }
}
const authCookieName = deriveAuthCookieName(supabaseUrl || FALLBACK_SUPABASE_URL);

// Only ever same-origin in the browser (where window exists and the fetch
// actually happens); the real URL is an inert fallback for the
// server-rendered pass of this "use client" module, which never issues
// network calls itself.
const browserSupabaseUrl =
  typeof window !== "undefined"
    ? `${window.location.origin}/api/supabase-proxy`
    : supabaseUrl || FALLBACK_SUPABASE_URL;

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
  browserSupabaseUrl,
  supabaseAnonKey || FALLBACK_SUPABASE_ANON_KEY,
  {
    cookieOptions: {
      name: authCookieName,
    },
    auth: {
      // @supabase/ssr's createBrowserClient defaults flowType to "pkce",
      // which expects invite/recovery links to carry a `?code=` query param
      // that the app then exchanges server-side via exchangeCodeForSession.
      // Nothing in this codebase implements that exchange -- every login
      // page (/login, /portal/login, /lfg/login) instead reads the OLDER
      // implicit-flow hash fragment directly (`#access_token=...&type=
      // recovery`, see e.g. initialModeFromUrl() and the manual setSession()
      // fallback in each of those files). Under the pkce default, an
      // invite/recovery link either arrives with no hash at all (nothing to
      // detect, so those pages fall straight through to plain sign-in with
      // no error -- the exact "never got a chance to set a password" bug
      // this fixes) or with a hash the client isn't configured to auto-
      // process. Forcing "implicit" here makes the client's behavior match
      // what every one of those pages was already written to expect.
      flowType: "implicit",

      // A second, separate bug found alongside the flowType one, 1 Sep
      // 2026: even with flowType set correctly above, invite/recovery
      // links STILL fell through to plain sign-in with no password
      // prompt -- confirmed via Supabase's own auth logs, which showed a
      // "login" event firing reliably ~6-10 seconds after every single
      // recovery request (proving a session WAS being established from
      // the token every time) but never a subsequent "user_updated"
      // (password change) event, across many repeated attempts.
      //
      // Cause: by default (detectSessionInUrl: true), the client
      // automatically parses and consumes any access_token/refresh_token
      // in the URL hash the moment it's constructed -- and, on success,
      // immediately strips the hash from the address bar via
      // history.replaceState. Every login page ALSO does its own manual
      // hash handling (initialModeFromUrl() reading window.location.hash
      // to decide whether to show sign-in vs. set-password, plus a manual
      // setSession() call -- see e.g. lfg/login/page.tsx's comment on why
      // that manual path exists: "for in-app browsers that don't auto-
      // detect the hash"). Both of these were racing to read the same
      // one-time hash. The library's automatic version was consistently
      // winning -- quietly creating the session (hence "login" firing
      // every time) and clearing the hash before each page's own
      // initialModeFromUrl() lazy-state read ever ran, so mode always
      // resolved to "sign-in" instead of "set-password" despite a
      // perfectly valid token having just been consumed.
      //
      // Fix: turn off the automatic version entirely. Every login page's
      // manual handling is already complete and correct on its own (it
      // was written to not depend on the automatic path in the first
      // place) -- this just removes the competing automatic listener so
      // the manual code is the only thing that ever touches the hash.
      detectSessionInUrl: false,
    },
  }
);
