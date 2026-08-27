"use client";

import { createContext, useContext } from "react";
import type { LfgIdentity } from "./lfg-auth";

/**
 * The signed-in LFG partner user's identity, provided by
 * src/app/lfg/(app)/layout.tsx (a Server Component that calls
 * getLfgIdentity() once) so every Client Component under /lfg/* can read
 * it without its own fetch. Direct mirror of PortalUserContext.tsx.
 */
export const LfgUserContext = createContext<LfgIdentity | null>(null);

export function useLfgUser() {
  return useContext(LfgUserContext);
}
