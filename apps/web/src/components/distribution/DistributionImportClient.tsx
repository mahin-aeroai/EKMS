"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { ArrowLeft, FileSpreadsheet, Upload, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { cellPrimitive } from "@/lib/distribution/excelCellValue";
import {
  DISTRIBUTION_FIELDS,
  autoMapHeaders,
  missingRequiredFields,
  parseDistributionBriefRows,
  type ColumnMap,
  type DistributionFieldKey,
  type ParseResult,
} from "@/lib/distribution/parseDistributionBrief";

interface SheetData {
  name: string;
  headerRow: (string | number | null)[];
  dataRows: (string | number | null)[][];
}

// Batched inserts keep any single request well under Supabase's payload/row
// limits -- a full season (Fall 2026: 229 stores / ~1250 items) comfortably
// fits in 3-4 chunks either way.
const CHUNK_SIZE = 500;
async function chunkedInsert(table: string, rows: Record<string, unknown>[]): Promise<{ error: string | null }> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}

export default function DistributionImportClient() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [sheets, setSheets] = useState<SheetData[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  const [seasonName, setSeasonName] = useState("");
  const [dispatchWave, setDispatchWave] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const sheet = useMemo(() => sheets.find((s) => s.name === selectedSheet) ?? null, [sheets, selectedSheet]);

  const parseResult: ParseResult | null = useMemo(() => {
    if (!sheet) return null;
    return parseDistributionBriefRows(sheet.dataRows, columnMap);
  }, [sheet, columnMap]);

  const missing = useMemo(() => missingRequiredFields(columnMap), [columnMap]);

  async function handleFile(file: File) {
    setLoadingFile(true);
    setSheets([]);
    setSelectedSheet(null);
    setColumnMap({});
    try {
      const buffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(buffer);

      const parsedSheets: SheetData[] = [];
      workbook.eachSheet((worksheet) => {
        const rows: (string | number | null)[][] = [];
        worksheet.eachRow((row) => {
          const values = row.values as ExcelJS.CellValue[]; // 1-indexed, [0] unused
          rows.push(values.slice(1).map(cellPrimitive));
        });
        if (rows.length === 0) return;
        parsedSheets.push({ name: worksheet.name, headerRow: rows[0], dataRows: rows.slice(1) });
      });

      if (parsedSheets.length === 0) {
        toast("danger", "No sheets with data found in that file.");
        setLoadingFile(false);
        return;
      }

      setSheets(parsedSheets);
      setFileName(file.name);
      if (!seasonName) setSeasonName(file.name.replace(/\.xlsx$/i, ""));

      // Auto-select the sheet whose name mentions "distribution" -- matches
      // both "Distribution Brief" and a plainer "Distribution" tab name, per
      // Srinivas's own instruction ("leave other pages take only
      // distribution sheet within excel document").
      const auto = parsedSheets.find((s) => /distribution/i.test(s.name)) ?? parsedSheets[0];
      setSelectedSheet(auto.name);
      setColumnMap(autoMapHeaders(auto.headerRow));
    } catch (err) {
      toast("danger", `Couldn't read that file: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingFile(false);
    }
  }

  function selectSheet(name: string) {
    setSelectedSheet(name);
    const s = sheets.find((x) => x.name === name);
    setColumnMap(s ? autoMapHeaders(s.headerRow) : {});
  }

  function setFieldColumn(key: DistributionFieldKey, colIndex: number | null) {
    setColumnMap((m) => {
      const next = { ...m };
      if (colIndex === null) delete next[key];
      else next[key] = colIndex;
      return next;
    });
  }

  async function handleConfirm() {
    if (!parseResult || !seasonName.trim()) return;
    setSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data: season, error: seasonError } = await supabase
        .from("distribution_seasons")
        .insert({
          name: seasonName.trim(),
          dispatch_wave: dispatchWave.trim() || parseResult.dispatchWave,
          source_file_name: fileName,
          status: "imported",
          imported_at: new Date().toISOString(),
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();

      if (seasonError || !season) {
        toast("danger", `Couldn't create the season: ${seasonError?.message ?? "unknown error"}`);
        setSubmitting(false);
        return;
      }

      const storeRows = parseResult.stores.map((s) => ({
        season_id: season.id,
        sl_no: s.slNo,
        sfo_id: s.sfoId,
        apple_id: s.appleId,
        fixture_id: s.fixtureId,
        store_name: s.storeName,
        reseller_name: s.resellerName,
        programme: s.programme,
        shipping_city: s.shippingCity,
        shipping_address_line1: s.shippingAddress1,
        shipping_address_line2: s.shippingAddress2,
        shipping_address_line3: s.shippingAddress3,
        shipping_state: s.shippingState,
        shipping_postal_code: s.shippingPostalCode,
        shipping_country: s.shippingCountry,
        pos_address_line1: s.posAddress1,
        pos_address_line2: s.posAddress2,
        pos_address_line3: s.posAddress3,
        pos_city: s.posCity,
        pos_zip: s.posZip,
        total_units: s.totalUnits,
      }));

      const { error: storesError } = await chunkedInsert("distribution_stores", storeRows);
      if (storesError) {
        toast("danger", `Season created, but stores failed to import: ${storesError}`);
        setSubmitting(false);
        return;
      }

      // Re-fetch the just-inserted stores to map sfo_id -> id for the items
      // insert -- .insert().select() with 500-row chunks risks response-size
      // limits, a plain select back by season_id is simpler and reliable.
      const { data: insertedStores, error: fetchStoresError } = await supabase
        .from("distribution_stores")
        .select("id, sfo_id")
        .eq("season_id", season.id);

      if (fetchStoresError || !insertedStores) {
        toast("danger", `Stores imported, but couldn't read them back for item linking: ${fetchStoresError?.message}`);
        setSubmitting(false);
        return;
      }

      const storeIdBySfoId = new Map(insertedStores.map((r) => [r.sfo_id, r.id as string]));
      const itemRows = parseResult.stores.flatMap((s) => {
        const storeId = storeIdBySfoId.get(s.sfoId);
        if (!storeId) return [];
        return s.items.map((it) => ({
          store_id: storeId,
          part_number: it.partNumber,
          master_part_number: it.masterPartNumber,
          loc: it.loc,
          item_type: it.itemType,
          item_type_costs: it.itemTypeCosts,
          deliverable_description: it.deliverableDescription,
          quantity: it.quantity,
          unit_price: it.unitPrice,
          amount: it.amount,
        }));
      });

      const { error: itemsError } = await chunkedInsert("distribution_items", itemRows);
      if (itemsError) {
        toast("danger", `Stores imported, but line items failed: ${itemsError}`);
        setSubmitting(false);
        return;
      }

      toast("success", `Imported ${storeRows.length} stores / ${itemRows.length} line items into "${seasonName.trim()}".`);
      router.push(`/workspaces/distribution?season=${season.id}`);
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
          { label: "Import" },
        ]}
      />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Import Distribution Brief</h1>
          <p className="text-sm text-ink-secondary">
            Upload the season&apos;s Apple distribution sheet — only the sheet with &quot;Distribution&quot; in its name is
            read; every other tab is ignored.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/workspaces/distribution")}>
          <ArrowLeft size={14} /> Back to Distribution
        </Button>
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

      {sheets.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-ink-muted" />
            <span className="text-sm font-medium text-ink">Sheet</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {sheets.map((s) => (
              <button
                key={s.name}
                onClick={() => selectSheet(s.name)}
                className={
                  "rounded-full border px-3 py-1 text-xs font-medium " +
                  (s.name === selectedSheet
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-line text-ink-secondary hover:bg-surface-sunken")
                }
              >
                {s.name} <span className="text-ink-muted">({s.dataRows.length} rows)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {sheet && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <div className="mb-3 text-sm font-medium text-ink">Column mapping</div>
          <p className="mb-3 text-xs text-ink-secondary">
            Auto-matched from the header row. Fix anything that didn&apos;t match — a blank field is skipped on import.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {DISTRIBUTION_FIELDS.map((field) => (
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
                  {sheet.headerRow.map((h, i) => (
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

      {parseResult && (
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
            <Badge>{parseResult.stores.length} stores</Badge>
            <Badge>{parseResult.stores.reduce((n, s) => n + s.items.length, 0)} line items</Badge>
            <Badge>{parseResult.stores.reduce((n, s) => n + s.totalUnits, 0)} total units</Badge>
            {parseResult.skippedRows > 0 && (
              <Badge status="warning">{parseResult.skippedRows} rows skipped (no SFO ID)</Badge>
            )}
          </div>

          {parseResult.warnings.length > 0 && (
            <ul className="mb-4 list-inside list-disc text-xs text-warning">
              {parseResult.warnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
          )}

          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-ink-secondary">Season name *</span>
              <input
                value={seasonName}
                onChange={(e) => setSeasonName(e.target.value)}
                placeholder='e.g. "Fall 2026 — Q426 Sept IN Fabric Hero"'
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="font-medium text-ink-secondary">Dispatch wave</span>
              <input
                value={dispatchWave}
                onChange={(e) => setDispatchWave(e.target.value)}
                placeholder={parseResult.dispatchWave ?? 'e.g. "10th Sept"'}
                className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
              />
            </label>
          </div>

          <div className="max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-surface-sunken text-ink-secondary">
                <tr>
                  <th className="px-3 py-2">Sl No</th>
                  <th className="px-3 py-2">SFO ID</th>
                  <th className="px-3 py-2">Store</th>
                  <th className="px-3 py-2">City</th>
                  <th className="px-3 py-2">Items</th>
                  <th className="px-3 py-2">Units</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {parseResult.stores.slice(0, 50).map((s) => (
                  <tr key={s.sfoId}>
                    <td className="px-3 py-1.5">{s.slNo}</td>
                    <td className="px-3 py-1.5">{s.sfoId}</td>
                    <td className="px-3 py-1.5">{s.storeName || "—"}</td>
                    <td className="px-3 py-1.5">{s.shippingCity || "—"}</td>
                    <td className="px-3 py-1.5">{s.items.length}</td>
                    <td className="px-3 py-1.5">{s.totalUnits}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {parseResult.stores.length > 50 && (
              <div className="border-t border-line px-3 py-2 text-center text-xs text-ink-muted">
                +{parseResult.stores.length - 50} more not shown in preview
              </div>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <Button onClick={handleConfirm} disabled={missing.length > 0 || !seasonName.trim() || submitting} loading={submitting}>
              Import {parseResult.stores.length} stores
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
