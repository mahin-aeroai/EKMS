"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { ArrowLeft, FileSpreadsheet, Search, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Table, type TableColumn } from "@/components/ui/Table";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { cellPrimitive } from "@/lib/distribution/excelCellValue";
import type { DistributionRateCardRow } from "@/lib/distribution/types";
import {
  RATE_CARD_FIELDS,
  autoMapRateCardHeaders,
  findRateCardHeaderRow,
  missingRequiredRateCardFields,
  parseRateCardRows,
  type RateCardColumnMap,
  type RateCardFieldKey,
} from "@/lib/distribution/parseRateCard";

function formatRate(v: number | null): string {
  if (v === null) return "—";
  return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

const RATE_CARD_VIEW_COLUMNS: TableColumn<DistributionRateCardRow>[] = [
  { key: "sku_id", header: "SKU ID", width: "8rem" },
  { key: "sku_description", header: "SKU Description", render: (r) => r.sku_description ?? "—" },
  { key: "category", header: "Category", render: (r) => r.category ?? "—" },
  { key: "program", header: "Program", render: (r) => r.program ?? "—" },
  { key: "substrate", header: "Substrate", render: (r) => r.substrate ?? "—" },
  { key: "width_mm", header: "W (mm)", width: "5rem", render: (r) => r.width_mm ?? "—" },
  { key: "height_mm", header: "H (mm)", width: "5rem", render: (r) => r.height_mm ?? "—" },
  { key: "bill_rate_2023", header: "2023 Rate", render: (r) => formatRate(r.bill_rate_2023) },
  { key: "revised_rate_2026", header: "2026 Rate", render: (r) => formatRate(r.revised_rate_2026) },
];

const CHUNK_SIZE = 500;
async function chunkedUpsert(table: string, rows: Record<string, unknown>[], onConflict: string): Promise<{ error: string | null }> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) return { error: error.message };
  }
  return { error: null };
}

export default function RateCardImportClient() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [headerRow, setHeaderRow] = useState<(string | number | null)[] | null>(null);
  const [dataRows, setDataRows] = useState<(string | number | null)[][]>([]);
  const [columnMap, setColumnMap] = useState<RateCardColumnMap>({});
  const [submitting, setSubmitting] = useState(false);

  // The current Rate Card, as already loaded in the DB -- shown so Srinivas
  // can check pricing/size/description are actually right without having
  // to trust the import blindly. Refetched after a successful import below.
  const [rateCards, setRateCards] = useState<DistributionRateCardRow[]>([]);
  const [loadingRateCards, setLoadingRateCards] = useState(true);
  const [rateCardSearch, setRateCardSearch] = useState("");

  async function loadRateCards() {
    setLoadingRateCards(true);
    try {
      const rows = await fetchAllRows<DistributionRateCardRow>((from, to) =>
        supabase.from("distribution_rate_card").select("*").order("sku_id", { ascending: true }).range(from, to)
      );
      setRateCards(rows);
    } finally {
      setLoadingRateCards(false);
    }
  }

  useEffect(() => {
    // Run once on mount -- loadRateCards is re-invoked explicitly (not via
    // a dependency) after a successful import instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadRateCards();
  }, []);

  const filteredRateCards = useMemo(() => {
    const q = rateCardSearch.trim().toLowerCase();
    if (!q) return rateCards;
    return rateCards.filter((r) =>
      [r.sku_id, r.sku_description, r.category, r.program, r.substrate].some((v) => (v ?? "").toLowerCase().includes(q))
    );
  }, [rateCards, rateCardSearch]);

  const parsed = useMemo(() => (headerRow ? parseRateCardRows(dataRows, columnMap) : null), [headerRow, dataRows, columnMap]);
  const missing = useMemo(() => missingRequiredRateCardFields(columnMap), [columnMap]);

  async function handleFile(file: File) {
    setLoadingFile(true);
    setHeaderRow(null);
    setDataRows([]);
    setColumnMap({});
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const worksheet = workbook.worksheets[0];
      if (!worksheet) {
        toast("danger", "No sheet found in that file.");
        setLoadingFile(false);
        return;
      }

      const rows: (string | number | null)[][] = [];
      worksheet.eachRow((row) => {
        const values = row.values as ExcelJS.CellValue[];
        rows.push(values.slice(1).map(cellPrimitive));
      });

      const headerIdx = findRateCardHeaderRow(rows);
      if (headerIdx === -1) {
        toast("danger", "Couldn't find a header row with \"SKU ID\" in the first few rows of this file.");
        setLoadingFile(false);
        return;
      }

      const header = rows[headerIdx];
      const data = rows.slice(headerIdx + 1);
      setHeaderRow(header);
      setDataRows(data);
      setColumnMap(autoMapRateCardHeaders(header));
      setFileName(file.name);
    } catch (err) {
      toast("danger", `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingFile(false);
    }
  }

  function setFieldColumn(key: RateCardFieldKey, colIndex: number | null) {
    setColumnMap((m) => {
      const next = { ...m };
      if (colIndex === null) delete next[key];
      else next[key] = colIndex;
      return next;
    });
  }

  async function handleConfirm() {
    if (!parsed) return;
    setSubmitting(true);
    try {
      const rows = parsed.rows.map((r) => ({
        sku_id: r.skuId,
        sku_description: r.skuDescription,
        category: r.category,
        program: r.program,
        substrate: r.substrate,
        unit: r.unit,
        width_mm: r.widthMm,
        height_mm: r.heightMm,
        bill_rate_2023: r.billRate2023,
        revised_rate_2026: r.revisedRate2026,
        gsm_approval_name: r.gsmApprovalName,
        remarks: r.remarks,
        imported_at: new Date().toISOString(),
      }));

      const { error } = await chunkedUpsert("distribution_rate_card", rows, "sku_id");
      if (error) {
        toast("danger", `Import failed: ${error}`);
        setSubmitting(false);
        return;
      }

      toast("success", `Imported ${rows.length} Rate Card SKUs.`);
      setHeaderRow(null);
      setDataRows([]);
      setColumnMap({});
      setFileName(null);
      setSubmitting(false);
      await loadRateCards();
    } catch (err) {
      toast("danger", `Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Distribution", href: "/workspaces/distribution" },
          { label: "Rate Card" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Rate Card</h1>
          <p className="text-sm text-ink-secondary">
            MMDI&apos;s current pricing and sizes, and where to import or revise them from the client&apos;s Master Rate Card.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/workspaces/distribution")}>
          <ArrowLeft size={14} /> Back to Distribution
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-ink">Current Rate Card</span>
            <Badge>{rateCards.length} SKUs</Badge>
          </div>
          <div className="flex items-center gap-2 rounded-md border border-line bg-surface-sunken px-2 py-1">
            <Search size={13} className="text-ink-muted" />
            <input
              value={rateCardSearch}
              onChange={(e) => setRateCardSearch(e.target.value)}
              placeholder="Search SKU ID, description, category, program, or substrate"
              className="w-72 bg-transparent text-xs text-ink outline-none placeholder:text-ink-muted"
            />
          </div>
        </div>
        {loadingRateCards ? (
          <p className="py-10 text-center text-sm text-ink-muted">Loading…</p>
        ) : rateCards.length === 0 ? (
          <p className="py-10 text-center text-sm text-ink-muted">No Rate Card imported yet — upload one below.</p>
        ) : (
          <Table columns={RATE_CARD_VIEW_COLUMNS} rows={filteredRateCards} density="compact" />
        )}
      </div>

      <div>
        <h2 className="text-base font-semibold text-ink">Import / update</h2>
        <p className="text-sm text-ink-secondary">
          Upload MMDI&apos;s Master Rate Card — this revises pricing for every SKU the file contains (matched by SKU ID);
          it doesn&apos;t touch SKUs the new file doesn&apos;t mention.
        </p>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={loadingFile}
          className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line py-10 text-center hover:border-primary hover:bg-surface-sunken disabled:opacity-60"
        >
          <Upload size={22} className="text-ink-muted" />
          <span className="text-sm font-medium text-ink">
            {loadingFile ? "Reading workbook…" : fileName ? `${fileName} — click to replace` : "Click to choose an .xlsx file"}
          </span>
        </button>
      </div>

      {headerRow && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-1 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-ink-muted" />
            <span className="text-sm font-medium text-ink">Column mapping</span>
          </div>
          <p className="mb-3 text-xs text-ink-secondary">Auto-matched from the header row (row {headerRow ? "detected automatically" : ""}).</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {RATE_CARD_FIELDS.map((field) => (
              <label key={field.key} className="flex flex-col gap-1 text-xs">
                <span className="font-medium text-ink-secondary">
                  {field.label}
                  {field.required && <span className="text-danger"> *</span>}
                </span>
                <select
                  value={columnMap[field.key] ?? ""}
                  onChange={(e) => setFieldColumn(field.key, e.target.value === "" ? null : Number(e.target.value))}
                  className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-ink"
                >
                  <option value="">— not mapped —</option>
                  {headerRow.map((h, i) => (
                    <option key={i} value={i}>
                      {String(h ?? `Column ${i + 1}`)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
        </div>
      )}

      {parsed && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 text-sm font-medium text-ink">Preview</div>
          {missing.length > 0 ? (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
              <span>Map these required fields before importing: {missing.map((f) => f.label).join(", ")}.</span>
            </div>
          ) : (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-ink">
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
              <span>Ready to import.</span>
            </div>
          )}
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <Badge>{parsed.rows.length} SKUs</Badge>
            {parsed.skippedRows > 0 && <Badge status="warning">{parsed.skippedRows} rows skipped (no SKU ID)</Badge>}
          </div>
          <div className="mt-4 flex justify-end">
            <Button onClick={handleConfirm} disabled={missing.length > 0 || submitting} loading={submitting}>
              Import {parsed.rows.length} SKUs
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
