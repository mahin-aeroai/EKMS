/**
 * The Basil LFG Partner Portal's own subdomain. Single source of truth for
 * this hostname -- imported by both the edge middleware
 * (supabase-middleware.ts, which rewrites bare paths on this host to the
 * physical /lfg/* files) and the LFG layout (which uses it to decide
 * whether internal Link/router.push targets should be clean or
 * /lfg-prefixed -- see lfg-links.ts). Direct structural mirror of
 * portal-host.ts -- keeping it in one file means the two never drift.
 */
export const LFG_HOST = "portal.lfg.mmdi.in";
