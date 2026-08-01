"use client";

import { useEffect, useMemo, useState } from "react";
import { Table, type TableColumn } from "@/components/ui/Table";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { WorkCentreRateRow } from "@mmdi/shared/rows";

const CONFIDENCE_BADGE: Record<WorkCentreRateRow["confidence"], { status: "success" | "warning" | "danger"; label: string }> = {
  confirmed: { status: "success", label: "Confirmed" },
  extrapolated: { status: "warning", label: "Extrapolated" },
  missing: { status: "danger", label: "Missing" },
};

// work_centre_rates, editable inline. Same three-tier honesty as the Excel
// workbook's Rate Card sheet: confirmed (from the user's real sample cost
// sheet) / extrapolated (same flat rate applied to a substrate the sample
// didn't cover) / missing (no data at all, rate is NULL until entered).
export function RateCardTab() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WorkCentreRateRow[] | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);

  function load() {
    supabase
      .from("work_centre_rates")
      .select("*")
      .order("work_centre")
      .order("substrate")
      .then(({ data, error }) => {
        if (error) {
          toast("danger", "Couldn't load the rate card");
          return;
        }
        setRows((data as WorkCentreRateRow[]) ?? []);
      });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateRate(row: WorkCentreRateRow, rate: number | null) {
    setSavingId(row.id);
    // Editing a rate away from NULL upgrades 'missing' to 'confirmed' (the
    // user just supplied the real number); it never downgrades an already-
    // confirmed/extrapolated row on its own.
    const confidence = rate !== null && row.confidence === "missing" ? "confirmed" : row.confidence;
    const { error } = await supabase.from("work_centre_rates").update({ rate, confidence }).eq("id", row.id);
    setSavingId(null);
    if (error) {
      toast("danger", `Couldn't save: ${error.message}`);
      return;
    }
    setRows((prev) => prev?.map((r) => (r.id === row.id ? { ...r, rate, confidence } : r)) ?? null);
  }

  const summary = useMemo(() => {
    if (!rows) return null;
    return {
      confirmed: rows.filter((r) => r.confidence === "confirmed").length,
      extrapolated: rows.filter((r) => r.confidence === "extrapolated").length,
      missing: rows.filter((r) => r.confidence === "missing").length,
    };
  }, [rows]);

  if (!rows) return <p className="py-8 text-center text-sm text-ink-muted">Loading…</p>;

  const columns: TableColumn<WorkCentreRateRow>[] = [
    { key: "work_centre", header: "Work Centre", sortable: true },
    { key: "print_mode", header: "Print Mode" },
    { key: "substrate", header: "Substrate" },
    { key: "rate_basis", header: "Basis", render: (r) => (r.rate_basis === "per_piece" ? "Per piece" : "Per sqft") },
    {
      key: "rate",
      header: "Rate (₹)",
      render: (r) => (
        <input
          type="number"
          step="0.01"
          value={r.rate ?? ""}
          onChange={(e) => updateRate(r, e.target.value === "" ? null : Number(e.target.value))}
          placeholder="enter rate"
          className="h-8 w-24 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none placeholder:text-ink-muted"
        />
      ),
    },
    {
      key: "confidence",
      header: "Confidence",
      render: (r) => {
        const c = CONFIDENCE_BADGE[r.confidence];
        return (
          <span className="flex items-center gap-1.5">
            <Badge status={c.status}>{c.label}</Badge>
            {savingId === r.id && <span className="text-[11px] text-ink-muted">saving…</span>}
          </span>
        );
      },
    },
    { key: "note", header: "Note", render: (r) => <span className="text-ink-secondary">{r.note ?? "—"}</span> },
  ];

  return (
    <div>
      <p className="mb-4 text-sm text-ink-secondary">
        {rows.length} work centre / print mode / substrate combinations -- derived from the BOM templates&apos; work centres
        and print modes (BOM Master), including any new combo created there when a template&apos;s print mode was set to
        something new.{" "}
        {summary && (
          <>
            <Badge status="success">{summary.confirmed} confirmed</Badge>{" "}
            <Badge status="warning">{summary.extrapolated} extrapolated</Badge>{" "}
            <Badge status="danger">{summary.missing} missing</Badge> — the Cost Sheet tab can&apos;t total a job correctly until
            every work centre it uses has a real rate here.
          </>
        )}
      </p>
      <Table columns={columns} rows={rows} density="compact" />
    </div>
  );
}
