"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  MapPin,
  Search,
  Plus,
  Trash2,
  X,
  ArrowLeft,
  FolderInput,
  LayoutGrid,
  List as ListIcon,
  SlidersHorizontal,
  Building2,
  AlertTriangle,
  Eye,
  ShieldAlert,
  type LucideIcon,
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
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// Stat-strip pill (task: header/menu redesign) -- a colored circular icon
// badge + value/label pair, used for the four summary stats (Total Sites/
// Data Gaps/Showing/Need Attention) inside the bordered stat card below,
// matching the reference mockup's treatment. Module-scope (not a nested
// function component) so it isn't redefined every render; onClick makes
// the Data Gaps pill double as the existing gapsOnly toggle, same
// behavior the old plain-text stat line had.
const STAT_TONE_CLASSES: Record<"primary" | "warning" | "success" | "danger", string> = {
  primary: "bg-primary-tint text-primary",
  warning: "bg-warning-tint text-warning",
  success: "bg-success-tint text-success",
  danger: "bg-danger-tint text-danger",
};
function StatPill({
  icon: Icon,
  tone,
  label,
  value,
  onClick,
  active,
  title,
}: {
  icon: LucideIcon;
  tone: "primary" | "warning" | "success" | "danger";
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
  title?: string;
}) {
  const content = (
    <span className="flex items-center gap-2.5">
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${STAT_TONE_CLASSES[tone]}`}>
        <Icon size={16} />
      </span>
      <span className="flex flex-col items-start leading-tight">
        <span className={`text-sm font-semibold ${active ? "text-primary" : "text-ink"}`}>{value}</span>
        <span className="text-[11px] text-ink-secondary">{label}</span>
      </span>
    </span>
  );
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        title={title}
        className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {content}
      </button>
    );
  }
  return content;
}

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
  state: string | null;
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
  // Also Cards-only (the benchmark checklist, LfgBenchmarkStrip) -- see
  // lfgBenchmarkStatus()'s own header comment in lfgStatus.ts for why
  // Creative Received needs this alongside site_status.
  creative_received_at: string | null;
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
  // Filters panel (header/menu redesign) -- the Format/Status selects and
  // the List/Cards view toggle now live behind this collapsible "Filters"
  // button instead of always sitting on screen, matching the reference
  // mockup's clean collapsed stat-strip. Starts closed only when nothing
  // is actively filtered, so a Format Dashboard/Programs/Stores
  // click-through (which sets formatFilter/statusFilter etc. on mount)
  // still lands with its filter visibly applied rather than hidden behind
  // a closed panel.
  const [filtersOpen, setFiltersOpen] = useState(false);
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
    if (error) {
      setDeleting(false);
      toast("danger", `Couldn't delete ${deleteTarget.site_id}: ${error.message}`);
      return;
    }
    // Clean up the store row too if this was its last remaining site --
    // left orphaned otherwise, it keeps holding its SFO ID/name forever,
    // which then blocks any OTHER store from ever claiming that same SFO
    // ID (lfg_stores.sfo_id is unique where set) -- the exact bug behind
    // "duplicate key value violates unique constraint lfg_stores_sfo_id_key"
    // on an unrelated site's save. Best-effort: the site itself is already
    // deleted either way, so a failure here isn't surfaced as if the whole
    // delete failed.
    if (deleteTarget.store_id) {
      const { count } = await supabase
        .from("lfg_sites")
        .select("id", { count: "exact", head: true })
        .eq("store_id", deleteTarget.store_id);
      if (!count) {
        await supabase.from("lfg_stores").delete().eq("id", deleteTarget.store_id);
      }
    }
    setDeleting(false);
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

  // Seeds every filter from the URL on mount -- ?q= (fuzzy free-text),
  // ?format=/?status=/?program_id=/?store_id= (exact matches, the Format
  // Dashboard/Programs/Stores click-throughs use these), ?gaps=1, and
  // ?view=. Read via window.location directly rather than useSearchParams
  // -- this page is fully client-rendered already, so this avoids the
  // Suspense-boundary requirement useSearchParams imposes on
  // statically-generated pages for no benefit here, same as
  // workspaces/ai-copilot/page.tsx.
  //
  // Task: "went to pen and edit and coming back then again i need to
  // filter whole stuff... keep the same filter when i come back." Every
  // filter used to live in plain useState with nothing writing it back to
  // the URL (this effect used to strip ?format=/?program_id=/etc. down to
  // a bare "/workspaces/lfg" right after reading them once), so clicking
  // into a site and then Back landed on a blank, unfiltered Site Master no
  // matter what was selected before. Now this effect only SEEDS state from
  // whatever's in the URL at mount, and the sync effect right below keeps
  // the URL itself updated as filters change -- so the URL a click into
  // Site 360 leaves in browser history already has every filter on it, and
  // Back restores exactly that.
  const [hydratedFromUrl, setHydratedFromUrl] = useState(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const format = params.get("format");
    const status = params.get("status");
    const programId = params.get("program_id");
    const programName = params.get("program_name");
    const storeId = params.get("store_id");
    const storeName = params.get("store_name");
    const gaps = params.get("gaps");
    const viewParam = params.get("view");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (q) setQuery(q);
    if (format) setFormatFilter(format);
    if (status) setStatusFilter(status);
    if (gaps === "1") setGapsOnly(true);
    if (programId) {
      setProgramIdFilter(programId);
      setProgramNameFilter(programName ?? "");
    }
    if (storeId) {
      setStoreIdFilter(storeId);
      setStoreNameFilter(storeName ?? "");
    }
    if (viewParam === "list" || viewParam === "cards") {
      setView(viewParam);
    } else if (programId) {
      // Cards is already the page's own default (see the `view` state
      // above); this just makes it explicit for a Program click-through
      // too, in case that default ever changes back to List for a plain
      // visit while a "review this wave's sites" visit should still land
      // on Cards.
      setView("cards");
    }
    setHydratedFromUrl(true);
  }, []);

  // Keeps the URL in sync with every filter + the view toggle, debounced
  // same as the row fetch below -- see the mount effect's own comment
  // above for why. Gated on hydratedFromUrl so this doesn't fire (and
  // stomp a URL someone landed on, e.g. a Format Dashboard click-through)
  // before the mount effect above has had a chance to read it first.
  useEffect(() => {
    if (!hydratedFromUrl) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams();
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      if (formatFilter) params.set("format", formatFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (gapsOnly) params.set("gaps", "1");
      if (programIdFilter) {
        params.set("program_id", programIdFilter);
        if (programNameFilter) params.set("program_name", programNameFilter);
      }
      if (storeIdFilter) {
        params.set("store_id", storeIdFilter);
        if (storeNameFilter) params.set("store_name", storeNameFilter);
      }
      if (view !== "cards") params.set("view", view);
      const qs = params.toString();
      router.replace(qs ? `/workspaces/lfg?${qs}` : "/workspaces/lfg", { scroll: false });
    }, 300);
    return () => clearTimeout(handle);
  }, [
    hydratedFromUrl,
    query,
    formatFilter,
    statusFilter,
    gapsOnly,
    programIdFilter,
    programNameFilter,
    storeIdFilter,
    storeNameFilter,
    view,
    router,
  ]);

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
              "id, site_id, outlet_name, format, sfo_id, city, state, region, material, mat_code, width, height, bleed, store_id, site_status, number_of_sites, asm_name, partner_id, lfg_partners(name), store_address, site_reference_picture_path, creative_received_at"
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
    { key: "state", header: "State", sortable: true, render: (r) => r.state ?? "—" },
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

      <LfgConnectHeader
        icon={MapPin}
        section="Site Master"
        subtitle="Search or browse every site for the Basil (Apple) LFG program, then open its Site 360 view. Sorted by SFO / Apple ID."
        action={
          <Button onClick={() => router.push("/workspaces/lfg/new")}>
            <Plus size={15} className="mr-1.5" /> New Site
          </Button>
        }
      />

      {/* Bordered stat-strip card (header/menu redesign) -- replaces the old
          plain-text stat line. Four colored icon-badge stats (Total Sites/
          Data Gaps/Showing/Need Attention -- same underlying counts as
          before) separated by vertical dividers, the search box, and a
          "Filters" toggle that reveals the Format/Status selects + List/
          Cards view toggle below, all inside one card -- matching the
          reference mockup. */}
      <div className="my-4 rounded-xl border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <StatPill icon={Building2} tone="primary" label="Total Sites" value={totalCount === null ? "…" : String(totalCount)} />
          <div className="hidden h-9 w-px bg-line sm:block" />
          <StatPill
            icon={AlertTriangle}
            tone="warning"
            label="Data Gaps"
            value={missingCount === null ? "…" : String(missingCount)}
            onClick={() => setGapsOnly((v) => !v)}
            active={gapsOnly}
            title="Missing City / ASM / SFO ID — click to view"
          />
          <div className="hidden h-9 w-px bg-line sm:block" />
          <StatPill
            icon={Eye}
            tone="success"
            label={`Showing${query.trim() || statusFilter || formatFilter || programIdFilter || storeIdFilter || gapsOnly ? " (filtered)" : ""}`}
            value={rows === null ? "…" : String(rows.length)}
          />
          <div className="hidden h-9 w-px bg-line sm:block" />
          <StatPill
            icon={ShieldAlert}
            tone="danger"
            label="Need Attention"
            value={rows === null ? "…" : String(rows.filter((r) => r.site_status === "issue_attention_required").length)}
          />

          <div className="ml-auto flex flex-1 items-center gap-2 sm:flex-none sm:min-w-[22rem]">
            <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface-sunken/50 px-3 py-2">
              <Search size={16} className="text-ink-muted" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder='Search Site ID, Outlet, SFO ID, Format, City, or ASM — e.g. "Croma" or "LFG-000012"'
                className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
              />
            </div>
            <Button variant="secondary" onClick={() => setFiltersOpen((v) => !v)} aria-pressed={filtersOpen}>
              <SlidersHorizontal size={15} className="mr-1.5" /> Filters
            </Button>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
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
        )}
      </div>

      <LfgProgramSummaryCard />

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
