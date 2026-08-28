"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  Plus,
  LayoutDashboard,
  Users,
  Trash2,
  X,
  ArrowLeft,
  ArrowLeftRight,
  CalendarRange,
  FolderInput,
  Store as StoreIcon,
  LayoutGrid,
  List as ListIcon,
} from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge } from "@/components/ui/Badge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { useToast } from "@/components/ui/Notifications";
import { useUserRole, canDelete, canWrite } from "@/lib/UserRoleContext";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge, lfgFormatPriorityRank } from "@/lib/lfgStatus";
import { formatMm, formatSizeInches, formatDecimal } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { LfgSiteCardGrid } from "@/components/workspaces/LfgSiteCardGrid";
import { LfgProgramSummaryCard } from "@/components/workspaces/LfgProgramSummaryCard";
import { LfgActivityFeed } from "@/components/workspaces/LfgActivityFeed";

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
// Default sort groups by FORMAT first, in the same fixed priority order
// used everywhere else in LFG Connect (APP, APR, Mono AAR, ... --
// LFG_FORMAT_PRIORITY/lfgFormatPriorityRank in lfgStatus.ts, the same
// ordering the Programs summary tiles use), then by sfo_id (SFO/Apple ID)
// ascending within each format -- NOT by site_id (the internal LFG-000123
// code): the SFO/Apple ID is the one both sides (MMDI and Apple/the
// partner) actually key off, so browsing the master list in that order is
// the useful default; the LFG code remains visible as its own column/link
// target, just not the sort key. The server-side `.order("sfo_id", ...)`
// on the paginated fetch below only keeps each page's own rows in a stable
// order while paging past PostgREST's row cap -- the actual default
// grouping is the client-side sort applied to the assembled full result,
// see sortSiteRows() below. Region/Mat Code/Width/Height/Qty/Bleed/Active
// are shown directly on the list (not just on Site 360) per the same
// request, alongside the existing Store Name/City/Format/Material columns.
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
  // Store entity (task #62-#71) -- the physical outlet this site belongs
  // to, if it's been grouped into one (every site should have one going
  // forward; see the STEP 21b backfill for pre-existing sites). Used only
  // for the store filter chip and the "shares a store" indicator below --
  // nothing else on this list reads it.
  store_id: string | null;
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
  // Cards view only (task #76) -- the table itself never renders these,
  // but they're cheap columns to carry along on the one shared fetch
  // below rather than giving LfgSiteCardGrid a second query against the
  // same already-filtered row set.
  store_address: string | null;
  site_reference_picture_path: string | null;
}

function partnerName(row: LfgSiteListRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

// Default list ordering: group by format in LFG_FORMAT_PRIORITY's own
// order (APP, APR, Mono AAR, ...), then by SFO/Apple ID ascending within
// each format, with no-SFO-ID-yet rows sorted to the end of their format
// group rather than the top (an empty/null sfo_id would otherwise sort
// first). See this file's header comment.
function compareSfoId(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b);
}
function sortSiteRows<T extends { format: string | null; sfo_id: string | null }>(rows: T[]): T[] {
  return [...rows].sort(
    (a, b) =>
      lfgFormatPriorityRank(a.format ?? "") - lfgFormatPriorityRank(b.format ?? "") ||
      (a.format ?? "").localeCompare(b.format ?? "") ||
      compareSfoId(a.sfo_id, b.sfo_id)
  );
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
  // Stores page click-through (task #67/#68) -- same shape as
  // programIdFilter/programNameFilter above, exact FK match via ?store_id=.
  const [storeIdFilter, setStoreIdFilter] = useState<string>("");
  const [storeNameFilter, setStoreNameFilter] = useState<string>("");
  // On-screen Format picker -- previously formatFilter could only be set
  // via the Format Dashboard's ?format= click-through, with no way to
  // choose one directly from this screen. Added so a whole retail chain's
  // sites can be filtered down to, selected all at once (the header
  // checkbox, task #69), and bulk "Move to Program"'d in one visit here,
  // rather than needing a trip through the Dashboard first.
  const formatOptions = useLfgDistinctValues("format");
  // List/Cards toggle (task #76) -- both views read the exact same `rows`
  // fetched below (filters apply to both identically); this only picks
  // how they're rendered. Defaults to List so the existing bulk-select/
  // Move-to-Program workflow (which only the table wires up -- see
  // LfgSiteCardGrid.tsx's own header comment) is what a fresh visit
  // still lands on.
  // Cards is the default landing view (photo-forward review is the more
  // common visit); List stays one click away via the toggle below for
  // bulk-select/Move-to-Program work.
  const [view, setView] = useState<"list" | "cards">("cards");
  const [rows, setRows] = useState<LfgSiteListRow[] | null>(null);
  // How many OTHER sites currently on screen share each store_id -- a
  // lightweight, page-scoped count (not a full-table aggregate) purely to
  // drive the "shares a store with N other displays" indicator next to
  // Store Name below; the full sibling list lives on Site 360 (task #70).
  const [siblingCounts, setSiblingCounts] = useState<Record<string, number>>({});
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
    const storeId = params.get("store_id");
    const storeName = params.get("store_name");
    if (q || format || programId || storeId) {
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
        // Cards is already the page's own default (see the `view` state
        // above); this just makes it explicit for a Program click-through
        // too, in case that default ever changes back to List for a plain
        // visit while a "review this wave's sites" visit should still land
        // on Cards.
        setView("cards");
      }
      if (storeId) {
        setStoreIdFilter(storeId);
        setStoreNameFilter(storeName ?? "");
      }
    }
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => {
      // Screen cap removed (task #69: "cant see all details on a
      // screen"). A single `.limit(5000)` looks like it would do that, but
      // doesn't: PostgREST enforces its own server-side row cap
      // (db-max-rows, 1000 by default) that overrides any client-supplied
      // `.limit()` above it -- exactly the class of bug the fetchAllRows
      // helper's own header comment documents (it once hid customers past
      // "Unicorn Infosolutions" from the Estimate Builder, and undercounted
      // several dashboards). So this pages past that cap explicitly via
      // .range(), same as fetchAllRows, rather than reusing that helper
      // directly -- this loop also needs to surface a fetch error via
      // toast, which fetchAllRows' plain-array return can't carry.
      (async () => {
        const pageSize = 1000;
        const all: Omit<LfgSiteListRow, "active">[] = [];
        let hadError = false;

        for (let from = 0; ; from += pageSize) {
          let q = supabase
            .from("lfg_sites")
            .select(
              "id, site_id, outlet_name, format, sfo_id, city, region, material, mat_code, width, height, bleed, store_id, site_status, number_of_sites, asm_name, partner_id, lfg_partners(name), store_address, site_reference_picture_path"
            )
            // Default sort: SFO/Apple ID ascending, not the internal LFG
            // code -- see this file's header comment. nullsFirst: false so
            // rows without an SFO ID yet (brand-new sites) sort to the end.
            .order("sfo_id", { ascending: true, nullsFirst: false })
            .range(from, from + pageSize - 1);

          if (statusFilter) q = q.eq("site_status", statusFilter);
          // Exact match, not the fuzzy `.or()` ilike below -- this is what
          // makes a Format Dashboard click land on strictly that format's
          // sites.
          if (formatFilter) q = q.eq("format", formatFilter);
          if (programIdFilter) q = q.eq("program_id", programIdFilter);
          if (storeIdFilter) q = q.eq("store_id", storeIdFilter);
          // "Data Gaps" stat card toggle (task #59) -- jumps straight to
          // the records missing City, ASM name, or SFO/Apple ID, same
          // three fields the missingCount audit query above counts.
          if (gapsOnly) q = q.or("city.is.null,asm_name.is.null,sfo_id.is.null");

          const trimmed = query.trim();
          if (trimmed) {
            q = q.or(
              `site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,format.ilike.%${trimmed}%,city.ilike.%${trimmed}%,asm_name.ilike.%${trimmed}%`
            );
          }

          const { data, error } = await q;
          if (error) {
            hadError = true;
            break;
          }
          if (!data || data.length === 0) break;
          all.push(...(data as unknown as Omit<LfgSiteListRow, "active">[]));
          if (data.length < pageSize) break;
        }

        if (hadError) {
          toast("danger", "Couldn't load LFG sites from Supabase");
          return;
        }
        setRows(sortSiteRows(all.map((r) => ({ ...r, active: r.site_status === "active" }))));
      })();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, statusFilter, formatFilter, programIdFilter, storeIdFilter, gapsOnly]);

  // Page-scoped sibling counts for the "shares a store" indicator (see
  // siblingCounts' own declaration above) -- recomputed whenever the
  // visible row set changes, scoped to just the store_ids on screen so
  // this never grows into a full-table scan.
  useEffect(() => {
    if (!rows || rows.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSiblingCounts({});
      return;
    }
    const storeIds = Array.from(new Set(rows.map((r) => r.store_id).filter((id): id is string => !!id)));
    if (storeIds.length === 0) {
      setSiblingCounts({});
      return;
    }
    supabase
      .from("lfg_sites")
      .select("store_id")
      .in("store_id", storeIds)
      .then(({ data }) => {
        const counts: Record<string, number> = {};
        for (const row of (data as { store_id: string | null }[]) ?? []) {
          if (!row.store_id) continue;
          counts[row.store_id] = (counts[row.store_id] ?? 0) + 1;
        }
        setSiblingCounts(counts);
      });
  }, [rows]);

  const COLUMNS: TableColumn<SelectableRow>[] = [
    ...(editable
      ? [
          {
            key: "selected",
            header: "",
            // "Select all shown" (task #69) -- checks/unchecks every row
            // currently loaded (up to the paginated fetch above, i.e. the
            // WHOLE result set now that the old 100-row cap is gone, not
            // just one page of it), so "add all sites to a program" is a
            // single click plus the header checkbox rather than clicking
            // every row.
            headerRender: () => (
              <input
                type="checkbox"
                checked={rows !== null && rows.length > 0 && rows.every((r) => selectedIds.has(r.id))}
                onChange={(e) => setSelectedIds(e.target.checked ? new Set((rows ?? []).map((r) => r.id)) : new Set())}
                aria-label="Select all shown"
                className="h-4 w-4 rounded border-line-strong"
              />
            ),
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
    {
      key: "outlet_name",
      header: "Store Name",
      sortable: true,
      render: (r) => {
        const siblings = r.store_id ? (siblingCounts[r.store_id] ?? 0) : 0;
        if (siblings <= 1) return r.outlet_name;
        return (
          <span className="flex items-center gap-1.5">
            {r.outlet_name}
            <button
              type="button"
              title={`${siblings} displays share this store`}
              onClick={(e) => {
                e.stopPropagation();
                router.push(`/workspaces/lfg?store_id=${encodeURIComponent(r.store_id!)}&store_name=${encodeURIComponent(r.outlet_name)}`);
              }}
              className="rounded-full"
            >
              <Badge status="info">{siblings} displays</Badge>
            </button>
          </span>
        );
      },
    },
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
    { key: "bleed", header: "Bleed", sortable: true, render: (r) => formatDecimal(r.bleed) },
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
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/stores")}>
            <StoreIcon size={15} className="mr-1.5" /> Stores
          </Button>
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/status-sheet")}>
            <ArrowLeftRight size={15} className="mr-1.5" /> Status Sheet
          </Button>
          <Button variant="secondary" onClick={() => router.push("/workspaces/lfg/partners")}>
            <Users size={15} className="mr-1.5" /> Partners
          </Button>
          <Button onClick={() => router.push("/workspaces/lfg/new")}>
            <Plus size={15} className="mr-1.5" /> New Site
          </Button>
        </div>
      </div>

      {/* A slim summary strip rather than four full-size KPI cards -- with
          Cards view now the default landing surface, this real estate
          belongs to the sites themselves; these counts stay one glance
          away instead of pushing the actual review surface further down
          the page. */}
      <div className="my-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-ink-secondary">
        <span>
          <span className="font-semibold text-ink">{totalCount === null ? "…" : totalCount}</span> total sites
        </span>
        <span className="text-line">·</span>
        <button
          type="button"
          onClick={() => setGapsOnly((v) => !v)}
          className={`rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${gapsOnly ? "font-semibold text-primary" : "hover:text-ink"}`}
          title="Missing City / ASM / SFO ID — click to view"
        >
          <span className="font-semibold">{missingCount === null ? "…" : missingCount}</span> data gaps
        </button>
        <span className="text-line">·</span>
        <span>
          showing <span className="font-semibold text-ink">{rows === null ? "…" : rows.length}</span>
          {query.trim() || statusFilter || formatFilter || programIdFilter || storeIdFilter || gapsOnly ? " (filtered)" : ""}
        </span>
        <span className="text-line">·</span>
        <span>
          <span className="font-semibold text-danger">
            {rows === null ? "…" : rows.filter((r) => r.site_status === "issue_attention_required").length}
          </span>{" "}
          need attention
        </span>
      </div>

      <LfgProgramSummaryCard />
      <LfgActivityFeed />

      {(formatFilter || programIdFilter || storeIdFilter) && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {/* Landing here is always a Format Dashboard, Programs, or Stores
              click-through (see the ?format=/?program_id=/?store_id=
              seeding effect above) -- an explicit way back, not just the
              generic header "Dashboard"/"Programs"/"Stores" button, since
              that's easy to miss when you arrived expecting to land back
              where you came from. */}
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              router.push(
                formatFilter ? "/workspaces/lfg/dashboard" : programIdFilter ? "/workspaces/lfg/programs" : "/workspaces/lfg/stores"
              )
            }
          >
            <ArrowLeft size={14} className="mr-1.5" /> Back to {formatFilter ? "Dashboard" : programIdFilter ? "Programs" : "Stores"}
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
          {storeIdFilter && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary bg-primary-tint px-3 py-1 text-xs font-medium text-primary">
              Store: {storeNameFilter || storeIdFilter}
              <button
                type="button"
                aria-label="Clear store filter"
                onClick={() => {
                  setStoreIdFilter("");
                  setStoreNameFilter("");
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
          value={formatFilter}
          onChange={(e) => setFormatFilter(e.target.value)}
          className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
        >
          <option value="">All formats</option>
          {formatOptions.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
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
        <div className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface p-1">
          <button
            type="button"
            onClick={() => setView("list")}
            aria-pressed={view === "list"}
            title="List view"
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "list" ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"
            }`}
          >
            <ListIcon size={14} /> List
          </button>
          <button
            type="button"
            onClick={() => setView("cards")}
            aria-pressed={view === "cards"}
            title="Card view"
            className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
              view === "cards" ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"
            }`}
          >
            <LayoutGrid size={14} /> Cards
          </button>
        </div>
      </div>

      {view === "list" && editable && selectedIds.size > 0 && (
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
        ) : view === "cards" ? (
          <LfgSiteCardGrid rows={rows} />
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
