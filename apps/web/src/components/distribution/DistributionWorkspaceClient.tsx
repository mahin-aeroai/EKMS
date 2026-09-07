"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FileDown, Package, Plus, Search } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeStatus } from "@/components/ui/Badge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { buildDistributionLabelsPdf, downloadBlob } from "@/lib/distribution/labelPdf";
import { displayStoreName, type DistributionItemRow, type DistributionPackStatus, type DistributionSeasonRow, type DistributionStoreRow } from "@/lib/distribution/types";

const PACK_STATUS_BADGE: Record<DistributionPackStatus, BadgeStatus> = {
  pending: "neutral",
  packed: "info",
  shipped: "warning",
  delivered: "success",
};

interface StoreRow extends DistributionStoreRow {
  itemCount: number;
}

export default function DistributionWorkspaceClient() {
  const router = useRouter();
  const { toast } = useToast();

  // Read ?season= directly from window.location rather than useSearchParams
  // -- same reasoning as LFG Site Master (see workspaces/lfg/page.tsx):
  // avoids the Suspense-boundary requirement useSearchParams imposes, for a
  // value that's purely an initial-selection hint. Safe to read at module
  // scope here since this component is only ever mounted client-side
  // (ssr: false in workspaces/distribution/page.tsx).
  const [seasons, setSeasons] = useState<DistributionSeasonRow[]>([]);
  const [seasonId, setSeasonId] = useState<string | null>(() => new URLSearchParams(window.location.search).get("season"));
  const [stores, setStores] = useState<DistributionStoreRow[]>([]);
  const [itemsByStore, setItemsByStore] = useState<Map<string, DistributionItemRow[]>>(new Map());
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [generating, setGenerating] = useState<string | null>(null); // "season" | store id | null

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("distribution_seasons").select("*").order("created_at", { ascending: false });
      if (error) {
        toast("danger", `Couldn't load seasons: ${error.message}`);
        return;
      }
      setSeasons((data as DistributionSeasonRow[]) ?? []);
      if (!seasonId && data && data.length > 0) setSeasonId(data[0].id as string);
    })();
    // Run once on mount only -- seasonId is read here purely to avoid
    // clobbering a season already picked from the URL; toast is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No seasonId (no seasons imported yet) -- nothing to fetch. `stores`/
  // `itemsByStore` keep their initial empty values, so there's no reset to
  // perform here; skipping the effect body entirely (rather than
  // synchronously clearing state in it) is what react-hooks/set-state-in-effect
  // wants for this case.
  useEffect(() => {
    if (!seasonId) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    (async () => {
      const { data: storeRows, error: storeError } = await supabase
        .from("distribution_stores")
        .select("*")
        .eq("season_id", seasonId)
        .order("sl_no", { ascending: true });

      if (storeError) {
        toast("danger", `Couldn't load stores: ${storeError.message}`);
        setLoading(false);
        return;
      }

      const typedStores = (storeRows as DistributionStoreRow[]) ?? [];
      setStores(typedStores);

      const storeIds = typedStores.map((s) => s.id);
      if (storeIds.length === 0) {
        setItemsByStore(new Map());
        setLoading(false);
        return;
      }

      const { data: itemRows, error: itemError } = await supabase.from("distribution_items").select("*").in("store_id", storeIds);
      if (itemError) {
        toast("danger", `Couldn't load line items: ${itemError.message}`);
        setLoading(false);
        return;
      }

      const map = new Map<string, DistributionItemRow[]>();
      for (const item of (itemRows as DistributionItemRow[]) ?? []) {
        const list = map.get(item.store_id) ?? [];
        list.push(item);
        map.set(item.store_id, list);
      }
      setItemsByStore(map);
      setLoading(false);
    })();
  }, [seasonId, toast]);

  function selectSeason(id: string) {
    setSeasonId(id);
    router.replace(`/workspaces/distribution?season=${id}`, { scroll: false });
  }

  const rows: StoreRow[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return stores
      .map((s) => ({ ...s, itemCount: itemsByStore.get(s.id)?.length ?? 0 }))
      .filter((s) => {
        if (!q) return true;
        return (
          (s.sfo_id ?? "").toLowerCase().includes(q) ||
          displayStoreName(s.store_name, s.shipping_city).toLowerCase().includes(q) ||
          (s.shipping_city ?? "").toLowerCase().includes(q) ||
          (s.programme ?? "").toLowerCase().includes(q)
        );
      });
  }, [stores, itemsByStore, search]);

  const totals = useMemo(
    () => ({
      stores: stores.length,
      items: [...itemsByStore.values()].reduce((n, list) => n + list.length, 0),
      units: stores.reduce((n, s) => n + s.total_units, 0),
    }),
    [stores, itemsByStore]
  );

  const season = seasons.find((s) => s.id === seasonId) ?? null;

  async function generateLabels(target: "season" | StoreRow) {
    const targetStores = target === "season" ? stores : [target];
    if (targetStores.length === 0) return;
    setGenerating(target === "season" ? "season" : target.id);
    try {
      const withItems = targetStores.map((s) => ({ ...s, items: itemsByStore.get(s.id) ?? [] }));
      const blob = await buildDistributionLabelsPdf(withItems);
      const name = target === "season" ? season?.name ?? "Distribution" : displayStoreName(target.store_name, target.shipping_city);
      downloadBlob(blob, `${name.replace(/[^\w -]+/g, "").trim() || "labels"}_labels.pdf`.replace(/\s+/g, "_"));
    } catch (err) {
      toast("danger", `Couldn't generate labels: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setGenerating(null);
    }
  }

  const COLUMNS: TableColumn<StoreRow>[] = [
    { key: "sl_no", header: "Sl No", width: "4rem" },
    { key: "sfo_id", header: "SFO ID", width: "6rem" },
    {
      key: "store_name",
      header: "Store",
      render: (row) => displayStoreName(row.store_name, row.shipping_city),
    },
    { key: "shipping_city", header: "City" },
    { key: "programme", header: "Programme" },
    { key: "itemCount", header: "Items", width: "5rem" },
    { key: "total_units", header: "Units", width: "5rem" },
    {
      key: "pack_status",
      header: "Pack Status",
      render: (row) => <Badge status={PACK_STATUS_BADGE[row.pack_status]}>{row.pack_status}</Badge>,
    },
    {
      key: "id",
      header: "",
      render: (row) => (
        <Button variant="ghost" size="sm" loading={generating === row.id} onClick={() => generateLabels(row)}>
          <FileDown size={13} /> Label
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Distribution" }]} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">Distribution</h1>
          <p className="text-sm text-ink-secondary">
            Apple seasonal distribution — store-wise packing labels, generated from the imported Distribution Brief.
          </p>
        </div>
        <Button onClick={() => router.push("/workspaces/distribution/import")}>
          <Plus size={14} /> Import a season
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-medium text-ink-secondary">Season</span>
          <select
            value={seasonId ?? ""}
            onChange={(e) => selectSeason(e.target.value)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
          >
            {seasons.length === 0 && <option value="">No seasons imported yet</option>}
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
                {s.dispatch_wave ? ` (${s.dispatch_wave})` : ""}
              </option>
            ))}
          </select>
        </label>
        {season && <Badge status={season.status === "draft" ? "neutral" : "info"}>{season.status}</Badge>}
        <div className="h-4 w-px bg-line" />
        <div className="flex items-center gap-3 text-xs text-ink-secondary">
          <span>{totals.stores} stores</span>
          <span>{totals.items} line items</span>
          <span>{totals.units} units</span>
        </div>
        <div className="ml-auto">
          <Button variant="secondary" size="sm" loading={generating === "season"} disabled={stores.length === 0} onClick={() => generateLabels("season")}>
            <Package size={14} /> Generate all labels
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-2">
        <Search size={15} className="text-ink-muted" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search SFO ID, store, city, or programme"
          className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-muted"
        />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>
      ) : stores.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-16 text-center">
          <Package size={26} className="text-ink-muted" />
          <p className="text-sm font-medium text-ink">
            {seasons.length === 0 ? "No seasons imported yet" : "This season has no stores"}
          </p>
          <Button size="sm" onClick={() => router.push("/workspaces/distribution/import")}>
            <Plus size={14} /> Import a Distribution Brief
          </Button>
        </div>
      ) : (
        <Table columns={COLUMNS} rows={rows} density="compact" />
      )}
    </div>
  );
}
