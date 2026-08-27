"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Plus, LayoutDashboard, Users, Trash2, X, ArrowLeft, CalendarRange, FolderInput } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canDelete, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge } from "@/lib/lfgStatus";
import { formatMm, formatSizeInches } from "@/lib/lfg-units";

// Site Master list — the entry point to the LFG Connect program's Site 360
// view. Deliberately a client component doing direct supabase.from()
// queries, mirroring workspaces/customer/page.tsx exactly (debounced
// search, .or() ilike across the fields the spec calls out for global
// search: Site ID, Outlet, SFO ID, Format, City, ASM, Partner). Financial
// fields are never selected here -- there'd be nothing to select even if
// this page tried: lfg_site_financials/lfg_installation_costs have zero
// RLS grant to lfg_partner, but this is the STAFF workspace, where admin/
// editor/viewer all pass RLS fine -- the omission here is just this page
// not needing them for a list view, not a security boundary (that
// boundary is the RLS grant itself, see the schema's header comment).
//
// Default sort is by sfo_id (SFO/Apple ID) ascending, NOT by site_id (the
// internal LFG-000123 code) -- explicit per task #39-44: the SFO/Apple ID
// is the one both sides (MMDI and Apple/the partner) actually key off, so
// browsing the master list in that order is the useful default; the LFG
// code remains visible as its own column/link target, just not the sort
// key. Region/Mat Code/Width/Height/Qty/Bleed/Active are shown directly on
// the list (not just on Site 360) per the same request, alongside the
// existing Store Name/City/Format/Material columns.
interface LfgSiteListRow {
  id: string;
  site_id: string;
  outlet_name: string;
  format: string | null;
  sfo_id: string | null;
  city: string | null;
  region: string | null;
  material: string | null;
  mat_code: string | null;
  width: number | null;
  height: number | null;
  bleed: number | null;
  site_status: string;
  // Derived client-side from site_status (see the mapping in the fetch
  // effect below) -- its own field, not reusing site_status as a table
  // column key, so the "Active" and "Status" columns don't collide on the
  // same TableColumn.key (Table's <th>/<td> use col.key as their React
  // key, same duplicate-key bug avoided in the Format Dashboard's table).
  active: boolean;
  number_of_sites: number;
  asm_name: string | null;
  partner_id: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

function partnerName(row: LfgSiteListRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

function formatNum(n: number | null): string {
  return n === null || n === undefined ? "—" : String(n);
}

interface ProgramOption {
  id: string;
  name: string;
}

// Row shape actually handed to <Table> -- adds a `selected` field so the
// bulk-select checkbox column (task #46) has its own real TableColumn key,
// computed fresh each render from `selectedIds` rather than stored on
// `rows` itself (same reasoning as the Format Dashboard table's flattened
// row type: every TableColumn needs a distinct, real `keyof` key, or the
// underlying <th>/<td> elements get duplicate React keys).
type SelectableRow = LfgSiteListRow & { selected: boolean };

export default function LfgSiteListPage() {
  const router = useRouter();
  const { toast } = useToast();
  const role = useUserRole();
  const editable = canWrite(role);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [formatFilter, setFormatFilter] = useState<string>("");
  // Distinct from formatFilter -- a Programs page click-through (task #45)
  // hands off a program_id, an exact FK match, same pattern as ?format=
  // but a separate param since a site's retail format and its seasonal
  // Program are two independent, both-optional groupings.
  const [programIdFilter, setProgramIdFilter] = useState<string>("");
  const [programNameFilter, setProgramNameFilter] = useState<string>("");
  const [rows, setRows] = useState<LfgSiteListRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // Data-completeness audit (task #59) -- some records are missing City,
  // ASM details, or SFO/Apple ID (the field Apple keys every site off,
  // per this file's header comment on default sort). This is a live exact
  // count across ALL sites, not just the currently-loaded page of rows, so
  // it stays accurate under any search/filter. Clicking the card jumps
  // straight to those records via the same free-text search the box above
  // already supports.
  const [missingCount, setMissingCount] = useState<number | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LfgSiteListRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Bulk "Move to Program" (task #46) -- row selection + a program picker,
  // admin/editor gated same as everywhere else write access is checked in
  // this app (lfg_sites_update RLS is the real boundary either way).
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [moveProgramId, setMoveProgramId] = useState("");
  const [moving, setMoving] = useState(false);

  function toggleSelected(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleMoveToProgram() {
    if (selectedIds.size === 0) return;
    setMoving(true);
    const { error } = await supabase
      .from("lfg_sites")
      .update({ program_id: moveProgramId || null })
      .in("id", [...selectedIds]);
    setMoving(false);
    if (error) {
      toast("danger", `Couldn't move sites: ${error.message}`);
      return;
    }
    const programName = programs.find((p) => p.id === moveProgramId)?.name ?? "Unassigned";
    toast("success", `${selectedIds.size} site${selectedIds.size === 1 ? "" : "s"} moved to ${programName}`);
    setSelectedIds(new Set());
    setShowMoveDialog(false);
    setMoveProgramId("");
  }

  // Quick cleanup for the empty "Store Master" import stubs and other
  // one-off junk records found while browsing/searching (see the dedupe
  // script from task #24 for the bulk version of this same cleanup) --
  // no live related-data check here the way Site 360's delete dialog has
  // one, since checking every visible row would mean N extra queries; an
  // admin who wants that detail opens the site's own page instead. RLS
  // (lfg_sites_delete_staff, admin-only) is the real boundary either way.
  async function handleDeleteSite() {
    if (!deleteTarget) return;
    setDeleting(true);
    const { error } = await supabase.from("lfg_sites").delete().eq("id", deleteTarget.id);
    setDeleting(false);
    if (error) {
      toast("danger", `Couldn't delete ${deleteTarget.site_id}: ${error.message}`);
      return;
    }
    toast("success", `${deleteTarget.site_id} deleted`);
    setRows((prev) => prev?.filter((r) => r.id !== deleteTarget.id) ?? prev);
    setTotalCount((prev) => (prev === null ? prev : prev - 1));
    setDeleteTarget(null);
  }

  useEffect(() => {
    supabase
      .from("lfg_sites")
      .select("*", { count: "exact", head: true })
      .then(({ count }) => setTotalCount(count ?? 0));
    supabase
      .from("lfg_sites")
      .select("*", { count: "exact", head: true })
      .or("city.is.null,asm_name.is.null,sfo_id.is.null")
      .then(({ count }) => setMissingCount(count ?? 0));
    supabase
      .from("lfg_programs")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, []);

  // Seeds the search box from ?q=... (fuzzy free-text) or the page from
  // ?format=... (the Format Dashboard's row/chart click hands off an
  // EXACT format name this way -- distinct from ?q=, which only ever
  // ilike-matches, so a format click always lands on strictly that
  // format's sites, not a superset that happens to fuzzy-match its name).
  // Read via window.location directly rather than useSearchParams -- this
  // page is fully client-rendered already, so this avoids the
  // Suspense-boundary requirement useSearchParams imposes on
  // statically-generated pages for no benefit here, same as
  // workspaces/ai-copilot/page.tsx. Runs once on mount, then strips the
  // param via replaceState so refreshing doesn't re-seed it.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const format = params.get("format");
    const programId = params.get("program_id");
    const programName = params.get("program_name");
    if (q || format || programId) {
      window.history.replaceState(null, "", "/workspaces/lfg");
      if (q) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setQuery(q);
      }
      if (format) {
        setFormatFilter(format);
      }
      if (programId) {
        setProgramIdFilter(programId);
        setProgramNameFilter(programName ?? "");
      }
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      let q = supabase
        .from("lfg_sites")
        .select(
          "id, site_id, outlet_name, format, sfo_id, city, region, material, mat_code, width, height, bleed, site_status, number_of_sites, asm_name, partner_id, lfg_partners(name)"
        )
        // Default sort: SFO/Apple ID ascending, not the internal LFG code --
        // see this file's header comment. nullsFirst: false so rows without
        // an SFO ID yet (brand-new sites) sort to the end, not the top.
        .order("sfo_id", { ascending: true, nullsFirst: false })
        // A format- or program-filtered view is meant to show the WHOLE
        // group -- e.g. "active" alone totals 791 sites across all formats,
        // so a single chain (or a single season's wave) can easily hold
        // hundreds -- while the default unfiltered browse still caps at the
        // most recent 100, same as before.
        .limit(formatFilter || programIdFilter || gapsOnly ? 5000 : 100);

      if (statusFilter) q = q.eq("site_status", statusFilter);
      // Exact match, not the fuzzy `.or()` ilike below -- this is what makes
      // a Format Dashboard click land on strictly that format's sites.
      if (formatFilter) q = q.eq("format", formatFilter);
      if (programIdFilter) q = q.eq("program_id", programIdFilter);
      // "Data Gaps" stat card toggle (task #59) -- jumps straight to the
      // records missing City, ASM name, or SFO/Apple ID, same three fields
      // the missingCount audit query above counts.
      if (gapsOnly) q = q.or("city.is.null,asm_name.is.null,sfo_id.is.null");

      const trimmed = query.trim();
      if (trimmed) {
        q = q.or(
          `site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,format.ilike.%${trimmed}%,city.ilike.%${trimmed}%,asm_name.ilike.%${trimmed}%`
        );
      }

      q.then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load LFG sites from Supabase");
          return;
        }
        const withActive = ((data as unknown as Omit<LfgSiteListRow, "active">[]) ?? []).map((r) => ({
          ...r,
          active: r.site_status === "active",
        }));
        setRows(withActive);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, formatFilter, programIdFilter, gapsOnly]);

  const COLUMNS: TableColumn<SelectableRow>[] = [
    ...(editable
      ? [
          {
            key: "selected",
            header: "",
            render: (r) => (
              <input
                type="checkbox"
                checked={r.selected}
                onClick={(e) => e.stopPropagation()}
                onChange={() => toggleSelected(r.id)}
                aria-label={`Select ${r.site_id}`}
                className="h-4 w-4 rounded border-line-strong"
              />
            ),
          } satisfies TableColumn<SelectableRow>,
        ]
      : []),
    { key: "site_id", header: "LFG Code", sortable: true },
    { key: "sfo_id", header: "SFO / Apple ID", sortable: true, render: (r) => r.sfo_id ?? "—" },
    { key: "outlet_name", header: "Store Name", sortable: true },
    {
      key: "active",
      header: "Active",
      sortable: true,
      render: (r) => <Badge status={r.active ? "success" : "neutral"}>{r.active ? "Yes" : "No"}</Badge>,
    },
    { key: "city", header: "City", sortable: true, render: (r) => r.city ?? "—" },
    { key: "region", header: "Region", sortable: true, render: (r) => r.region ?? "—" },
    {
      key: "format",
      header: "Format",
      sortable: true,
      render: (r) => r.format ?? "—",
    },
    { key: "material", header: "Material", sortable: true, width: "12rem", render: (r) => r.material ?? "—" },
    { key: "mat_code", header: "Mat Code", sortable: true, render: (r) => r.mat_code ?? "—" },
    { key: "width", header: "Width (mm)", sortable: true, render: (r) => formatMm(r.width) },
    { key: "height", header: "Height (mm)", sortable: true, render: (r) => formatMm(r.height) },
    { key: "lfg_partners", header: "Size (in)", render: (r) => formatSizeInches(r.width, r.height) },
    { key: "number_of_sites", header: "Qty", sortable: true },
    { key: "bleed", header: "Bleed", sortable: true, render: (r) => formatNum(r.bleed) },
    {
      key: "site_status",
      header: "Status",
      sortable: true,
      render: (r) => <Badge status={lfgStatusBadge(r.site_status)}>{lfgStatusLabel(r.site_status)}</Badge>,
    },
    { key: "asm_name", header: "ASM", sortable: true, render: (r) => r.asm_name ?? "—" },
    { key: "partner_id", header: "Partner", render: (r) => partnerName(r) },
    ...(canDelete(role)
      ? [
          {
            key: "id",
            header: "",
            render: (r) => (
              <Button
                size="sm"
                variant="ghost"
                aria-label={`Delete ${r.site_id}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteTarget(r);
                }}
              >
                <Trash2 size={14} className="text-danger" />
              </Button>
            ),
          } satisfies TableColumn<SelectableRow>,
        ]
      : []),
  ];

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <MapPin size={22} />
          </span>
          <div>
            <h1 className="text-xl font-semibold text-ink">LFG Connect</h1>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Site Master for the Basil (Apple) LFG program — search or browse every site, then open its Site 360
              view. Sorted by SFO / Apple ID.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/dashboard")}>
            <LayoutDashboard size={15} className="mr-1.5" /> Dashboard
          </Button>
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/programs")}>
            <CalendarRange size={15} className="mr-1.5" /> Programs
          </Button>
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/partners")}>
            <Users size={15} className="mr-1.5" /> Partners
          </Button>
          <Button onClick={() => router.push("/workspaces/lfg/new")}>
            <Plus size={15} className="mr-1.5" /> New Site
          </Button>
        </div>
      </div>

      <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Sites" value={totalCount === null ? "…" : String(totalCount)} trend="flat" trendLabel="Live count" />
        <button
          type="button"
          onClick={() => setGapsOnly((v) => !v)}
          className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
        >
          <StatCard
            label="Data Gaps"
            value={missingCount === null ? "…" : String(missingCount)}
            trend={missingCount ? "down" : "flat"}
            trendLabel={gapsOnly ? "Showing only these — click to clear" : "Missing City / ASM / SFO ID — click to view"}
          />
        </button>
        <StatCard
          label="Showing"
          value={rows === null ? "…" : String(rows.length)}
          trend="flat"
          trendLabel={query.trim() || statusFilter || formatFilter || programIdFilter || gapsOnly ? "Filtered" : "Most recent 100"}
        />
        <StatCard
          label="Needs Attention"
          value={rows === null ? "…" : String(rows.filter((r) => r.site_status === "issue_attention_required").length)}
          trend="flat"
          trendLabel="Of rows currently shown"
        />
      </div>

      {(formatFilter || programIdFilter) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Landing here is always a Format Dashboard or Programs
              click-through (see the ?format=/?program_id= seeding effect
              above) -- an explicit way back, not just the generic header
              "Dashboard"/"Programs" button, since that's easy to miss when
              you arrived expecting to land back where you came from. */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => router.push(formatFilter ? "/workspaces/lfg/dashboard" : "/workspaces/lfg/programs")}
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back to {formatFilter ? "Dashboard" : "Programs"}
          </Button>
          {formatFilter && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
              Format: {formatFilter}
              <button
                type="button"
                aria-label="Clear format filter"
                onClick={() => setFormatFilter("")}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <X size={12} />
              </button>
            </span>
          )}
          {programIdFilter && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
              Program: {programNameFilter || programIdFilter}
              <button
                type="button"
                aria-label="Clear program filter"
                onClick={() => {
                  setProgramIdFilter("");
                  setProgramNameFilter("");
                }}
                className="rounded-full p-0.5 hover:bg-primary/10"
              >
                <X size={12} />
              </button>
            </span>
          )}
        </div>
      )}

      {gapsOnly && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
            Data Gaps: missing City / ASM / SFO ID
            <button
              type="button"
              aria-label="Clear data gaps filter"
              onClick={() => setGapsOnly(false)}
              className="rounded-full p-0.5 hover:bg-primary/10"
            >
              <X size={12} />
            </button>
          </span>
        </div>
      )}

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
          <Search size={16} className="text-ink-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search Site ID, Outlet, SFO ID, Format, City, or ASM — e.g. "Croma" or "LFG-000012"'
            className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All statuses</option>
          {LFG_STATUSES.map((s) => (
            <option key={s} value={s}>
              {lfgStatusLabel(s)}
            </option>
          ))}
        </select>
      </div>

      {editable && selectedIds.size > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary bg-primary-tint px-4 py-2.5">
          <span className="text-sm font-medium text-primary">
            {selectedIds.size} site{selectedIds.size === 1 ? "" : "s"} selected
          </span>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSelectedIds(new Set())}>
              Clear
            </Button>
            <Button size="sm" onClick={() => setShowMoveDialog(true)}>
              <FolderInput size={14} className="mr-1.5" /> Move to Program
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No sites match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={COLUMNS}
              rows={rows.map((r): SelectableRow => ({ ...r, selected: selectedIds.has(r.id) }))}
              onRowClick={(r) => router.push(`/workspaces/lfg/sites/${r.id}`)}
            />
          </div>
        )}
      </div>

      <Dialog
        open={showMoveDialog}
        onClose={() => setShowMoveDialog(false)}
        title={`Move ${selectedIds.size} site${selectedIds.size === 1 ? "" : "s"} to a Program`}
        variant="confirm"
        onConfirm={handleMoveToProgram}
        confirmLabel={moving ? "Moving…" : "Move"}
      >
        <div className="flex flex-col gap-2">
          <label className="text-xs font-medium text-ink-secondary" htmlFor="move_program_id">
            Program (season)
          </label>
          <select
            id="move_program_id"
            value={moveProgramId}
            onChange={(e) => setMoveProgramId(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">— Unassigned —</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
      </Dialog>

      <Dialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title={deleteTarget ? `Delete ${deleteTarget.site_id}?` : "Delete site?"}
        variant="confirm"
        destructive
        onConfirm={handleDeleteSite}
        confirmLabel={deleting ? "Deleting…" : "Delete Permanently"}
      >
        <p className="text-sm text-ink-secondary">
          This permanently deletes <span className="font-medium text-ink">{deleteTarget?.outlet_name}</span> and
          everything logged against it (surveys, shipments, installation, financials, etc.) — this cannot be undone.
          Open the site&apos;s own page first if you want to see what&apos;s on it before deleting.
        </p>
      </Dialog>
    </div>
  );
}
