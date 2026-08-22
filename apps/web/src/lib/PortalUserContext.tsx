"use client";

import { createContext, useContext } from "react";
import type { PortalIdentity } from "./portal-auth";

/**
 * The signed-in portal (customer) user's identity, provided by
 * src/app/portal/layout.tsx (a Server Component that calls
 * getPortalIdentity() once) so every Client Component under /portal/*
 * can read it without its own fetch.
 */
export const PortalUserContext = createContext<PortalIdentity | null>(null);

export function usePortalUser() {
  return useContext(PortalUserContext);
}
