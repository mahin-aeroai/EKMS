import { supabase } from "@/lib/supabase";
import type { BadgeStatus } from "@/components/ui/Badge";

/**
 * Small shared helpers for the 6 executive/aggregation dashboards
 * (Command Center, Analytics, Costing, Finance, AI Knowledge, AI Copilot).
 * Every one of these pages fetches from several tables and needs the same
 * "count rows" / "group rows by a field" shapes, so it lives here once
 * instead of being re-implemented per page.
 */

/** Exact row count for a table — no data transferred, just the count. */
export async function getCount(table: string): Promise<number> {
  const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
  if (error) throw error;
  return count ?? 0;
}

/** Exact row count for a table matching a simple equality filter. */
export async function getCountWhere(table: string, column: string, value: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq(column, value);
  if (error) throw error;
  return count ?? 0;
}

/** Groups an already-fetched array of rows by a string key, counting occurrences. */
export function groupCount<T>(
  rows: T[],
  key: (row: T) => string | null | undefined
): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const label = key(row) || "Unspecified";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Groups an already-fetched array of rows by a string key, summing a numeric field. */
export function groupSum<T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
  value: (row: T) => number
): { label: string; value: number }[] {
  const sums = new Map<string, number>();
  for (const row of rows) {
    const label = key(row) || "Unspecified";
    sums.set(label, (sums.get(label) ?? 0) + value(row));
  }
  return [...sums.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Formats a raw rupee amount using the same "₹X.XX Cr" convention already
 * used on the Customer workspace (src/components/workspaces/CustomerWorkspaceClient.tsx). */
export function formatCrore(rupees: number): string {
  return `₹${(rupees / 10000000).toFixed(2)} Cr`;
}

const DONUT_COLOR: Record<BadgeStatus, "primary" | "success" | "warning" | "danger" | "info"> = {
  success: "success",
  warning: "warning",
  danger: "danger",
  info: "info",
  neutral: "primary",
};

/**
 * Groups rows that carry a Badge-shaped { status, status_label } pair into
 * DonutChart-ready segments — human-readable label (status_label, falling
 * back to the raw status), counted, and colored to match the same status
 * each row already renders with elsewhere in the app.
 */
export function statusDonutData<T extends { status: BadgeStatus; status_label?: string | null }>(
  rows: T[]
): { label: string; value: number; color: "primary" | "success" | "warning" | "danger" | "info" }[] {
  const labelToStatus = new Map<string, BadgeStatus>();
  for (const row of rows) {
    const label = row.status_label || row.status;
    if (!labelToStatus.has(label)) labelToStatus.set(label, row.status);
  }
  const counts = groupCount(rows, (row) => row.status_label || row.status);
  return counts.map((c) => ({ ...c, color: DONUT_COLOR[labelToStatus.get(c.label) ?? "neutral"] }));
}
