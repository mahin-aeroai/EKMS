import { headers } from "next/headers";
import { PORTAL_HOST } from "./portal-host";

/**
 * Server-Component counterpart to portal-links.ts's usePortalHost() --
 * Context doesn't reach Server Components (only their Client Component
 * descendants), so any /portal/* page that is itself a Server Component
 * and builds a Link href needs to read the request host directly. Kept in
 * its own file (rather than portal-host.ts) because next/headers pulls in
 * Node/Server-only bits that have no business being imported from the Edge
 * middleware, which only needs the bare PORTAL_HOST string.
 */
export async function getOnPortalHost(): Promise<boolean> {
  const hostHeader = (await headers()).get("host") ?? "";
  return hostHeader === PORTAL_HOST;
}
