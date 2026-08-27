/**
 * Plain, no-directive helper shared by both lfg-links.ts (the Client
 * Component Context/hook) and any Server Component /lfg/* page that
 * builds a Link href directly (using lfg-host-server.ts's getOnLfgHost()
 * instead of the hook, since Context doesn't reach Server Components).
 * Direct mirror of portal-links-shared.ts.
 */

/**
 * Builds an LFG-portal-internal href from a bare, /lfg-less path (e.g.
 * "/sites/123", "/", "/login") -- clean on lfgconnect.mmdi.in, /lfg-
 * prefixed everywhere else. Every internal Link/router.push within the
 * LFG partner portal should go through this rather than hardcoding either
 * form directly.
 */
export function lfgHref(path: string, onLfgHost: boolean): string {
  if (onLfgHost) return path;
  return path === "/" ? "/lfg" : `/lfg${path}`;
}
