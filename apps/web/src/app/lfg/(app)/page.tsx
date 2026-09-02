"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, List as ListIcon, LayoutGrid, User, Users } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { useLfgUser } from "@/lib/LfgUserContext";
import { useLfgHost, lfgHref } from "@/lib/lfg-links";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge } from "@/lib/lfgStatus";
import { formatMm, formatSizeInches, formatDecimal } from "@/lib/lfg-units";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { LfgSiteCardGrid } from "@/components/workspaces/LfgSiteCardGrid";
import { LfgPartnerQuickStatusButtons } from "@/components/lfg/LfgPartnerQuickStatusButtons";

// Real LFG partner Site Master (task #19) -- replaces the earlier
// placeholder home. Same debounced search + status filter shape as the
// staff Site Master (workspaces/lfg/page.tsx); brought to parity with it
// (2 Sept 2026) with a Cards view, a Program filter, an "All Sites" toggle
// and one-tap Delivered/Installed buttons -- see PROJECT_STATUS.md for the
// full writeup of why (a partner had no way to understand site status at a
// glance, no program filter, and no visibility into other partners' sites
// at all).
//
// `.eq("partner_id", identity.partnerId)` below is belt-and-braces on top
// of lfg_sites_select RLS (which now also allows any signed-in LFG partner
// user to SELECT every site, not just their own -- see
// supabase-lfg-partner-view-all-sites-migration.sql -- specifically so the
// "All Sites" toggle below has something to read) -- not the real
// boundary, just makes the intent explicit in the query itself. Skipped
// for identity.isStaff (a selectively lfg_connect_access-flagged MMDI
// staff sign-in, see lfg-auth.ts) always, and for a genuine partner
// whenever the new `viewingAllSites` toggle is on.
//
// Default sort is by sfo_id (SFO/Apple ID) ascending, same as the staff
// Site Master and for the same reason (task #39-44) -- not by site_id
// (the internal LFG code).
interface PartnerSiteRow {
  id: string;
  site_id: string;
  outlet_name: string;
  sfo_id: string | null;
  city: string | null;
  region: string | null;
  store_address: string | null;
  material: string | null;
  mat_code: string | null;
  width: number | null;
  height: number | null;
  bleed: number | null;
  active: boolean;
  format: string | null;
  site_status: string;
  number_of_sites: number;
  site_reference_picture_path: string | null;
  asm_name: string | null;
  store_id: string | null;
  creative_received_at: string | null;
  partner_id: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

// Bug fixed here (1 Sept 2026): `active` was being selected straight from
// `lfg_sites` as if it were a real column -- it isn't (there's no `active`
// boolean on this table, only `site_status`, whose own enum already has an
// 'active' value among its other states). Every load of this page failed
// outright with Postgres error 42703 ("column lfg_sites.active does not
// exist"), caught live testing an LFG partner login: the page never got
// past "Loading sites…". The staff Site Master
// (workspaces/lfg/page.tsx) already solved this correctly -- it never
// selects `active`, it derives it client-side as `site_status ===
// "active"` -- this page just never got the same treatment. Fixed the
// same way here: `RawPartnerSiteRow` is what's actually selected from
// Supabase (no `active`), `PartnerSiteRow` (used everywhere else in this
// file, including the table's own row type) adds it back as a derived
// field once the raw rows come back.
type RawPartnerSiteRow = Omit<PartnerSiteRow, "active">;

interface ProgramOption {
  id: string;
  name: string;
}

function partnerName(row: PartnerSiteRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

export default function LfgPartnerSitesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const identity = useLfgUser();
  const onLfgHost = useLfgHost();

  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [programIdFilter, setProgramIdFilter] = useState<string>("");
  const [formatFilter, setFormatFilter] = useState<string>("");
  const formatOptions = useLfgDistinctValues("format");
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  // Only meaningful for a genuine partner account (identity.isStaff already
  // sees every site unconditionally, toggle not shown to them at all) --
  // default "off" so a partner's own sites stay the primary view, per the
  // product decision this page was built around.
  const [viewingAllSites, setViewingAllSites] = useState(false);
  const [view, setView] = useState<"cards" | "list">("cards");
  const [rows, setRows] = useState<PartnerSiteRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  // Program options for the filter select -- exact same query the staff
  // Site Master already uses for its own Move-to-Program dialog
  // (workspaces/lfg/page.tsx), a one-off/mount-only fetch unrelated to
  // any other filter.
  useEffect(() => {
    supabase
      .from("lfg_programs")
      .select("id, name")
      .eq("active", true)
      .order("name")
      .then(({ data }) => setPrograms((data as ProgramOption[]) ?? []));
  }, []);

  useEffect(() => {
    if (!identity) return;
    const scopedToOwn = !identity.isStaff && !viewingAllSites;
    let q = supabase.from("lfg_sites").select("*", { count: "exact", head: true });
    if (scopedToOwn) q = q.eq("partner_id", identity.partnerId);
    q.then(({ count }) => setTotalCount(count ?? 0));
  }, [identity, viewingAllSites]);

  useEffect(() => {
    if (!identity) return;
    const handle = setTimeout(() => {
      // Screen cap removed (task #69, same fix as the staff Site Master --
      // see its own fetch effect for the full explanation): a single
      // `.limit()` above 1000 is silently overridden by PostgREST's own
      // server-side row cap, so this pages past it explicitly via .range()
      // instead of trusting `.limit(identity.isStaff ? 5000 : 200)` to
      // actually return that many rows.
      (async () => {
        const pageSize = 1000;
        const all: RawPartnerSiteRow[] = [];
        let hadError = false;
        const scopedToOwn = !identity.isStaff && !viewingAllSites;

        for (let from = 0; ; from += pageSize) {
          let q = supabase
            .from("lfg_sites")
            .select(
              "id, site_id, outlet_name, sfo_id, city, region, store_address, material, mat_code, width, height, bleed, format, site_status, number_of_sites, site_reference_picture_path, asm_name, store_id, creative_received_at, partner_id, lfg_partners(name)"
            )
            .order("sfo_id", { ascending: true, nullsFirst: false })
            .range(from, from + pageSize - 1);
          if (scopedToOwn) q = q.eq("partner_id", identity.partnerId);

          if (statusFilter) q = q.eq("site_status", statusFilter);
          if (programIdFilter) q = q.eq("program_id", programIdFilter);
          if (formatFilter) q = q.eq("format", formatFilter);

          const trimmed = query.trim();
          if (trimmed) {
            q = q.or(`site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,city.ilike.%${trimmed}%`);
          }

          const { data, error } = await q;
          if (error) {
            hadError = true;
            break;
          }
          if (!data || data.length === 0) break;
          all.push(...((data as unknown as RawPartnerSiteRow[]) ?? []));
          if (data.length < pageSize) break;
        }

        if (hadError) {
          toast("danger", "Couldn't load your sites from Supabase");
          return;
        }
        setRows(all.map((r) => ({ ...r, active: r.site_status === "active" })));
      })();
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, query, statusFilter, programIdFilter, formatFilter, viewingAllSites]);

  // True once a partner (never staff, who already see this unconditionally)
  // is either genuinely staff or has toggled to "All Sites" -- drives the
  // heading copy, stat label, and the List view's Partner column, all the
  // same way identity?.isStaff alone used to.
  const headingAll = Boolean(identity?.isStaff) || viewingAllSites;

  const COLUMNS: TableColumn<PartnerSiteRow>[] = [
    { key: "site_id", header: "Site ID", sortable: true },
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
    { key: "format", header: "Format", sortable: true, render: (r) => r.format ?? "—" },
    { key: "material", header: "Material", sortable: true, width: "12rem", render: (r) => r.material ?? "—" },
    { key: "mat_code", header: "Mat Code", sortable: true, render: (r) => r.mat_code ?? "—" },
    { key: "width", header: "Width (mm)", sortable: true, render: (r) => formatMm(r.width) },
    { key: "height", header: "Height (mm)", sortable: true, render: (r) => formatMm(r.height) },
    { key: "id", header: "Size (in)", render: (r) => formatSizeInches(r.width, r.height) },
    { key: "number_of_sites", header: "Qty", sortable: true },
    { key: "bleed", header: "Bleed", sortable: true, render: (r) => formatDecimal(r.bleed) },
    {
      key: "site_status",
      header: "Status",
      sortable: true,
      render: (r) => <Badge status={lfgStatusBadge(r.site_status)}>{lfgStatusLabel(r.site_status)}</Badge>,
    },
    // Only meaningful once rows span more than one partner -- staff mode,
    // or a genuine partner who's toggled to "All Sites".
    ...(headingAll
      ? [{ key: "lfg_partners", header: "Partner", render: (r) => partnerName(r) } satisfies TableColumn<PartnerSiteRow>]
      : []),
  ];

  function handleStatusChanged(id: string, newStatus: string) {
    setRows((prev) => prev?.map((r) => (r.id === id ? { ...r, site_status: newStatus, active: newStatus === "active" } : r)) ?? prev);
  }

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink">{headingAll ? "All Sites" : "Your Sites"}</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        {headingAll
          ? "Every site across every partner — open one to log a survey, update production/shipment/installation, upload photos and documents, or change its status."
          : `Every site assigned to ${identity?.partnerName || "your account"} — open one to log a survey, update production/shipment/installation, upload photos and documents, or change its status.`}
      </p>

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Sites"
          value={totalCount === null ? "…" : String(totalCount)}
          trend="flat"
          trendLabel={headingAll ? "All partners" : "Assigned to you"}
        />
        <StatCard
          label="Showing"
          value={rows === null ? "…" : String(rows.length)}
          trend="flat"
          trendLabel={query.trim() || statusFilter || programIdFilter || formatFilter ? "Filtered" : "All"}
        />
        <StatCard
          label="Needs Attention"
          value={rows === null ? "…" : String(rows.filter((r) => r.site_status === "issue_attention_required").length)}
          trend="flat"
          trendLabel="Of rows currently shown"
        />
      </div>

      <div className="mb-4 flex flex-col gap-2">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="flex flex-1 items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
            <Search size={16} className="text-ink-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Site ID, Outlet, or City"
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
          <select
            value={programIdFilter}
            onChange={(e) => setProgramIdFilter(e.target.value)}
            className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
          >
            <option value="">All programs</option>
            {programs.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
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
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* A genuine partner's own sites stay the default/primary view --
              this toggle is how they get visibility into every other
              partner's sites too, read-only (see
              supabase-lfg-partner-view-all-sites-migration.sql). Never
              shown to a staff sign-in, which already sees everything
              unconditionally. */}
          {identity && !identity.isStaff && (
            <div className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface p-1">
              <button
                type="button"
                onClick={() => setViewingAllSites(false)}
                aria-pressed={!viewingAllSites}
                title="Your own sites"
                className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  !viewingAllSites ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"
                }`}
              >
                <User size={14} /> My Sites
              </button>
              <button
                type="button"
                onClick={() => setViewingAllSites(true)}
                aria-pressed={viewingAllSites}
                title="Every partner's sites, read-only"
                className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewingAllSites ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface-sunken"
                }`}
              >
                <Users size={14} /> All Sites
              </button>
            </div>
          )}
          <div className="flex shrink-0 items-center gap-1 rounded-md border border-line-strong bg-surface p-1 sm:ml-auto">
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
          </div>
        </div>
      </div>

      {rows === null ? (
        <div className="rounded-lg border border-line bg-surface p-4">
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        </div>
      ) : view === "cards" ? (
        <LfgSiteCardGrid
          rows={rows}
          buildHref={(id) => lfgHref(`/sites/${id}`, onLfgHost)}
          renderQuickActions={(row) =>
            !identity?.isStaff && row.partner_id === identity?.partnerId ? (
              <LfgPartnerQuickStatusButtons
                siteId={row.id}
                siteCode={row.site_id}
                outletName={row.outlet_name}
                status={row.site_status}
                onChanged={handleStatusChanged}
              />
            ) : null
          }
        />
      ) : (
        <div className="rounded-lg border border-line bg-surface p-4">
          {rows.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-muted">No sites match your search.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(lfgHref(`/sites/${r.id}`, onLfgHost))} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
