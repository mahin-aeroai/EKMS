"use client";

import { createContext, useContext } from "react";

/**
 * Current signed-in user's Tools-section access scope (see
 * supabase-tool-access-migration.sql / profiles.allowed_tools), provided by
 * AppShell alongside UserRoleContext / UserGroupsContext.
 *
 * `null` means "unrestricted" — sees every tool, same fail-open convention
 * as UserGroupsContext. Unlike allowed_groups, this is UI-level only (hides
 * nav items, home page tiles, and blocks a tool's own page if reached
 * directly) — deliberately NOT backed by RLS, since several Tools' tables
 * are shared with already-RLS-gated sections (e.g. Cost Sheet reads
 * raw_materials, also used by the Manufacturing section) and doing that
 * safely needs a per-table audit first. See the migration file's header for
 * the full reasoning.
 *
 * Tool ids match AppShell.tsx's NAV Tools section `id` fields: site-surveys,
 * sign-estimator, installation-report, cut-file-tool, qr-label-tool,
 * estimate-builder, cost-sheet.
 */
export const UserToolsContext = createContext<string[] | null>(null);

export function useAllowedTools() {
  return useContext(UserToolsContext);
}

/** True if the current user (by role + allowed_tools) can use `tool`. */
export function canAccessTool(role: string | null, allowedTools: string[] | null, tool: string) {
  if (role === "admin") return true;
  if (allowedTools === null) return true;
  return allowedTools.includes(tool);
}
