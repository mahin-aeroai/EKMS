"use client";

import { createContext, useContext } from "react";
import { type UserRole } from "@/lib/supabase";

/**
 * Current signed-in user's role (admin / editor / viewer), sourced from the
 * `profiles` table (see supabase-role-based-rls-migration.sql) and provided
 * by AppShell.
 *
 * `null` means "unknown" — either still loading, or the `profiles` table /
 * row doesn't exist yet (e.g. the role migration hasn't been run in
 * production yet). Consumers should treat `null` as "don't restrict
 * anything in the UI" — the database RLS policies are the actual security
 * boundary; this context only drives UI affordances (badges, hiding
 * buttons a viewer's write would fail against anyway).
 */
export const UserRoleContext = createContext<UserRole | null>(null);

export function useUserRole() {
  return useContext(UserRoleContext);
}

export function canWrite(role: UserRole | null) {
  // Fail-open in the UI when the role is unknown (pre-migration state) so
  // the app doesn't silently disable writes for everyone the moment this
  // context exists but before the SQL migration has been run. Once a role
  // is known, only admin/editor can write — matches the RLS policies.
  if (role === null) return true;
  return role === "admin" || role === "editor";
}

export function canDelete(role: UserRole | null) {
  if (role === null) return true;
  return role === "admin";
}
