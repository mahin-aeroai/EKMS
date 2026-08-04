"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type {
  MaterialSupplierRow,
  MaterialSupplierItemRow,
  MaterialConsumptionRowRow,
  MaterialOrderLine,
  MaterialOrderStatus,
  MaterialPackOption,
  MaterialUnitType,
} from "@mmdi/shared/rows";
import { generateMaterialOrderPdf, downloadBlob } from "@/lib/materialOrdering/pdf";

// The core calculator. Two-step flow, both visible on one screen at once
// (no wizard/modal -- same "app on one screen" philosophy as the rest of
// this codebase's Tools workspaces): pick a supplier, pick which
// production programs to include, hit "Build Order List" to compute
// roll/sheet/pack counts, edit anything that needs a human override, then
// save as Draft/Sent and/or download the PDF.
//
// Calculation dispatches on each material_supplier_items row's
// consumption_basis -- see supabase-material-ordering-schema.sql's header
// for the full reasoning behind every basis (there are 8: the original
// 'total_required_material'/'manual' pair, plus 6 more the user corrected
// per-supplier after reviewing real computed order lists: perimeter_x2,
// qty_per_pack_by_sheet_size, wastage_running_length, qty_direct_wastage,
// sqft_direct_to_rolls, fixed_pieces_per_roll). unitType on WorkingLine
// below is a separate, simpler axis -- just the PACK SHAPE (roll vs sheet
// vs no formula), used only to pick which pack_option fields make sense
// and how computePacksOrdered() converts a chosen pack into a count.
type SizeUnit = "sqm" | "linear_m" | "count";

// One consumption_rows row that fed into a computed line's total, plus the
// exact number it contributed -- so the total isn't a black box the user
// has to take on faith. `contribution` is in the same unit as the parent
// line's consumptionUnit (linear metres for roll, sqm for sheet); null for
// 'simple' lines, which never sum anything.
//
// `packsForThisSku` is a second, independent figure: when the row has
// qty_per_pack on file (how many pieces of THIS SKU nest on one pack, per
// the user's own layout knowledge -- see supabase-material-ordering-
// qty-per-pack-migration.sql), this is ceil(order_qty / qty_per_pack) --
// materially more accurate than the geometric SQM/pack-area estimate, but
// only available where the sheet has that nesting data filled in. Shown in
// the breakdown for every unit type as a cross-check; also summed to
// prefill 'simple' lines (which otherwise have no computed default at all).
interface SourceRowDetail {
  row: MaterialConsumptionRowRow;
  contribution: number | null;
  packsForThisSku: number | null;
}

function computePacksForSku(row: MaterialConsumptionRowRow): number | null {
  if (!row.qty_per_pack || row.qty_per_pack <= 0 || row.order_qty == null) return null;
  return Math.ceil(row.order_qty / row.qty_per_pack);
}

interface WorkingLine {
  key: string;
  supplierItemId: string;
  unitType: MaterialUnitType;
  materialName: string;
  totalConsumption: number;
  consumptionUnit: SizeUnit;
  availablePackOptions: MaterialPackOption[];
  packOptionIndex: number;
  packsOrdered: number;
  notes?: string;
  sourceRows: SourceRowDetail[];
}

function computePacksOrdered(unitType: MaterialUnitType, totalConsumption: number, pack: MaterialPackOption | undefined): number {
  if (!pack) return 0;
  if (unitType === "roll") {
    if (!pack.length_m) return 0;
    return Math.ceil(totalConsumption / pack.length_m);
  }
  if (unitType === "sheet") {
    if (!pack.width_mm || !pack.height_mm) return 0;
    const areaSqm = (pack.width_mm * pack.height_mm) / 1e6;
    if (areaSqm <= 0) return 0;
    return Math.ceil(totalConsumption / areaSqm);
  }
  return 0;
}

const SQFT_TO_SQM = 0.09290304;
// Flat wastage multiplier for the two bases the user specified it for
// (Sappi Magno Satin's running length, Endutex's direct metres) -- not a
// per-material configurable value since only these two bases use it.
const WASTAGE_MULTIPLIER = 1.4;

// Perimeter of one piece (2*(width+height)) x qty, in metres -- for
// trim/edge materials consumed around a piece's perimeter rather than its
// face (Silicon Gasket, Rubber Magnet). Not the same math as the fabric
// those pieces are cut from, which is why these can't reuse
// total_required_material off the same row.
function perimeterContribution(row: MaterialConsumptionRowRow): number | null {
  if (row.width_mm == null || row.height_mm == null || row.order_qty == null) return null;
  return ((2 * (row.width_mm + row.height_mm)) / 1000) * row.order_qty;
}

// Running length for a SKU cut from a wide roll, derived (not given) from
// its own width/height vs the roll's material_width_mm: whichever side
// fits within the roll's width is the cross-web side, the other is the
// running length consumed. Returns null where it can't be determined (no
// material_width_mm on file for that row, or neither side fits within it).
function runningLengthContribution(row: MaterialConsumptionRowRow): number | null {
  if (row.width_mm == null || row.height_mm == null || row.order_qty == null || !row.material_width_mm) return null;
  const w = row.width_mm;
  const h = row.height_mm;
  const mw = row.material_width_mm;
  let runDim: number | null = null;
  if (w <= mw && h <= mw) runDim = Math.min(w, h); // both fit -- orient for the shorter run
  else if (w <= mw) runDim = h;
  else if (h <= mw) runDim = w;
  if (runDim == null) return null;
  return (runDim / 1000) * row.order_qty;
}

// Shared by the three bases that reduce to "sum a linear-metres total
// across every matching row into ONE line, then convert to rolls via the
// material's (single) pack option" -- perimeter_x2, qty_direct_wastage,
// sqft_direct_to_rolls.
function buildSingleRollLine(item: MaterialSupplierItemRow, sourceRows: SourceRowDetail[], totalM: number): WorkingLine {
  const packs = item.pack_options;
  if (packs.length === 0) {
    return {
      key: crypto.randomUUID(),
      supplierItemId: item.id,
      unitType: "roll",
      materialName: item.material_name,
      totalConsumption: totalM,
      consumptionUnit: "linear_m",
      availablePackOptions: [],
      packOptionIndex: -1,
      packsOrdered: 0,
      notes: "No pack sizes configured for this material — add one in Suppliers & Materials",
      sourceRows,
    };
  }
  return {
    key: crypto.randomUUID(),
    supplierItemId: item.id,
    unitType: "roll",
    materialName: item.material_name,
    totalConsumption: totalM,
    consumptionUnit: "linear_m",
    availablePackOptions: packs,
    packOptionIndex: 0,
    packsOrdered: computePacksOrdered("roll", totalM, packs[0]),
    sourceRows,
  };
}

function toOrderLine(line: WorkingLine): MaterialOrderLine {
  const pack = line.availablePackOptions[line.packOptionIndex] ?? { label: "—" };
  return {
    material_name: line.materialName,
    total_consumption: line.totalConsumption,
    consumption_unit: line.consumptionUnit,
    pack_option: pack,
    packs_ordered: line.packsOrdered,
    notes: line.notes,
  };
}

function consumptionLabel(line: WorkingLine): string {
  if (line.consumptionUnit === "linear_m") return `${line.totalConsumption.toFixed(1)} m`;
  if (line.consumptionUnit === "sqm") return `${line.totalConsumption.toFixed(2)} sqm`;
  return "—";
}

function contributionLabel(unit: SizeUnit, contribution: number | null): string {
  if (contribution == null) return "—";
  if (unit === "linear_m") return `${contribution.toFixed(1)} m`;
  if (unit === "sqm") return `${contribution.toFixed(2)} sqm`;
  return "—";
}

// A row from material_consumption_rows may not have a Product Name/SKU
// filled in (the bare reference rows -- see supabase-material-ordering-
// consumption-import.sql's header) -- fall back through whatever's
// actually present so the breakdown never shows a blank cell.
function skuLabel(row: MaterialConsumptionRowRow): string {
  return row.sku_description || row.product_name || row.sku_id || row.sku || "—";
}

export function OrderBuilderTab() {
  const { toast } = useToast();

  const [suppliers, setSuppliers] = useState<MaterialSupplierRow[] | null>(null);
  const [selectedSupplierId, setSelectedSupplierId] = useState("");

  // Lightweight -- just the 4 columns needed to work out, per supplier,
  // which programs actually touch one of that supplier's materials. Loaded
  // once (the table is small, ~80 rows); `programs` (the full checkbox
  // list) and `relevantProgramSet` (which of those a selected supplier
  // actually supplies into) are both derived from this.
  const [consumptionProgramMaterials, setConsumptionProgramMaterials] = useState<
    Pick<MaterialConsumptionRowRow, "program" | "material_1" | "material_2" | "material_3">[] | null
  >(null);
  // Names of the materials the selected supplier provides -- null while no
  // supplier is chosen (or its items are still loading), in which case
  // every program stays selectable rather than flashing "all disabled".
  const [supplierMaterialNames, setSupplierMaterialNames] = useState<string[] | null>(null);

  const [selectedPrograms, setSelectedPrograms] = useState<string[]>([]);

  const [lines, setLines] = useState<WorkingLine[]>([]);
  const [computing, setComputing] = useState(false);
  const [hasComputed, setHasComputed] = useState(false);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);

  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSavedRef, setLastSavedRef] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchAllRows<MaterialSupplierRow>((from, to) => supabase.from("material_suppliers").select("*").order("name").range(from, to)).then(
      setSuppliers
    );
    fetchAllRows<Pick<MaterialConsumptionRowRow, "program" | "material_1" | "material_2" | "material_3">>((from, to) =>
      supabase.from("material_consumption_rows").select("program, material_1, material_2, material_3").range(from, to)
    ).then(setConsumptionProgramMaterials);
  }, []);

  const selectedSupplier = suppliers?.find((s) => s.id === selectedSupplierId) ?? null;

  const programs = useMemo(() => {
    if (!consumptionProgramMaterials) return null;
    return [...new Set(consumptionProgramMaterials.map((r) => r.program).filter((p): p is string => !!p))].sort();
  }, [consumptionProgramMaterials]);

  // Which programs actually use one of the selected supplier's materials --
  // null (meaning "don't restrict anything yet") until a supplier is picked
  // and its items have loaded.
  const relevantProgramSet = useMemo(() => {
    if (!supplierMaterialNames || !consumptionProgramMaterials) return null;
    const names = new Set(supplierMaterialNames);
    const relevant = new Set<string>();
    for (const row of consumptionProgramMaterials) {
      if (!row.program) continue;
      if (names.has(row.material_1 ?? "") || names.has(row.material_2 ?? "") || names.has(row.material_3 ?? "")) {
        relevant.add(row.program);
      }
    }
    return relevant;
  }, [supplierMaterialNames, consumptionProgramMaterials]);

  function onSupplierChange(id: string) {
    setSelectedSupplierId(id);
    setLines([]);
    setHasComputed(false);
    setLastSavedRef(null);
    setExpandedKey(null);
    setSelectedPrograms([]);
    setSupplierMaterialNames(null);
    if (!id) return;
    supabase
      .from("material_supplier_items")
      .select("material_name")
      .eq("supplier_id", id)
      .then(({ data, error }) => {
        if (error || !data) return;
        setSupplierMaterialNames(data.map((d) => d.material_name as string));
      });
  }

  function toggleProgram(program: string) {
    setSelectedPrograms((prev) => (prev.includes(program) ? prev.filter((p) => p !== program) : [...prev, program]));
  }

  async function buildOrder() {
    if (!selectedSupplier) {
      toast("danger", "Select a supplier first");
      return;
    }
    if (selectedPrograms.length === 0) {
      toast("danger", "Select at least one program");
      return;
    }
    setComputing(true);
    setLastSavedRef(null);
    setExpandedKey(null);
    try {
      const [itemsRes, rows] = await Promise.all([
        supabase.from("material_supplier_items").select("*").eq("supplier_id", selectedSupplier.id),
        fetchAllRows<MaterialConsumptionRowRow>((from, to) =>
          supabase.from("material_consumption_rows").select("*").in("program", selectedPrograms).range(from, to)
        ),
      ]);
      if (itemsRes.error) throw itemsRes.error;
      const items = (itemsRes.data as MaterialSupplierItemRow[]) ?? [];

      const newLines: WorkingLine[] = [];

      for (const item of items) {
        const matches = rows.filter(
          (r) => r.material_1 === item.material_name || r.material_2 === item.material_name || r.material_3 === item.material_name
        );

        if (item.consumption_basis === "manual") {
          // Always shown -- these materials have no consumption data to sum
          // (that's the point of 'manual'), so there's normally nothing to
          // prefill and the user just types in a count. BUT if any matching
          // rows have qty_per_pack on file (nesting data -- see
          // computePacksForSku), sum those into a real default instead of
          // leaving it at 0; still fully editable either way.
          const sourceRows: SourceRowDetail[] = matches.map((row) => ({
            row,
            contribution: null,
            packsForThisSku: computePacksForSku(row),
          }));
          const suggestedPacks = sourceRows.reduce((sum, s) => sum + (s.packsForThisSku ?? 0), 0);
          const someMissingNesting = sourceRows.some((s) => s.packsForThisSku == null) && suggestedPacks > 0;
          newLines.push({
            key: crypto.randomUUID(),
            supplierItemId: item.id,
            unitType: item.unit_type,
            materialName: item.material_name,
            totalConsumption: 0,
            consumptionUnit: "count",
            availablePackOptions: item.pack_options,
            packOptionIndex: 0,
            packsOrdered: suggestedPacks,
            notes:
              matches.length === 0
                ? "No matching consumption rows in the selected programs — enter quantity manually"
                : suggestedPacks > 0
                  ? someMissingNesting
                    ? "Suggested from nesting data below (some rows have none on file) — review before saving"
                    : "Suggested from nesting data below — review before saving"
                  : undefined,
            sourceRows,
          });
          continue;
        }

        if (matches.length === 0) continue; // skip every other basis when nothing in the selected programs touches this material

        if (item.consumption_basis === "total_required_material") {
          // Group by material_width_mm -- the sheet's own precomputed,
          // wastage-inclusive linear metres (Print Length x Qty x 1.4) is
          // correct as-is for these materials (Recycled Rhine, MT 3180,
          // Transjet Industrial) -- just sum per matching roll width and
          // pick a pack for each.
          const byWidth = new Map<number, number>();
          const rowsByWidth = new Map<number, MaterialConsumptionRowRow[]>();
          for (const r of matches) {
            if (r.total_required_material == null) continue;
            const width = r.material_width_mm ?? 0;
            byWidth.set(width, (byWidth.get(width) ?? 0) + r.total_required_material);
            const list = rowsByWidth.get(width) ?? [];
            list.push(r);
            rowsByWidth.set(width, list);
          }
          const packs = item.pack_options;
          const sortedByWidth = [...packs].sort((a, b) => (a.width_mm ?? 0) - (b.width_mm ?? 0));

          for (const [width, summedLength] of byWidth) {
            if (summedLength <= 0) continue;
            const widthRows = rowsByWidth.get(width) ?? [];
            const sourceRows: SourceRowDetail[] = widthRows.map((row) => ({
              row,
              contribution: row.total_required_material,
              packsForThisSku: computePacksForSku(row),
            }));
            if (packs.length === 0) {
              newLines.push({
                key: crypto.randomUUID(),
                supplierItemId: item.id,
                unitType: "roll",
                materialName: `${item.material_name} (width ${width}mm)`,
                totalConsumption: summedLength,
                consumptionUnit: "linear_m",
                availablePackOptions: [],
                packOptionIndex: -1,
                packsOrdered: 0,
                notes: "No pack sizes configured for this material — add one in Suppliers & Materials",
                sourceRows,
              });
              continue;
            }
            let chosen = sortedByWidth.find((p) => (p.width_mm ?? 0) >= width);
            let flagNote: string | undefined;
            if (!chosen) {
              chosen = sortedByWidth[sortedByWidth.length - 1];
              flagNote = `No pack ≥ ${width}mm wide on file — using widest available (${chosen.label})`;
            }
            const packOptionIndex = Math.max(0, packs.indexOf(chosen));
            newLines.push({
              key: crypto.randomUUID(),
              supplierItemId: item.id,
              unitType: "roll",
              materialName: `${item.material_name} (width ${width}mm)`,
              totalConsumption: summedLength,
              consumptionUnit: "linear_m",
              availablePackOptions: packs,
              packOptionIndex,
              packsOrdered: computePacksOrdered("roll", summedLength, packs[packOptionIndex]),
              notes: flagNote,
              sourceRows,
            });
          }
        } else if (item.consumption_basis === "qty_per_pack_by_sheet_size") {
          // Group by material_width_mm (the sheet size each SKU actually
          // used) so different sizes are never blended into one average --
          // one order line per sheet size. Within a group, prefer the
          // per-row nesting count (qty_per_pack) wherever it's on file --
          // this is what correctly counts multi-up sheets (several small
          // pieces per sheet, e.g. GPS18/19) instead of undercounting them
          // via a pure area estimate -- and only falls back to sq.m/pack-
          // area for rows that don't have qty_per_pack yet.
          const byWidth = new Map<number, MaterialConsumptionRowRow[]>();
          for (const r of matches) {
            const width = r.material_width_mm ?? 0;
            if (width <= 0) continue; // no sheet size on file for this row -- can't group it
            const list = byWidth.get(width) ?? [];
            list.push(r);
            byWidth.set(width, list);
          }
          const packs = item.pack_options;
          const sortedByWidth = [...packs].sort((a, b) => (a.width_mm ?? 0) - (b.width_mm ?? 0));

          for (const [width, widthRows] of byWidth) {
            let totalSqm = 0;
            let packsFromNesting = 0;
            let sqmFromFallbackRows = 0;
            const sourceRows: SourceRowDetail[] = [];
            for (const r of widthRows) {
              const contribution = (r.sqm ?? 0) * (r.order_qty ?? 0);
              totalSqm += contribution;
              const packsForThisSku = computePacksForSku(r);
              if (packsForThisSku != null) packsFromNesting += packsForThisSku;
              else sqmFromFallbackRows += contribution;
              sourceRows.push({ row: r, contribution, packsForThisSku });
            }
            if (totalSqm <= 0) continue;
            let chosen = sortedByWidth.find((p) => (p.width_mm ?? 0) >= width);
            let flagNote: string | undefined;
            if (!chosen && packs.length > 0) {
              chosen = sortedByWidth[sortedByWidth.length - 1];
              flagNote = `No sheet ≥ ${width}mm wide on file — using widest available (${chosen.label})`;
            }
            if (!chosen) {
              newLines.push({
                key: crypto.randomUUID(),
                supplierItemId: item.id,
                unitType: "sheet",
                materialName: `${item.material_name} (sheet ${width}mm)`,
                totalConsumption: totalSqm,
                consumptionUnit: "sqm",
                availablePackOptions: [],
                packOptionIndex: -1,
                packsOrdered: packsFromNesting,
                notes: "No sheet sizes configured for this material — add one in Suppliers & Materials",
                sourceRows,
              });
              continue;
            }
            const packOptionIndex = Math.max(0, packs.indexOf(chosen));
            const areaFallbackPacks = computePacksOrdered("sheet", sqmFromFallbackRows, chosen);
            newLines.push({
              key: crypto.randomUUID(),
              supplierItemId: item.id,
              unitType: "sheet",
              materialName: `${item.material_name} (sheet ${width}mm)`,
              totalConsumption: totalSqm,
              consumptionUnit: "sqm",
              availablePackOptions: packs,
              packOptionIndex,
              packsOrdered: packsFromNesting + areaFallbackPacks,
              notes: flagNote,
              sourceRows,
            });
          }
        } else if (item.consumption_basis === "perimeter_x2") {
          // Trim/edge material wrapped around each piece's perimeter, not
          // its face -- Silicon Gasket, Rubber Magnet. Sums into one line
          // (these materials don't come in different widths on file).
          let totalM = 0;
          const sourceRows: SourceRowDetail[] = [];
          for (const r of matches) {
            const contribution = perimeterContribution(r);
            if (contribution != null) totalM += contribution;
            sourceRows.push({ row: r, contribution, packsForThisSku: computePacksForSku(r) });
          }
          if (totalM <= 0) continue;
          newLines.push(buildSingleRollLine(item, sourceRows, totalM));
        } else if (item.consumption_basis === "wastage_running_length") {
          // Sappi Magno Satin -- running length derived per-SKU from
          // width/height vs the roll's material_width_mm, +40% wastage.
          // Rows with no material_width_mm on file can't be computed this
          // way (contribution stays null) but may still carry qty_per_pack
          // nesting data, which is summed separately into the packs-ordered
          // default since there's no known reel length to convert metres
          // into a reel count.
          let totalM = 0;
          let packsFromNesting = 0;
          const sourceRows: SourceRowDetail[] = [];
          for (const r of matches) {
            const raw = runningLengthContribution(r);
            const contribution = raw != null ? raw * WASTAGE_MULTIPLIER : null;
            if (contribution != null) totalM += contribution;
            const packsForThisSku = computePacksForSku(r);
            if (packsForThisSku != null) packsFromNesting += packsForThisSku;
            sourceRows.push({ row: r, contribution, packsForThisSku });
          }
          newLines.push({
            key: crypto.randomUUID(),
            supplierItemId: item.id,
            unitType: item.unit_type,
            materialName: item.material_name,
            totalConsumption: totalM,
            consumptionUnit: "linear_m",
            availablePackOptions: item.pack_options,
            packOptionIndex: 0,
            packsOrdered: packsFromNesting,
            notes:
              totalM > 0
                ? "Running metres shown include 40% wastage. No reel length on file to convert metres to reels — packs ordered is suggested from nesting data below where available."
                : undefined,
            sourceRows,
          });
        } else if (item.consumption_basis === "qty_direct_wastage") {
          // Endutex -- these bare reference rows have no width/height, so
          // order_qty ("Per Program Order Qty (Max)") IS the running-metres
          // figure directly, not a piece count. +40% wastage, sum, convert
          // to rolls.
          let totalM = 0;
          const sourceRows: SourceRowDetail[] = [];
          for (const r of matches) {
            const contribution = r.order_qty != null ? r.order_qty * WASTAGE_MULTIPLIER : null;
            if (contribution != null) totalM += contribution;
            sourceRows.push({ row: r, contribution, packsForThisSku: null });
          }
          if (totalM <= 0) continue;
          newLines.push(buildSingleRollLine(item, sourceRows, totalM));
        } else if (item.consumption_basis === "sqft_direct_to_rolls") {
          // Aslan DFP25 Blockout Film -- order_qty is total SQ.FT for the
          // program (again, a bare reference row with no per-piece
          // dimensions), converted to sq.m then to running metres via the
          // roll's own width.
          const pack = item.pack_options[0];
          const widthM = pack?.width_mm ? pack.width_mm / 1000 : 0;
          let totalM = 0;
          const sourceRows: SourceRowDetail[] = [];
          for (const r of matches) {
            const contribution = r.order_qty != null && widthM > 0 ? (r.order_qty * SQFT_TO_SQM) / widthM : null;
            if (contribution != null) totalM += contribution;
            sourceRows.push({ row: r, contribution, packsForThisSku: null });
          }
          if (totalM <= 0) continue;
          newLines.push(buildSingleRollLine(item, sourceRows, totalM));
        } else if (item.consumption_basis === "fixed_pieces_per_roll") {
          // Aslan SL 109 Lamination Film -- a fixed, material-level pieces-
          // per-roll constant (200), not derived per SKU like qty_per_pack.
          const perPack = item.pieces_per_pack ?? 0;
          let totalPacks = 0;
          const sourceRows: SourceRowDetail[] = [];
          for (const r of matches) {
            const packsForThisSku = perPack > 0 && r.order_qty != null ? Math.ceil(r.order_qty / perPack) : null;
            if (packsForThisSku != null) totalPacks += packsForThisSku;
            sourceRows.push({ row: r, contribution: null, packsForThisSku });
          }
          newLines.push({
            key: crypto.randomUUID(),
            supplierItemId: item.id,
            unitType: item.unit_type,
            materialName: item.material_name,
            totalConsumption: 0,
            consumptionUnit: "count",
            availablePackOptions: item.pack_options,
            packOptionIndex: 0,
            packsOrdered: totalPacks,
            notes: perPack <= 0 ? "No pieces-per-pack on file for this material — add one in Suppliers & Materials" : undefined,
            sourceRows,
          });
        }
      }

      setLines(newLines);
      setHasComputed(true);
      if (newLines.length === 0) {
        toast("info", "No matching materials found for the selected programs");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build the order list";
      toast("danger", message);
    } finally {
      setComputing(false);
    }
  }

  function updatePacksOrdered(key: string, value: number) {
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, packsOrdered: Math.max(0, value) } : l)));
  }

  function updatePackOption(key: string, index: number) {
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        const pack = l.availablePackOptions[index];
        return { ...l, packOptionIndex: index, packsOrdered: computePacksOrdered(l.unitType, l.totalConsumption, pack) };
      })
    );
  }

  async function generateRef(): Promise<string> {
    const { data, error } = await supabase.from("material_orders").select("ref").order("created_at", { ascending: false }).limit(1);
    if (error) throw error;
    const last = data?.[0]?.ref as string | undefined;
    const lastNum = last ? parseInt(last.replace(/\D/g, ""), 10) : 0;
    const next = (Number.isFinite(lastNum) ? lastNum : 0) + 1;
    return `MO-${String(next).padStart(4, "0")}`;
  }

  async function saveOrder(status: MaterialOrderStatus) {
    if (!selectedSupplier) {
      toast("danger", "Select a supplier first");
      return;
    }
    if (selectedPrograms.length === 0) {
      toast("danger", "Select at least one program");
      return;
    }
    if (lines.length === 0) {
      toast("danger", "Build the order list first");
      return;
    }
    setSaving(true);
    try {
      const ref = await generateRef();
      const { data: userData } = await supabase.auth.getUser();
      const orderLines = lines.map(toOrderLine);
      const { error } = await supabase
        .from("material_orders")
        .insert({
          ref,
          supplier_id: selectedSupplier.id,
          supplier_snapshot: {
            name: selectedSupplier.name,
            address: selectedSupplier.address,
            contact_person: selectedSupplier.contact_person,
            phone: selectedSupplier.phone,
            email: selectedSupplier.email,
          },
          programs: selectedPrograms,
          status,
          notes: notes || null,
          lines: orderLines,
          created_by: userData.user?.id ?? null,
          sent_at: status === "sent" ? new Date().toISOString() : null,
        })
        .select()
        .single();
      if (error) throw error;
      setLastSavedRef(ref);
      toast("success", `Saved ${ref} as ${status === "sent" ? "Sent" : "Draft"}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't save this order";
      toast("danger", message);
    } finally {
      setSaving(false);
    }
  }

  async function downloadPdf() {
    if (!selectedSupplier || lines.length === 0) return;
    setDownloading(true);
    try {
      const blob = await generateMaterialOrderPdf({
        ref: lastSavedRef ?? "DRAFT",
        createdAt: new Date().toISOString(),
        status: lastSavedRef ? "sent" : "draft",
        supplier: {
          name: selectedSupplier.name,
          address: selectedSupplier.address,
          contact_person: selectedSupplier.contact_person,
          phone: selectedSupplier.phone,
          email: selectedSupplier.email,
        },
        programs: selectedPrograms,
        notes: notes || null,
        lines: lines.map(toOrderLine),
      });
      downloadBlob(blob, `${lastSavedRef ?? "material-order-draft"}.pdf`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Couldn't build this PDF";
      toast("danger", message);
    } finally {
      setDownloading(false);
    }
  }

  const supplierMissingFields = useMemo(() => {
    if (!selectedSupplier) return [];
    const missing: string[] = [];
    if (!selectedSupplier.address) missing.push("address");
    if (!selectedSupplier.contact_person) missing.push("contact person");
    if (!selectedSupplier.phone) missing.push("phone");
    if (!selectedSupplier.email) missing.push("email");
    return missing;
  }, [selectedSupplier]);

  return (
    <div className="flex flex-col gap-6">
      {/* Step 1 -- supplier */}
      <Card interactive={false} className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary sm:w-80">
          Supplier
          <select
            value={selectedSupplierId}
            onChange={(e) => onSupplierChange(e.target.value)}
            className="h-10 rounded-md border border-line-strong bg-surface px-3 text-sm text-ink outline-none"
          >
            <option value="">{suppliers === null ? "Loading…" : "Select a supplier"}</option>
            {(suppliers ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {selectedSupplier && (
          <div className="rounded-md border border-line bg-surface-sunken p-3 text-xs text-ink-secondary">
            <p className="font-medium text-ink">{selectedSupplier.name}</p>
            <p>{selectedSupplier.address || "No address on file"}</p>
            <p>
              {selectedSupplier.contact_person || "No contact person on file"}
              {selectedSupplier.phone ? ` — ${selectedSupplier.phone}` : ""}
            </p>
            <p>{selectedSupplier.email || "No email on file"}</p>
            {supplierMissingFields.length > 0 && (
              <p className="mt-1.5 text-warning">
                Missing {supplierMissingFields.join(", ")} — edit in the Suppliers &amp; Materials tab.
              </p>
            )}
          </div>
        )}
      </Card>

      {/* Step 2 -- programs */}
      {selectedSupplier && (
        <Card interactive={false} className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-ink">Production programs to include</h3>
            <span className="text-xs text-ink-muted">{selectedPrograms.length} selected</span>
          </div>
          {programs === null ? (
            <p className="py-4 text-center text-sm text-ink-muted">Loading programs…</p>
          ) : programs.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">No consumption data on file yet.</p>
          ) : (
            <>
              {relevantProgramSet && relevantProgramSet.size === 0 && (
                <p className="text-xs text-warning">
                  No program on file uses a material from {selectedSupplier.name} yet — check the mapping in Suppliers &amp;
                  Materials.
                </p>
              )}
              <div className="grid max-h-64 grid-cols-2 gap-x-4 gap-y-1 overflow-y-auto rounded-md border border-line p-3 sm:grid-cols-3 lg:grid-cols-4">
                {programs.map((p) => {
                  const isRelevant = !relevantProgramSet || relevantProgramSet.has(p);
                  return (
                    <label
                      key={p}
                      className={`flex items-center gap-1.5 text-sm ${isRelevant ? "text-ink" : "cursor-not-allowed text-ink-muted"}`}
                      title={isRelevant ? undefined : `No consumption row in ${p} uses a material from ${selectedSupplier.name}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedPrograms.includes(p)}
                        disabled={!isRelevant}
                        onChange={() => toggleProgram(p)}
                        className="h-3.5 w-3.5 rounded border-line-strong disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      {p}
                    </label>
                  );
                })}
              </div>
            </>
          )}
          <div>
            <Button variant="primary" size="sm" onClick={buildOrder} loading={computing} disabled={selectedPrograms.length === 0}>
              Build Order List
            </Button>
          </div>
        </Card>
      )}

      {/* Step 3 -- computed order list */}
      {hasComputed && (
        <Card interactive={false} className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-ink">Order list</h3>
          {lines.length === 0 ? (
            <p className="py-4 text-center text-sm text-ink-muted">
              No materials from this supplier were used by the selected programs.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-line bg-surface-sunken text-left text-ink-secondary">
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Material</th>
                    <th className="px-3 py-2">Consumption required</th>
                    <th className="px-3 py-2">Pack size</th>
                    <th className="px-3 py-2">Packs ordered</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => {
                    const isExpanded = expandedKey === l.key;
                    return (
                      <Fragment key={l.key}>
                        <tr className="border-b border-line/60 last:border-0">
                          <td className="px-3 py-1.5">
                            {l.sourceRows.length > 0 && (
                              <button
                                type="button"
                                aria-label={isExpanded ? "Hide breakdown" : "Show breakdown"}
                                onClick={() => setExpandedKey(isExpanded ? null : l.key)}
                                className="text-ink-muted hover:text-ink"
                              >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                            )}
                          </td>
                          <td className="px-3 py-1.5 font-medium text-ink">
                            {l.materialName}
                            {l.sourceRows.length > 0 && (
                              <span className="ml-1.5 font-normal text-ink-muted">
                                ({l.sourceRows.length} item{l.sourceRows.length === 1 ? "" : "s"})
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-1.5 text-ink-secondary">{consumptionLabel(l)}</td>
                          <td className="px-3 py-1.5">
                            {l.availablePackOptions.length > 1 ? (
                              <select
                                value={l.packOptionIndex}
                                onChange={(e) => updatePackOption(l.key, Number(e.target.value))}
                                className="h-8 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                              >
                                {l.availablePackOptions.map((p, i) => (
                                  <option key={p.label} value={i}>
                                    {p.label}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="text-ink-secondary">{l.availablePackOptions[0]?.label ?? "—"}</span>
                            )}
                          </td>
                          <td className="px-3 py-1.5">
                            <input
                              type="number"
                              min={0}
                              value={l.packsOrdered}
                              onChange={(e) => updatePacksOrdered(l.key, Number(e.target.value))}
                              className="h-8 w-20 rounded-md border border-line-strong bg-surface px-2 text-xs text-ink outline-none"
                            />
                          </td>
                          <td className="px-3 py-1.5 text-warning">{l.notes ?? ""}</td>
                        </tr>
                        {isExpanded && (
                          <tr className="border-b border-line/60 bg-surface-sunken/60 last:border-0">
                            <td />
                            <td colSpan={5} className="px-3 py-2">
                              <p className="mb-1.5 text-[10px] uppercase tracking-wide text-ink-muted">
                                Item-wise consumption behind this total — {l.sourceRows.length} SKU
                                {l.sourceRows.length === 1 ? "" : "s"} across the selected programs
                              </p>
                              <table className="w-full text-[11px]">
                                <thead>
                                  <tr className="text-left text-ink-muted">
                                    <th className="py-1 pr-3 font-medium">SKU / Description</th>
                                    <th className="py-1 pr-3 font-medium">Program</th>
                                    <th className="py-1 pr-3 font-medium">Width × Height (mm)</th>
                                    <th className="py-1 pr-3 font-medium">Qty</th>
                                    <th className="py-1 pr-3 font-medium">Contribution</th>
                                    <th className="py-1 pr-3 font-medium">Qty/pack</th>
                                    <th className="py-1 pr-3 font-medium">Packs needed (this SKU)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {l.sourceRows.map(({ row, contribution, packsForThisSku }, i) => (
                                    <tr key={`${l.key}-${row.id}-${i}`} className="border-t border-line/40">
                                      <td className="py-1 pr-3 text-ink">{skuLabel(row)}</td>
                                      <td className="py-1 pr-3 text-ink-secondary">{row.program ?? "—"}</td>
                                      <td className="py-1 pr-3 text-ink-secondary">
                                        {row.width_mm != null && row.height_mm != null ? `${row.width_mm} × ${row.height_mm}` : "—"}
                                      </td>
                                      <td className="py-1 pr-3 text-ink-secondary">{row.order_qty ?? "—"}</td>
                                      <td className="py-1 pr-3 font-medium text-ink">
                                        {contributionLabel(l.consumptionUnit, contribution)}
                                      </td>
                                      <td className="py-1 pr-3 text-ink-secondary">{row.qty_per_pack ?? "—"}</td>
                                      <td className="py-1 pr-3 font-medium text-ink">{packsForThisSku ?? "—"}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                              {l.sourceRows.some((s) => s.packsForThisSku != null) && (
                                <p className="mt-1.5 text-[10px] italic text-ink-muted">
                                  &quot;Packs needed&quot; comes from per-SKU nesting data on file (how many pieces fit per pack) —
                                  more accurate than an area estimate where it&apos;s available.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <label className="flex flex-col gap-1 text-xs font-medium text-ink-secondary">
            Notes for this order
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Anything else to include on the purchase request"
              className="rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none"
            />
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" size="sm" onClick={() => saveOrder("draft")} loading={saving} disabled={lines.length === 0}>
              <Save size={14} />
              Save Draft
            </Button>
            <Button variant="secondary" size="sm" onClick={() => saveOrder("sent")} loading={saving} disabled={lines.length === 0}>
              <Send size={14} />
              Save &amp; Mark Sent
            </Button>
            <Button variant="secondary" size="sm" onClick={downloadPdf} loading={downloading} disabled={lines.length === 0}>
              <Download size={14} />
              Download PDF
            </Button>
            {lastSavedRef && (
              <span className="flex items-center gap-1 text-xs text-success">
                {saving && <Loader2 size={12} className="animate-spin" />}
                Saved as {lastSavedRef}
              </span>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
