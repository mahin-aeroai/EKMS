"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { useLfgUser } from "@/lib/LfgUserContext";
import { useLfgHost, lfgHref } from "@/lib/lfg-links";
import { supabase } from "@/lib/supabase";
import { LFG_STATUSES, lfgStatusLabel, lfgStatusBadge } from "@/lib/lfgStatus";
import { formatMm, formatSizeInches, formatDecimal } from "@/lib/lfg-units";

// Real LFG partner Site Master (task #19) -- replaces the earlier
// placeholder home. Same debounced search + status filter shape as the
// staff Site Master (workspaces/lfg/page.tsx), trimmed to what a partner
// actually needs: no Format/Partner columns (every row here already IS
// their own format's sites), no delete action (lfg_sites_delete_staff is
// admin-only), no financial fields (never selected -- see the site-detail
// server page's own comment on why that's not just a UI omission).
//
// `.eq("partner_id", identity.partnerId)` below is belt-and-braces on top
// of lfg_sites_select RLS (which already scopes SELECT to
// `is_mmdi_staff() or partner_id = lfg_partner_id()`) -- not the real
// boundary, just makes the intent explicit in the query itself. Skipped
// entirely for identity.isStaff (a selectively lfg_connect_access-flagged
// MMDI staff sign-in, see lfg-auth.ts) -- that filter would otherwise show
// them zero sites, since a staff account has no partner_id of its own;
// they see every site instead, with an extra Partner column so it's clear
// whose site each row belongs to.
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
  material: string | null;
  mat_code: string | null;
  width: number | null;
  height: number | null;
  bleed: number | null;
  active: boolean;
  format: string | null;
  site_status: string;
  number_of_sites: number;
  lfg_partners: { name: string } | { name: string }[] | null;
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
  const [rows, setRows] = useState<PartnerSiteRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);

  useEffect(() => {
    if (!identity) return;
    let q = supabase.from("lfg_sites").select("*", { count: "exact", head: true });
    if (!identity.isStaff) q = q.eq("partner_id", identity.partnerId);
    q.then(({ count }) => setTotalCount(count ?? 0));
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    const handle = setTimeout(() => {
      let q = supabase
        .from("lfg_sites")
        .select(
          "id, site_id, outlet_name, sfo_id, city, region, material, mat_code, width, height, bleed, active, format, site_status, number_of_sites, lfg_partners(name)"
        )
        .order("sfo_id", { ascending: true, nullsFirst: false })
        .limit(identity.isStaff ? 5000 : 200);
      if (!identity.isStaff) q = q.eq("partner_id", identity.partnerId);

      if (statusFilter) q = q.eq("site_status", statusFilter);

      const trimmed = query.trim();
      if (trimmed) {
        q = q.or(`site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,sfo_id.ilike.%${trimmed}%,city.ilike.%${trimmed}%`);
      }

      q.then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load your sites from Supabase");
          return;
        }
        setRows((data as unknown as PartnerSiteRow[]) ?? []);
      });
    }, 250);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, query, statusFilter]);

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
    // Only meaningful once rows span more than one partner -- i.e. staff
    // mode, where every site is shown, not just one partner's own.
    ...(identity?.isStaff
      ? [{ key: "lfg_partners", header: "Partner", render: (r) => partnerName(r) } satisfies TableColumn<PartnerSiteRow>]
      : []),
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink">{identity?.isStaff ? "All Sites" : "Your Sites"}</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        {identity?.isStaff
          ? "Every site across every partner — open one to log a survey, update production/shipment/installation, upload photos and documents, or change its status."
          : `Every site assigned to ${identity?.partnerName || "your account"} — open one to log a survey, update production/shipment/installation, upload photos and documents, or change its status.`}
      </p>

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Total Sites"
          value={totalCount === null ? "…" : String(totalCount)}
          trend="flat"
          trendLabel={identity?.isStaff ? "All partners" : "Assigned to you"}
        />
        <StatCard
          label="Showing"
          value={rows === null ? "…" : String(rows.length)}
          trend="flat"
          trendLabel={query.trim() || statusFilter ? "Filtered" : "All"}
        />
        <StatCard
          label="Needs Attention"
          value={rows === null ? "…" : String(rows.filter((r) => r.site_status === "issue_attention_required").length)}
          trend="flat"
          trendLabel="Of rows currently shown"
        />
      </div>

      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
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
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading sites…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No sites match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(lfgHref(`/sites/${r.id}`, onLfgHost))} />
          </div>
        )}
      </div>
    </div>
  );
}
