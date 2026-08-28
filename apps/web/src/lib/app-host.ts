/**
 * The main internal app's own production host -- where MMDI staff sign in
 * (src/app/login/page.tsx). Single source of truth for this hostname,
 * mirroring portal-host.ts/lfg-host.ts, so the LFG partner login page's
 * "Sign in as an MMDI employee" link can't drift from it.
 *
 * Deliberately NOT used by supabase-middleware.ts, which keeps its own
 * private LEGACY_APP_HOST for this exact same value -- that one is
 * load-bearing canonicalize-redirect logic (see its own comment); this one
 * is just for a plain cross-surface link between the two login pages.
 */
export const APP_HOST = "app.mmdi.in";
