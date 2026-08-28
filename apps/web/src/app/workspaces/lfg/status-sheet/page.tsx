"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowLeftRight, Check, ChevronDown, ExternalLink, Search, X } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { timeAgo } from "@/lib/timeAgo";
import { formatSizeMm } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge, lfgFormatPriorityRank, type LfgStatus } from "@/lib/lfgStatus";
import { LfgBenchmarkStrip } from "@/components/workspaces/LfgBenchmarkStrip";

// Status Sheet (task: "make an update/editing page like excel sheet to
// update all kind of statuses") -- a dedicated, fast bulk status-review
// screen, distinct from Site 360's own one-site-at-a-time status dialog
// (LfgSiteWorkspaceClient.tsx's handleChangeStatus) and from the Site
// Master table (workspaces/lfg/page.tsx), which is built for browsing/
// filtering/bulk-Program-moves, not rapid status swaps -- getting to a
// status change there means opening a row into Site 360 first.
//
// Deliberately only THREE columns (Site / Current Status / Update) so the
// whole sheet fits one screen width with no left-right scroll ("no
// scrolling left to right... use multiple row per site within cell if
// required") -- the Site cell packs its identifying details (LFG code,
// SFO ID, Format, City, Size in mm, Material, Installation Partner), the
// "Site X of N" ordinal badge for a multi-display store (same yellowish-
// green #D7F26D pill Site Cards uses), and the six-checkpoint benchmark
// strip (LfgBenchmarkStrip -- Site Survey Completed / Creative Received
// (New) / In Production / Shipped / Delivered / Installed, so it's
// obvious at a glance which stages a site has already crossed) onto
// multiple lines inside the cell, rather than spreading any of it into
// more columns.
// Grouped strictly by PROGRAM (season) with a clear section header per
// program, current season first -- same "most recently created Program =
// current season" convention as the Programs page and the Programs
// summary card (lfg_programs.active is never actually toggled by
// anything, see those files' own header comments), not grouped by format.
// Format / City / Installation Partner are filters ABOVE the sheet
// instead (server-side exact match, same pattern the Site Master's own
// ?format= filter uses), on top of the free-text search and the
// Program/status filters already there.
//
// The "stylish swap button": each row's Update cell is a single button
// that opens a compact colored-pill picker of all 18 LFG_STATUSES
// (LFG_STATUS_BADGE's own colors, so a status reads the same everywhere
// in the app) -- clicking a status calls the same lfg_change_site_status
// RPC Site 360 uses (so the audit trail in lfg_site_status_history is
// never bypassed) and updates in place, no page reload, no dialog to
// confirm first -- the whole point is rapid review-and-swap across many
// sites in one sitting.
interface StatusSheetRow {
  id: string;
  site_id: string;
  outlet_name: string;
  format: string | null;
  sfo_id: string | null;
  city: string | null;
  site_status: string;
  program_id: string | null;
  updated_at: string;
  width: number | null;
  height: number | null;
  material: string | null;
  store_id: string | null;
  partner_id: string | null;
  creative_received_at: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

interface ProgramOption {
  id: string;
  name: string;
  created_at: string;
}

interface PartnerOption {
  id: string;
  name: string;
}

const NO_PROGRAM_KEY = "__none__";

function partnerName(row: StatusSheetRow): string | null {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? null;
}

function compareSfoId(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}

function sortRows(rows: StatusSheetRow[]): StatusSheetRow[] {
  return [...rows].sort(
    (a, b) =>
      lfgFormatPriorityRank(a.format ?? "") - lfgFormatPriorityRank(b.format ?? "") ||
      (a.format ?? "").localeCompare(b.format ?? "") ||
      compareSfoId(a.sfo_id, b.sfo_id)
  );
}

// Same "store has more than one display" numbering Site Cards uses
// (LfgSiteCardGrid.tsx's siteOrdinals) -- kept as its own small local copy
// rather than a shared import since it's a two-line reduction with no
// other logic worth centralizing; computed over the full filtered `rows`
// set so the "N" total stays accurate regardless of which program group a
// particular site's row happens to render under.
function siteOrdinals(rows: StatusSheetRow[]): Record<string, { index: number; total: number }> {
  const byStore = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.store_id) continue;
    const list = byStore.get(r.store_id) ?? [];
    list.push(r.id);
    byStore.set(r.store_id, list);
  }
  const map: Record<string, { index: number; total: number }> = {};
  for (const ids of byStore.values()) {
    if (ids.length < 2) continue;
    ids.forEach((id, i) => {
      map[id] = { index: i + 1, total: ids.length };
    });
  }
  return map;
}

export default function LfgStatusSheetPage() {
  const router = useRouter();
  const role = useUserRole();
  const editable = canWrite(role);

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [programFilter, setProgramFilter] = useState<string>(""); // "" = all programs
  const [formatFilter, setFormatFilter] = useState<string>("");
  const [cityFilter, setCityFilter] = useState<string>("");
  const [partnerFilter, setPartnerFilter] = useState<string>(""); // partner_id, "" = all partners
  const [rows, setRows] = useState<StatusSheetRow[] | null>(null);
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [partners, setPartners] = useState<PartnerOption[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Format/City options: distinct values already typed into lfg_sites
  // (same hook the Site Master's New Site form uses). Partner options come
  // from lfg_partners directly (a real master table, unlike format/city)
  // so the dropdown always lists every partner on file, not just ones with
  // a site already assigned.
  const formatOptions = useLfgDistinctValues("format");
  const cityOptions = useLfgDistinctValues("city");

  useEffect(() => {
    supabase
      .from("lfg_programs")
      .select("id, name, created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
    supabase
      .from("lfg_partners")
      .select("id, name")
      .order("name")
      .then(({ data }) => setPartners((data as PartnerOption[]) ?? []));
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      const trimmed = query.trim();
      fetchAllRows<StatusSheetRow>((from, to) => {
        let q = supabase
          .from("lfg_sites")
          .select(
            "id, site_id, outlet_name, format, sfo_id, city, site_status, program_id, updated_at, width, height, material, store_id, partner_id, creative_received_at, lfg_partners(name)"
          )
          .range(from, to);
        if (statusFilter) q = q.eq("site_status", statusFilter);
        if (formatFilter) q = q.eq("format", formatFilter);
        if (cityFilter) q = q.eq("city", cityFilter);
        if (partnerFilter) q = q.eq("partner_id", partnerFilter);
        if (trimmed) {
          q = q.or(
            `site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,format.ilike.%${trimmed}%,city.ilike.%${trimmed}%`
          );
        }
        return q;
      }).then((data) => setRows(sortRows(data as unknown as StatusSheetRow[])));
    }, 250);
    return () => clearTimeout(handle);
  }, [query, statusFilter, formatFilter, cityFilter, partnerFilter]);

  const ordinals = useMemo(() => siteOrdinals(rows ?? []), [rows]);

  function handleStatusChanged(id: string, newStatus: string) {
    setRows((prev) => (prev ? prev.map((r) => (r.id === id ? { ...r, site_status: newStatus, updated_at: new Date().toISOString() } : r)) : prev));
  }

  function toggleCollapsed(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  // Program groups, current-season-first, "No Program" always last -- only
  // built once rows AND programs are both in, so a group's own filtered
  // count is always accurate.
  const groups = useMemo(() => {
    if (!rows) return [];
    const byProgram = new Map<string, StatusSheetRow[]>();
    for (const r of rows) {
      const key = r.program_id ?? NO_PROGRAM_KEY;
      const list = byProgram.get(key) ?? [];
      list.push(r);
      byProgram.set(key, list);
    }
    const ordered: { key: string; name: string; rows: StatusSheetRow[] }[] = [];
    for (const p of programs) {
      const list = byProgram.get(p.id);
      if (list && list.length > 0) ordered.push({ key: p.id, name: p.name, rows: list });
    }
    const unassigned = byProgram.get(NO_PROGRAM_KEY);
    if (unassigned && unassigned.length > 0) ordered.push({ key: NO_PROGRAM_KEY, name: "No Program Assigned", rows: unassigned });
    return programFilter ? ordered.filter((g) => g.key === programFilter) : ordered;
  }, [rows, programs, programFilter]);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Status Sheet" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <ArrowLeftRight size={20} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">Status Sheet</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Every site, grouped by Program, one row each -- click Swap Status to move a site to its next stage
              without opening Site 360. {!editable && "You have view-only access; ask an admin/editor to change a status."}
            </p>
          </div>
        </div>
        <Button variant="secondary" onClick={() => router.push("/workspaces/lfg")}>
          <ArrowLeft size={15} className="mr-1.5" /> Back to Site Master
        </Button>
      </div>

      <div className="my-4 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-sm">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder='Search Outlet, SFO ID, Format, or City -- e.g. "Croma"'
              className="h-9 w-full rounded-md border border-line-strong bg-surface pl-9 pr-8 text-sm text-ink placeholder:text-ink-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
            {query && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-muted hover:bg-surface-sunken"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {programs.length > 1 && (
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <option value="">All Programs</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <select
            value={formatFilter}
            onChange={(e) => setFormatFilter(e.target.value)}
            className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All Formats</option>
            {formatOptions.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <select
            value={cityFilter}
            onChange={(e) => setCityFilter(e.target.value)}
            className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All Cities</option>
            {cityOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            className="h-9 rounded-md border border-line-strong bg-surface px-2.5 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <option value="">All Installation Partners</option>
            {partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Quick status filter -- every value from LFG_STATUSES as a small
            toggle pill, wraps onto as many lines as it needs rather than
            ever forcing horizontal scroll. */}
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setStatusFilter("")}
            className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
              statusFilter === "" ? "border-primary bg-primary-tint text-primary" : "border-line text-ink-secondary hover:bg-surface-sunken"
            }`}
          >
            All Statuses
          </button>
          {LFG_STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatusFilter((prev) => (prev === s ? "" : s))}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                statusFilter === s ? "border-primary bg-primary-tint text-primary" : "border-line text-ink-secondary hover:bg-surface-sunken"
              }`}
            >
              {lfgStatusLabel(s)}
            </button>
          ))}
        </div>
      </div>

      {rows === null ? (
        <p className="py-10 text-center text-sm text-ink-muted">Loading sites…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-muted">No sites match your search.</p>
      ) : (
        <div className="flex flex-col gap-6 pb-10">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-line">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(group.key)}
                  className="flex w-full items-center justify-between gap-3 bg-surface-sunken px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="text-sm font-bold text-ink">{group.name}</span>
                    <span className="rounded-full bg-[#D7F26D] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1E252B]">
                      {group.rows.length} site{group.rows.length === 1 ? "" : "s"}
                    </span>
                  </span>
                  <ChevronDown size={16} className={`shrink-0 text-ink-muted transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                </button>
                {!isCollapsed && (
                  <div className="overflow-x-hidden">
                    <table className="w-full table-fixed border-collapse text-sm">
                      <colgroup>
                        <col style={{ width: "54%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "26%" }} />
                      </colgroup>
                      <thead>
                        <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-ink-muted">
                          <th className="px-4 py-2 font-semibold">Site</th>
                          <th className="px-3 py-2 font-semibold">Current Status</th>
                          <th className="px-3 py-2 font-semibold">Update</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id} className="border-b border-line last:border-b-0 hover:bg-surface-sunken/60">
                            <td className="px-4 py-2.5 align-top">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <span className="truncate font-semibold text-ink">{row.outlet_name}</span>
                                    {ordinals[row.id] && (
                                      <span className="shrink-0 rounded-full bg-[#D7F26D] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#1E252B]">
                                        Site {ordinals[row.id]!.index} of {ordinals[row.id]!.total}
                                      </span>
                                    )}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs text-ink-secondary">
                                    {row.site_id} · SFO {row.sfo_id ?? "—"} · {row.format ?? "—"} · {row.city ?? "—"}
                                  </div>
                                  <div className="mt-0.5 truncate text-xs text-ink-secondary">
                                    {formatSizeMm(row.width, row.height)} · {row.material ?? "—"} · {partnerName(row) ?? "Unassigned"}
                                  </div>
                                  <div className="mt-1.5">
                                    <LfgBenchmarkStrip status={row.site_status} creativeReceivedAt={row.creative_received_at} />
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  title="Open Site 360"
                                  onClick={() => router.push(`/workspaces/lfg/sites/${row.id}`)}
                                  className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-sunken hover:text-ink"
                                >
                                  <ExternalLink size={13} />
                                </button>
                              </div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <Badge status={lfgStatusBadge(row.site_status)}>{lfgStatusLabel(row.site_status)}</Badge>
                              <div className="mt-1 text-[10px] text-ink-muted">Updated {timeAgo(row.updated_at)}</div>
                            </td>
                            <td className="px-3 py-2.5 align-top">
                              <StatusSwapControl row={row} editable={editable} onChanged={handleStatusChanged} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// The "stylish swap button" itself -- a small pill trigger that opens a
// floating panel of every LFG_STATUSES value as its own colored badge
// (lfgStatusBadge's own palette). Picking one calls lfg_change_site_status
// directly (the same RPC Site 360 uses, so lfg_site_status_history still
// gets its row) and reports back to the page via onChanged for an
// immediate in-place update -- no row re-fetch, no page reload.
function StatusSwapControl({
  row,
  editable,
  onChanged,
}: {
  row: StatusSheetRow;
  editable: boolean;
  onChanged: (id: string, newStatus: string) => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState<LfgStatus | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  async function pick(status: LfgStatus) {
    if (status === row.site_status) {
      setOpen(false);
      return;
    }
    setSaving(status);
    const { error } = await supabase.rpc("lfg_change_site_status", {
      p_site_id: row.id,
      p_new_status: status,
      p_remarks: null,
    });
    setSaving(null);
    if (error) {
      toast("danger", `Couldn't update ${row.site_id}: ${error.message}`);
      return;
    }
    onChanged(row.id, status);
    toast("success", `${row.outlet_name} → ${lfgStatusLabel(status)}`);
    setOpen(false);
  }

  if (!editable) {
    return <span className="text-xs text-ink-muted">View only</span>;
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
          open ? "border-primary bg-primary-tint text-primary" : "border-line-strong bg-surface text-ink hover:bg-surface-sunken"
        }`}
      >
        <ArrowLeftRight size={13} />
        Swap Status
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1.5 w-[260px] rounded-xl border border-line bg-surface-overlay p-1.5 shadow-3">
          <div className="max-h-72 overflow-y-auto">
            {LFG_STATUSES.map((s) => {
              const isCurrent = s === row.site_status;
              return (
                <button
                  key={s}
                  type="button"
                  disabled={saving !== null}
                  onClick={() => pick(s)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed ${
                    isCurrent ? "ring-1 ring-inset ring-primary" : ""
                  }`}
                >
                  <Badge status={lfgStatusBadge(s)}>{lfgStatusLabel(s)}</Badge>
                  {isCurrent ? (
                    <Check size={13} className="shrink-0 text-primary" />
                  ) : saving === s ? (
                    <span className="shrink-0 text-[10px] text-ink-muted">Saving…</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
