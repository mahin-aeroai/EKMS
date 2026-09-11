"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import ExcelJS from "exceljs";
import { ArrowLeft, FileSpreadsheet, Upload, AlertTriangle, CheckCircle2, Download } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import { cellPrimitive } from "@/lib/distribution/excelCellValue";
import { mmToInches, round2 } from "@/lib/lfg-units";
import {
  LFG_SITE_FIELDS,
  autoMapHeaders,
  missingRequiredFields,
  parseLfgSiteRows,
  parseCsv,
  type ColumnMap,
  type LfgSiteFieldKey,
  type ParseResult,
} from "@/lib/lfg/parseSiteImport";

// 11 Sept 2026: task feedback -- "i want to add some site in lfg connect
// wat is the best way can i give excel or csv file/" -- a permanent Bulk
// Import screen (AskUserQuestion: "Permanent import feature (Recommended)"),
// not a one-off manual SQL favor. Mirrors DistributionImportClient.tsx's
// established shape (upload -> auto-map columns -> preview -> confirm), with
// the LFG-specific twist that rows group by SFO ID into stores (see
// parseSiteImport.ts's header comment) and each group resolves against the
// existing lfg_stores/lfg_partners/lfg_programs lists rather than always
// creating something new.

interface RawSheet {
  name: string;
  headerRow: (string | number | null)[];
  dataRows: (string | number | null)[][];
}

interface ExistingStore {
  id: string;
  store_name: string;
  sfo_id: string | null;
  format: string | null;
  city: string | null;
  region: string | null;
  store_address: string | null;
  partner_id: string | null;
  asm_name: string | null;
  asm_mobile: string | null;
  asm_email: string | null;
  escalation_email: string | null;
}

interface NameOption {
  id: string;
  name: string;
}

const CHUNK_SIZE = 300;
async function chunkedInsert(table: string, rows: Record<string, unknown>[]): Promise<{ error: string | null }> {
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    const chunk = rows.slice(i, i + CHUNK_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) return { error: error.message };
  }
  return { error: null };
}

function findByName(options: NameOption[], name: string | null): string | null {
  if (!name) return null;
  const match = options.find((o) => o.name.trim().toLowerCase() === name.trim().toLowerCase());
  return match?.id ?? null;
}

const TEMPLATE_HEADERS = LFG_SITE_FIELDS.map((f) => f.label);

function downloadTemplate() {
  const csv = TEMPLATE_HEADERS.join(",") + "\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "lfg-site-import-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function LfgSiteImportClient() {
  const router = useRouter();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [sheets, setSheets] = useState<RawSheet[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string | null>(null);
  const [columnMap, setColumnMap] = useState<ColumnMap>({});
  // Defaults to MM, not Inch -- task feedback: "why inches it is always mm
  // only". Site lists come from partners/Apple as mm measurements far more
  // often than inches; MM as the starting toggle state means a typical
  // sheet needs no unit fiddling before import, only a deliberate switch to
  // Inch when that's genuinely what a file contains.
  const [sizeUnit, setSizeUnit] = useState<"in" | "mm">("mm");
  const [submitting, setSubmitting] = useState(false);
  // 11 Sept 2026: task feedback, after seeing "32 existing (adding
  // displays)" in a real preview -- "i dont want existing sites i only
  // need the current imported ones." Defaults to false (the existing
  // "add a display at a store already on file" behavior, matching the
  // manual New Site form's own two-mode logic) so nothing changes for
  // anyone not asking for this -- checking it excludes every group that
  // matched an existing store from this run, leaving only genuinely new
  // stores to import.
  const [skipExisting, setSkipExisting] = useState(false);

  const [existingStores, setExistingStores] = useState<ExistingStore[] | null>(null);
  const [partners, setPartners] = useState<NameOption[] | null>(null);
  const [programs, setPrograms] = useState<NameOption[] | null>(null);

  const sheet = useMemo(() => sheets.find((s) => s.name === selectedSheet) ?? null, [sheets, selectedSheet]);

  const parseResult: ParseResult | null = useMemo(() => {
    if (!sheet) return null;
    return parseLfgSiteRows(sheet.dataRows, columnMap);
  }, [sheet, columnMap]);

  const missing = useMemo(() => missingRequiredFields(columnMap), [columnMap]);

  const refLoaded = existingStores !== null && partners !== null && programs !== null;

  async function ensureReferenceData() {
    if (refLoaded) return;
    const [storesRes, partnersRes, programsRes] = await Promise.all([
      fetchAllRows<ExistingStore>((from, to) =>
        supabase
          .from("lfg_stores")
          .select("id, store_name, sfo_id, format, city, region, store_address, partner_id, asm_name, asm_mobile, asm_email, escalation_email")
          .range(from, to)
      ),
      supabase
        .from("lfg_partners")
        .select("id, name")
        .eq("active", true)
        .order("name")
        .then(({ data }) => (data as NameOption[]) ?? []),
      supabase
        .from("lfg_programs")
        .select("id, name")
        .eq("active", true)
        .order("name")
        .then(({ data }) => (data as NameOption[]) ?? []),
    ]);
    setExistingStores(storesRes);
    setPartners(partnersRes);
    setPrograms(programsRes);
  }

  async function handleFile(file: File) {
    setLoadingFile(true);
    setSheets([]);
    setSelectedSheet(null);
    setColumnMap({});
    try {
      void ensureReferenceData();

      const isCsv = /\.csv$/i.test(file.name);
      let parsedSheets: RawSheet[];

      if (isCsv) {
        const text = await file.text();
        const rows = parseCsv(text);
        if (rows.length === 0) {
          toast("danger", "That CSV file has no rows.");
          setLoadingFile(false);
          return;
        }
        parsedSheets = [{ name: "CSV", headerRow: rows[0], dataRows: rows.slice(1) }];
      } else {
        const buffer = await file.arrayBuffer();
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(buffer);
        const found: RawSheet[] = [];
        workbook.eachSheet((worksheet) => {
          const rows: (string | number | null)[][] = [];
          worksheet.eachRow((row) => {
            const values = row.values as ExcelJS.CellValue[]; // 1-indexed, [0] unused
            rows.push(values.slice(1).map(cellPrimitive));
          });
          if (rows.length === 0) return;
          found.push({ name: worksheet.name, headerRow: rows[0], dataRows: rows.slice(1) });
        });
        if (found.length === 0) {
          toast("danger", "No sheets with data found in that file.");
          setLoadingFile(false);
          return;
        }
        parsedSheets = found;
      }

      setSheets(parsedSheets);
      setFileName(file.name);

      const auto = parsedSheets.find((s) => /site/i.test(s.name)) ?? parsedSheets[0];
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

  function setFieldColumn(key: LfgSiteFieldKey, colIndex: number | null) {
    setColumnMap((m) => {
      const next = { ...m };
      if (colIndex === null) delete next[key];
      else next[key] = colIndex;
      return next;
    });
  }

  // Resolved once reference data + parse result are both ready -- which
  // groups match an existing store (by SFO ID) vs need a brand-new one, and
  // which groups can't be imported at all (no outlet name to create a new
  // store with).
  const resolvedGroups = useMemo(() => {
    if (!parseResult || !existingStores) return null;
    return parseResult.groups.map((g) => {
      const existing = g.sfoId ? existingStores.find((s) => (s.sfo_id ?? "").toLowerCase() === g.sfoId!.toLowerCase()) : null;
      const blockingError = !existing && !g.outletName?.trim() ? "New store, but no Outlet Name to create it with." : null;
      return { group: g, existing: existing ?? null, blockingError };
    });
  }, [parseResult, existingStores]);

  const existingMatchCount = resolvedGroups?.filter((r) => !r.blockingError && r.existing).length ?? 0;
  const importableGroups = resolvedGroups?.filter((r) => !r.blockingError && !(skipExisting && r.existing)) ?? [];
  const blockedGroups = resolvedGroups?.filter((r) => r.blockingError) ?? [];
  const totalSites = importableGroups.reduce((n, r) => n + r.group.sites.length, 0);

  async function handleConfirm() {
    if (!resolvedGroups || !partners || !programs || importableGroups.length === 0) return;
    setSubmitting(true);

    const toInches = (v: number | null): number | null => {
      if (v === null) return null;
      return sizeUnit === "mm" ? mmToInches(v) : round2(v);
    };

    const newStoreIds: string[] = [];

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      // Store-level resolution first, one group at a time -- an existing
      // match needs no write; a new store is one insert. Sequential (not
      // batched) so each group's new store id is known immediately for the
      // site rows below, and so a mid-import failure names exactly which
      // outlet it happened on.
      const storeIdByGroupKey = new Map<string, string>();
      const partnerIdByGroupKey = new Map<string, string | null>();

      for (const { group, existing } of importableGroups) {
        if (existing) {
          storeIdByGroupKey.set(group.groupKey, existing.id);
          partnerIdByGroupKey.set(group.groupKey, existing.partner_id);
          continue;
        }

        const partnerId = findByName(partners, group.partnerName);
        const { data: newStore, error: storeError } = await supabase
          .from("lfg_stores")
          .insert({
            store_name: group.outletName!.trim(),
            format: group.format,
            sfo_id: group.sfoId,
            city: group.city,
            region: group.region,
            store_address: group.storeAddress,
            partner_id: partnerId,
            asm_name: group.asmName,
            asm_mobile: group.asmMobile,
            asm_email: group.asmEmail,
            escalation_email: group.escalationEmail,
            created_by: user?.id ?? null,
          })
          .select("id")
          .single();

        if (storeError || !newStore) {
          if (newStoreIds.length > 0) {
            await supabase.from("lfg_stores").delete().in("id", newStoreIds);
          }
          toast(
            "danger",
            `Stopped at "${group.outletName}": ${
              storeError?.code === "23505"
                ? "a store with this SFO ID already exists."
                : storeError?.message ?? "couldn't create the store."
            } No sites were imported.`
          );
          setSubmitting(false);
          return;
        }

        storeIdByGroupKey.set(group.groupKey, newStore.id);
        partnerIdByGroupKey.set(group.groupKey, partnerId);
        newStoreIds.push(newStore.id);
      }

      const siteRows = importableGroups.flatMap(({ group, existing }) => {
        const storeId = storeIdByGroupKey.get(group.groupKey)!;
        const partnerId = partnerIdByGroupKey.get(group.groupKey) ?? null;
        const storeFields = existing
          ? {
              outlet_name: existing.store_name,
              format: existing.format,
              sfo_id: existing.sfo_id,
              city: existing.city,
              region: existing.region,
              store_address: existing.store_address,
            }
          : {
              outlet_name: group.outletName!.trim(),
              format: group.format,
              sfo_id: group.sfoId,
              city: group.city,
              region: group.region,
              store_address: group.storeAddress,
            };

        return group.sites.map((site) => ({
          ...storeFields,
          store_id: storeId,
          partner_id: partnerId,
          program_id: findByName(programs, site.programName),
          material: site.material,
          mat_code: site.matCode,
          number_of_sites: site.numberOfSites || 1,
          width: toInches(site.width),
          height: toInches(site.height),
          // 11 Sept 2026: task feedback -- "why inches it is always mm only
          // including bleed" -- Bleed now converts through the same
          // Inch/MM toggle as Width/Height, unlike the manual New Site
          // form's own Bleed field (that one takes whatever number is
          // typed literally, with no unit conversion at all -- a
          // pre-existing quirk of that form, out of scope here). A sheet
          // of mm data can now be imported as-is with the toggle left on
          // MM and every measurement -- width, height, and bleed alike --
          // lands in the database's native inches correctly.
          bleed: toInches(site.bleed),
          sqft: site.sqft !== null ? round2(site.sqft) : null,
          remarks: site.remarks,
          created_by: user?.id ?? null,
        }));
      });

      const { error: sitesError } = await chunkedInsert("lfg_sites", siteRows);
      if (sitesError) {
        // Best-effort cleanup only when nothing at all made it in -- once
        // some site rows are saved, deleting the stores under them would
        // destroy real data instead of just an aborted run.
        toast(
          "danger",
          `${newStoreIds.length > 0 ? `${newStoreIds.length} new store(s) were created. ` : ""}Sites failed to import: ${sitesError}. Check the Stores page before re-running.`
        );
        setSubmitting(false);
        return;
      }

      toast("success", `Imported ${siteRows.length} site(s) across ${importableGroups.length} store(s).`);
      router.push("/workspaces/lfg");
    } catch (err) {
      toast("danger", `Import failed: ${err instanceof Error ? err.message : String(err)}`);
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6 pb-16">
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "LFG Connect", href: "/workspaces/lfg" }, { label: "Bulk Import" }]} />

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-ink">Bulk Import Sites</h1>
          <p className="text-sm text-ink-secondary">
            Upload an Excel (.xlsx) or CSV file of sites. Rows sharing an SFO ID become multiple displays at one store;
            an SFO ID that already exists on file gets a new display added to that store instead of a duplicate.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/workspaces/lfg")}>
          <ArrowLeft size={14} /> Back to Site Master
        </Button>
      </div>

      <div className="flex items-center justify-between rounded-lg border border-line bg-surface-sunken p-3 text-sm text-ink-secondary">
        <span>Not sure what columns to use?</span>
        <Button variant="secondary" size="sm" onClick={downloadTemplate}>
          <Download size={14} className="mr-1.5" /> Download template CSV
        </Button>
      </div>

      <div className="rounded-lg border border-line bg-surface p-4">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.csv"
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
            {loadingFile ? "Reading file…" : fileName ? `${fileName} — click to replace` : "Click to choose an .xlsx or .csv file"}
          </span>
        </button>
      </div>

      {sheets.length > 1 && (
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
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-ink">Column mapping</span>
            <div className="flex overflow-hidden rounded-md border border-line-strong text-xs">
              <button
                onClick={() => setSizeUnit("in")}
                className={`px-2.5 py-1 ${sizeUnit === "in" ? "bg-primary text-on-brand" : "bg-surface text-ink-secondary"}`}
              >
                Width/Height/Bleed in Inch
              </button>
              <button
                onClick={() => setSizeUnit("mm")}
                className={`px-2.5 py-1 ${sizeUnit === "mm" ? "bg-primary text-on-brand" : "bg-surface text-ink-secondary"}`}
              >
                Width/Height/Bleed in MM
              </button>
            </div>
          </div>
          <p className="mb-3 text-xs text-ink-secondary">
            Auto-matched from the header row. Fix anything that didn&apos;t match — a blank field is skipped on import.
          </p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
            {LFG_SITE_FIELDS.map((field) => (
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

          {!refLoaded ? (
            <p className="text-sm text-ink-muted">Loading existing stores, partners, and programs to match against…</p>
          ) : (
            <>
              {missing.length > 0 ? (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  <span>Map these required fields before importing: {missing.map((f) => f.label).join(", ")}.</span>
                </div>
              ) : blockedGroups.length === 0 ? (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-xs text-ink">
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                  <span>Ready to import.</span>
                </div>
              ) : (
                <div className="mb-3 flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-ink">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
                  <span>
                    {blockedGroups.length} row(s) can&apos;t be imported (missing Outlet Name for a new store) and will be
                    skipped. Everything else will still import.
                  </span>
                </div>
              )}

              {existingMatchCount > 0 && (
                <label className="mb-3 flex items-center gap-2 text-xs text-ink-secondary">
                  <input type="checkbox" checked={skipExisting} onChange={(e) => setSkipExisting(e.target.checked)} />
                  Only import new stores — skip {existingMatchCount} store(s) already on file (an SFO ID match adds a
                  new display at that store by default; check this to leave those alone and import only what&apos;s new)
                </label>
              )}

              <div className="mb-4 flex flex-wrap gap-4 text-sm">
                <Badge>{importableGroups.length} stores</Badge>
                {!skipExisting && (
                  <Badge status={"success"}>{importableGroups.filter((r) => r.existing).length} existing (adding displays)</Badge>
                )}
                <Badge>{importableGroups.filter((r) => !r.existing).length} new stores</Badge>
                <Badge>{totalSites} sites total</Badge>
                {skipExisting && existingMatchCount > 0 && <Badge status="neutral">{existingMatchCount} existing skipped</Badge>}
                {parseResult.skippedRows > 0 && <Badge status="warning">{parseResult.skippedRows} blank rows skipped</Badge>}
              </div>

              {parseResult.warnings.length > 0 && (
                <ul className="mb-4 list-inside list-disc text-xs text-warning">
                  {parseResult.warnings.map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              )}

              <div className="max-h-72 overflow-auto rounded-md border border-line">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-surface-sunken text-ink-secondary">
                    <tr>
                      <th className="px-3 py-2">Outlet</th>
                      <th className="px-3 py-2">SFO ID</th>
                      <th className="px-3 py-2">City</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Sites</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {resolvedGroups!.slice(0, 100).map((r) => {
                      const skipped = !r.blockingError && skipExisting && r.existing;
                      return (
                        <tr key={r.group.groupKey} className={r.blockingError ? "bg-danger-tint/40" : skipped ? "opacity-50" : undefined}>
                          <td className="px-3 py-2">{r.group.outletName ?? <span className="text-ink-muted">—</span>}</td>
                          <td className="px-3 py-2">{r.group.sfoId ?? <span className="text-ink-muted">—</span>}</td>
                          <td className="px-3 py-2">{r.group.city ?? <span className="text-ink-muted">—</span>}</td>
                          <td className="px-3 py-2">
                            {r.blockingError ? (
                              <span className="text-danger">{r.blockingError}</span>
                            ) : skipped ? (
                              <span className="text-ink-muted">Skipped — already on file</span>
                            ) : r.existing ? (
                              <span className="text-success">Existing — adding display</span>
                            ) : (
                              <span className="text-info">New store</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{skipped ? 0 : r.group.sites.length}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {resolvedGroups!.length > 100 && (
                  <p className="px-3 py-2 text-xs text-ink-muted">…and {resolvedGroups!.length - 100} more.</p>
                )}
              </div>

              <div className="mt-4 flex justify-end">
                <Button onClick={handleConfirm} loading={submitting} disabled={missing.length > 0 || importableGroups.length === 0}>
                  Import {totalSites} site(s)
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
