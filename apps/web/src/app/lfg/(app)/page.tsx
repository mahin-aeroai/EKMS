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

// Real LFG partner Site Master (task #19) -- replaces the earlier
// placeholder home. Same debounced search + status filter shape as the
// staff Site Master (workspaces/lfg/page.tsx), trimmed to what a partner
// actually needs: no Program/Partner columns (every row here already IS
// their own program's sites), no delete action (lfg_sites_delete_staff is
// admin-only), no financial fields (never selected -- see the site-detail
// server page's own comment on why that's not just a UI omission).
//
// `.eq("partner_id", identity.partnerId)` below is belt-and-braces on top
// of lfg_sites_select RLS (which already scopes SELECT to
// `is_mmdi_staff() or partner_id = lfg_partner_id()`) -- not the real
// boundary, just makes the intent explicit in the query itself.
interface PartnerSiteRow {
  id: string;
  site_id: string;
  outlet_name: string;
  city: string | null;
  material: string | null;
  site_status: string;
  number_of_sites: number;
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
    supabase
      .from("lfg_sites")
      .select("*", { count: "exact", head: true })
      .eq("partner_id", identity.partnerId)
      .then(({ count }) => setTotalCount(count ?? 0));
  }, [identity]);

  useEffect(() => {
    if (!identity) return;
    const handle = setTimeout(() => {
      let q = supabase
        .from("lfg_sites")
        .select("id, site_id, outlet_name, city, material, site_status, number_of_sites")
        .eq("partner_id", identity.partnerId)
        .order("created_at", { ascending: false })
        .limit(200);

      if (statusFilter) q = q.eq("site_status", statusFilter);

      const trimmed = query.trim();
      if (trimmed) {
        q = q.or(`site_id.ilike.%${trimmed}%,outlet_name.ilike.%${trimmed}%,city.ilike.%${trimmed}%`);
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
    { key: "outlet_name", header: "Outlet", sortable: true },
    { key: "city", header: "City", sortable: true, render: (r) => r.city ?? "—" },
    {
      key: "site_status",
      header: "Status",
      sortable: true,
      render: (r) => <Badge status={lfgStatusBadge(r.site_status)}>{lfgStatusLabel(r.site_status)}</Badge>,
    },
    { key: "number_of_sites", header: "# Sites", sortable: true },
  ];

  return (
    <div>
      <h1 className="text-lg font-semibold text-ink">Your Sites</h1>
      <p className="mt-1 text-sm text-ink-secondary">
        Every site assigned to {identity?.partnerName || "your account"} — open one to log a survey, update
        production/shipment/installation, upload photos and documents, or change its status.
      </p>

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Sites" value={totalCount === null ? "…" : String(totalCount)} trend="flat" trendLabel="Assigned to you" />
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
          <Table columns={COLUMNS} rows={rows} onRowClick={(r) => router.push(lfgHref(`/sites/${r.id}`, onLfgHost))} />
        )}
      </div>
    </div>
  );
}
