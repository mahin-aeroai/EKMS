/**
 * Plain, no-directive helper shared by both portal-links.ts (the Client
 * Component Context/hook) and any Server Component /portal/* page that
 * builds a Link href directly (using portal-host-server.ts's
 * getOnPortalHost() instead of the hook, since Context doesn't reach
 * Server Components). Kept in its own file with no "use client" so it can
 * be imported from either side without pulling in React Context machinery.
 */

/**
 * Builds a portal-internal href from a bare, /portal-less path (e.g.
 * "/orders/123", "/", "/login") -- clean on portal.mmdi.in, /portal-
 * prefixed everywhere else. Every internal Link/router.push within the
 * customer portal should go through this rather than hardcoding either
 * form directly, so the same component/page works correctly regardless of
 * which host it's rendered on.
 */
export function portalHref(path: string, onPortalHost: boolean): string {
  if (onPortalHost) return path;
  return path === "/" ? "/portal" : `/portal${path}`;
}
