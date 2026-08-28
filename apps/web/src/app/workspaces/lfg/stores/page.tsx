"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Store as StoreIcon, Plus } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { StatCard } from "@/components/ui/Card";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Button } from "@/components/ui/Button";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { LfgConnectHeader } from "@/components/workspaces/LfgConnectHeader";

// Stores (task #62-#71's "Store entity" -- an outlet/location that can
// host more than one lfg_sites row, e.g. a window display AND an in-store
// display at the same Croma). Mirrors the Programs page's own pattern
// (list + per-row aggregate + click-through to a filtered Site Master),
// with no standalone "create" form here -- a store comes into existence
// either from the STEP 21b backfill (existing sites, grouped by SFO ID)
// or from the New Site form's "A new store" mode (task #66), since a
// store with zero displays isn't a useful thing to have on file.
interface StoreRow {
  id: string;
  store_name: string;
  sfo_id: string | null;
  city: string | null;
  format: string | null;
  partner_id: string | null;
  lfg_partners: { name: string } | { name: string }[] | null;
}

interface SiteForStoreRow {
  store_id: string | null;
  site_verified_at: string | null;
}

interface StoreTableRow {
  id: string;
  store_name: string;
  sfo_id: string | null;
  city: string | null;
  format: string | null;
  partnerName: string;
  displayCount: number;
  verifiedStatus: BadgeStatus;
  verifiedLabel: string;
}

function partnerName(row: StoreRow): string {
  const p = Array.isArray(row.lfg_partners) ? row.lfg_partners[0] : row.lfg_partners;
  return p?.name ?? "—";
}

export default function LfgStoresPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [storeRows, setStoreRows] = useState<StoreRow[] | null>(null);
  const [siteRows, setSiteRows] = useState<SiteForStoreRow[] | null>(null);

  useEffect(() => {
    // Paginated past PostgREST's 1000-row cap (see fetchAllRows's own
    // header comment) -- a plain `.limit(5000)` here would silently be
    // overridden back down to 1000 by the server once the store count
    // grows past it, same class of bug fixed on the Site Master (task #69).
    fetchAllRows<StoreRow>((from, to) =>
      supabase
        .from("lfg_stores")
        .select("id, store_name, sfo_id, city, format, partner_id, lfg_partners(name)")
        .order("store_name")
        .range(from, to)
    ).then(setStoreRows);
    // Every site's store_id + verified milestone, same reasoning -- used
    // only to compute each store's display count and verified badge below,
    // never rendered directly.
    fetchAllRows<SiteForStoreRow>((from, to) =>
      supabase.from("lfg_sites").select("store_id, site_verified_at").range(from, to)
    ).then(setSiteRows);
  }, []);

  const loading = storeRows === null || siteRows === null;

  const tableRows: StoreTableRow[] = loading
    ? []
    : storeRows!
        .map((s): StoreTableRow => {
          const sites = siteRows!.filter((r) => r.store_id === s.id);
          const displayCount = sites.length;
          const verifiedCount = sites.filter((r) => r.site_verified_at !== null).length;
          const verifiedStatus: BadgeStatus =
            displayCount === 0 ? "neutral" : verifiedCount === displayCount ? "success" : verifiedCount > 0 ? "warning" : "neutral";
          const verifiedLabel =
            displayCount === 0
              ? "No displays"
              : verifiedCount === displayCount
                ? "Verified"
                : verifiedCount > 0
                  ? `${verifiedCount}/${displayCount} verified`
                  : "Unverified";
          return {
            id: s.id,
            store_name: s.store_name,
            sfo_id: s.sfo_id,
            city: s.city,
            format: s.format,
            partnerName: partnerName(s),
            displayCount,
            verifiedStatus,
            verifiedLabel,
          };
        })
        .filter((r) => {
          const q = query.trim().toLowerCase();
          if (!q) return true;
          return (
            r.store_name.toLowerCase().includes(q) ||
            (r.sfo_id ?? "").toLowerCase().includes(q) ||
            (r.city ?? "").toLowerCase().includes(q)
          );
        });

  const multiDisplayCount = tableRows.filter((r) => r.displayCount > 1).length;

  const COLUMNS: TableColumn<StoreTableRow>[] = [
    { key: "store_name", header: "Store", sortable: true },
    { key: "sfo_id", header: "SFO / Apple ID", sortable: true, render: (r) => r.sfo_id ?? "—" },
    { key: "city", header: "City", sortable: true, render: (r) => r.city ?? "—" },
    { key: "format", header: "Format", sortable: true, render: (r) => r.format ?? "—" },
    { key: "partnerName", header: "Partner", sortable: true },
    {
      key: "displayCount",
      header: "Displays",
      sortable: true,
      render: (r) => <Badge status={r.displayCount > 1 ? "info" : "neutral"}>{r.displayCount}</Badge>,
    },
    {
      key: "verifiedStatus",
      header: "Verified",
      render: (r) => <Badge status={r.verifiedStatus}>{r.verifiedLabel}</Badge>,
    },
  ];

  function openStore(r: StoreTableRow) {
    router.push(`/workspaces/lfg?store_id=${encodeURIComponent(r.id)}&store_name=${encodeURIComponent(r.store_name)}`);
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Stores" }]} />

      <LfgConnectHeader
        icon={StoreIcon}
        section="Stores"
        subtitle={
          'One row per physical outlet — open one to see every display (site) placed there. A store with more than one display got there either from the SFO ID grouping backfill or from "Add Display to Existing Store" on the New Site form.'
        }
        action={
          <Button onClick={() => router.push("/workspaces/lfg/new")}>
            <Plus size={15} className="mr-1.5" /> New Site
          </Button>
        }
      />

      <div className="my-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total Stores" value={loading ? "…" : String(tableRows.length)} trend="flat" trendLabel="All outlets" />
        <StatCard
          label="Multi-Display Stores"
          value={loading ? "…" : String(multiDisplayCount)}
          trend="flat"
          trendLabel="More than one site"
        />
        <StatCard
          label="Total Displays"
          value={loading ? "…" : String(tableRows.reduce((sum, r) => sum + r.displayCount, 0))}
          trend="flat"
          trendLabel="Sites across all stores"
        />
      </div>

      <div className="mb-4 flex items-center gap-2 rounded-md border border-line-strong bg-surface px-3 py-2">
        <Search size={16} className="text-ink-muted" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search store name, SFO ID, or city"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        {loading ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading stores…</p>
        ) : tableRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No stores match your search.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table columns={COLUMNS} rows={tableRows} onRowClick={openStore} />
          </div>
        )}
      </div>
    </div>
  );
}
