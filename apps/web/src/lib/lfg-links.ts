"use client";

import { createContext, useContext } from "react";

export { lfgHref } from "./lfg-links-shared";

/**
 * Whether the current request is being served from the LFG partner
 * portal's own subdomain (lfgconnect.mmdi.in) vs. the /lfg/* path on
 * another host (app.mmdi.in, ekms.vercel.app, a Vercel preview
 * deployment). Direct mirror of portal-links.ts's PortalHostContext --
 * see that file's comment for the fuller reasoning. Defaults to false
 * (i.e. /lfg-prefixed) so anything that somehow renders without the
 * provider still produces a working link.
 */
export const LfgHostContext = createContext(false);

export function useLfgHost() {
  return useContext(LfgHostContext);
}
