"use client";

import { useEffect, useState } from "react";
import { StatCard } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase, type SignEstimateRow } from "@/lib/supabase";
import { fmtRupee } from "@/lib/sign-estimator/calc";

export function DashboardTab({ refreshKey, onOpenEstimate }: { refreshKey: number; onOpenEstimate: (ref: string) => void }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<SignEstimateRow[] | null>(null);

  useEffect(() => {
    supabase
      .from("sign_estimates")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500)
      .then(({ data, error }) => {
        if (error) { toast("danger", "Couldn't load dashboard data"); return; }
        setRows((data as SignEstimateRow[]) ?? []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshKey]);

  if (rows === null) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-ink-muted">No quotes yet — create your first estimate from the Estimator tab.</p>;
  }

  const totalRev = rows.reduce((s, r) => s + (r.final_amount || 0), 0);
  const totalMat = rows.reduce((s, r) => {
    const pricing = (r.calc as Record<string, unknown> | null)?.pricing as { raw?: number } | undefined;
    return s + (pricing?.raw ?? 0);
  }, 0);
  const avgMargin = Math.round(rows.reduce((s, r) => s + (r.margin || 0), 0) / rows.length);

  const catCount = new Map<string, number>();
  rows.forEach((r) => catCount.set(r.category ?? "—", (catCount.get(r.category ?? "—") ?? 0) + 1));

  return (
    <div>
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <StatCard label="Total Material Cost" value={fmtRupee(totalMat)} trend="flat" trendLabel={`${rows.length} quotes`} />
        <StatCard label="Avg. Gross Margin" value={`${avgMargin}%`} trend="flat" trendLabel="Across all quotes" />
        <StatCard label="Total Quoted (incl. GST)" value={fmtRupee(totalRev)} trend="flat" trendLabel="All time" />
        <StatCard label="Quotes Generated" value={String(rows.length)} trend="flat" trendLabel="All time" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Category Breakdown</h3>
          <table className="w-full text-sm">
            <tbody>
              {[...catCount.entries()].map(([cat, n]) => (
                <tr key={cat} className="border-t border-line">
                  <td className="p-2 text-ink-secondary">{cat}</td>
                  <td className="p-2 text-right font-medium text-ink">{n} quote{n > 1 ? "s" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="rounded-lg border border-line bg-surface p-4">
          <h3 className="mb-3 text-sm font-semibold text-ink">Recent Quotes</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-ink-secondary"><tr><th className="p-2 text-left">Ref</th><th className="p-2 text-left">Client</th><th className="p-2 text-right">Amount</th></tr></thead>
            <tbody>
              {rows.slice(0, 6).map((r) => (
                <tr key={r.id} className="cursor-pointer border-t border-line hover:bg-surface-sunken" onClick={() => onOpenEstimate(r.ref)}>
                  <td className="p-2 text-xs">{r.ref}</td>
                  <td className="p-2 text-xs">{r.client ?? "—"}</td>
                  <td className="p-2 text-right font-medium">{fmtRupee(r.final_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
