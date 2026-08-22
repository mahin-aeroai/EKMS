/**
 * The Customer Portal's own subdomain. Single source of truth for this
 * hostname -- imported by both the edge middleware (supabase-middleware.ts,
 * which rewrites bare paths on this host to the physical /portal/* files)
 * and the portal layout (which uses it to decide whether internal
 * Link/router.push targets should be clean or /portal-prefixed -- see
 * portal-links.ts). Keeping it in one file means the two never drift.
 */
export const PORTAL_HOST = "portal.mmdi.in";
