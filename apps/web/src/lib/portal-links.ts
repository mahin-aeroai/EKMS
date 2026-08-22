"use client";

import { createContext, useContext } from "react";

export { portalHref } from "./portal-links-shared";

/**
 * Whether the current request is being served from the portal's own
 * subdomain (portal.mmdi.in) vs. the /portal/* path on another host
 * (app.mmdi.in during the transition window, ekms.vercel.app, or a Vercel
 * preview deployment). Every internal navigation within the customer
 * portal needs to know this to build a URL that's both clean (no /portal
 * prefix) on the subdomain AND still resolves on hosts where the
 * middleware doesn't rewrite it -- see supabase-middleware.ts.
 *
 * Provided once by the server-rendered portal layout (which reads the
 * request's Host header via next/headers) and read from here by every
 * Client Component under /portal/* that builds a Link href or calls
 * router.push. Defaults to false (i.e. /portal-prefixed) so anything that
 * somehow renders without the provider still produces a working link.
 */
export const PortalHostContext = createContext(false);

export function usePortalHost() {
  return useContext(PortalHostContext);
}
