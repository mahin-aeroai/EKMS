"use client";

import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type SignEstimateRow } from "@/lib/supabase";
import { fmtRupee } from "@/lib/sign-estimator/calc";

export function HistoryTab({ refreshKey, onOpenEstimate }: { refreshKey: number; onOpenEstimate: (ref: string) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<SignEstimateRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("sign_estimates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) { toast("danger", "Couldn't load estimate history"); return; }
        setRows((data as SignEstimateRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  function exportCSV() {
    if (!rows || !rows.length) { toast("danger", "No history to export."); return; }
    const hdr = ["Ref", "Client", "Category", "Width(mm)", "Height(mm)", "Qty", "Selling Price", "Final Amount", "Margin%", "Date"];
    const lines = rows.map((r) => [
      r.ref, r.client ?? "", r.category ?? "", r.width_mm, r.height_mm, r.qty,
      r.sell.toFixed(2), r.final_amount.toFixed(2), r.margin.toFixed(1), r.created_at,
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const csv = [hdr.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `SignEstimator_History_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const columns: TableColumn<SignEstimateRow>[] = [
    { key: "ref", header: "Ref No.", sortable: true },
    { key: "client", header: "Client", sortable: true, render: (r) => r.client ?? "—" },
    { key: "category", header: "Category", render: (r) => r.category ?? "—" },
    { key: "width_mm", header: "Size (mm)", render: (r) => `${r.width_mm}×${r.height_mm}` },
    { key: "qty", header: "Qty" },
    { key: "sell", header: "Sell Price", render: (r) => fmtRupee(r.sell) },
    { key: "margin", header: "Margin", render: (r) => `${r.margin}%` },
    { key: "final_amount", header: "Final (incl. GST)", render: (r) => fmtRupee(r.final_amount) },
  ];

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <Button variant="secondary" size="sm" onClick={exportCSV}>
          <Download size={14} /> Export CSV
        </Button>
      </div>
      <div className="rounded-lg border border-line bg-surface p-4">
        {rows === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">No saved estimates.</p>
        ) : (
          <Table columns={columns} rows={rows} onRowClick={(r) => onOpenEstimate(r.ref)} />
        )}
      </div>
    </div>
  );
}
