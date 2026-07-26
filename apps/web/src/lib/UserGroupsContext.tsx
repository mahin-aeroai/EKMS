"use client";

import { createContext, useContext } from "react";

/**
 * Current signed-in user's module access scope (see
 * supabase-module-access-migration.sql / profiles.allowed_groups),
 * provided by AppShell alongside UserRoleContext.
 *
 * `null` means "unrestricted" — either genuinely unscoped (the common
 * case: allowed_groups is NULL in the database, meaning "sees everything",
 * same fail-open convention as UserRoleContext), OR the migration hasn't
 * been run yet / the column doesn't exist. Either way, null must never
 * hide anything — the RLS policies in supabase-module-access-migration.sql
 * are the actual security boundary; this context only drives which sidebar
 * groups render, so a restricted user doesn't see a nav item that would
 * just 403/return-empty if they clicked it.
 *
 * Only the 8 real business-domain sidebar groups are ever restrictable:
 * 'customers', 'operations', 'manufacturing', 'knowledge', 'people',
 * 'finance', 'compliance', 'administration'. Overview/Foundations/
 * Components (design-system showcase) and Executive (cross-cutting
 * dashboards) are never gated by this — see the migration file's header
 * comment for why Executive specifically stays ungated.
 */
export const UserGroupsContext = createContext<string[] | null>(null);

export function useAllowedGroups() {
  return useContext(UserGroupsContext);
}

/** True if the current user (by role + allowed_groups) can see `group`. */
export function canAccessGroup(role: string | null, allowedGroups: string[] | null, group: string) {
  if (role === "admin") return true;
  if (allowedGroups === null) return true;
  return allowedGroups.includes(group);
}
