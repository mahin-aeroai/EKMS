// MMDI ONE Cost Sheet -- pure calculation helpers.
//
// Ports the same BOM + Work Centre cost model built and verified as an
// Excel workbook this session ("FG Cost Sheet - Macro Media Digital
// Imaging.xlsx") into MMDI ONE. Kept dependency-free (no Supabase import
// here) so it's easy to unit test and reuse from both the calculator tab
// and, later, anywhere else that needs the same math (e.g. a saved
// cost-sheet-run table, if that's ever added -- see page.tsx's header note).

import type { BomTemplateLineRow, BomTemplateRow, RawMaterialRow, WorkCentreRateRow } from "@mmdi/shared/rows";

export type Uom = "FT" | "INC";

export interface CostSheetInputs {
  uom: Uom;
  width: number;
  height: number;
  qty: number;
  sellingPricePerSqft: number;
}

export interface LineCost {
  line: BomTemplateLineRow;
  rawMaterial: RawMaterialRow | null;
  recentUnitPrice: number | null;
  avgUnitPrice: number | null;
  recentLineCost: number; // per sqft or per piece, per the line's basis
  avgLineCost: number;
}

export interface WorkCentreCost {
  workCentre: string;
  rateRow: WorkCentreRateRow | null;
  cost: number | null; // null if no rate at all (confidence 'missing' with rate NULL)
}

export interface CostSheetResult {
  sqft: number;
  sellingAmount: number;
  lineCosts: LineCost[];
  materialCostRecent: number;
  materialCostAvg: number;
  workCentreCosts: WorkCentreCost[];
  totalProcessCost: number;
  totalCostRecent: number;
  totalCostAvg: number;
  gpRecent: number;
  gpRecentPct: number | null;
  gpAvg: number;
  gpAvgPct: number | null;
}

/** Same FT/INC convention as the Excel workbook: Width x Height are already
 * in feet for UOM=FT (so Width*Height*Qty = total sqft directly); for
 * UOM=INC they're inches, so (Width*Height/144)*Qty. */
export function computeSqft({ uom, width, height, qty }: CostSheetInputs): number {
  if (!width || !height || !qty) return 0;
  return uom === "INC" ? (width * height * qty) / 144 : width * height * qty;
}

export function computeLineCost(
  line: BomTemplateLineRow,
  rawMaterialsByCode: Map<string, RawMaterialRow>
): LineCost {
  const rawMaterial = line.raw_material_code ? rawMaterialsByCode.get(line.raw_material_code) ?? null : null;
  const recentUnitPrice = rawMaterial?.unit_cost_recent ?? null;
  const avgUnitPrice = rawMaterial?.unit_cost_avg ?? null;
  const multiplier = line.consumption_qty * (1 + line.wastage_pct);
  return {
    line,
    rawMaterial,
    recentUnitPrice,
    avgUnitPrice,
    recentLineCost: (recentUnitPrice ?? 0) * multiplier,
    avgLineCost: (avgUnitPrice ?? 0) * multiplier,
  };
}

// Only "SQFT" scales with the job's computed area -- every other unit
// (Nos, RFT, MTR, KGS, SET) scales with the job's Qty, the same math
// "per_piece" always used. The user enters consumption_qty in whatever
// real unit makes sense for that material (e.g. "0.0234" for RFT of
// keder per sqft of sign, or "2" for Nos of a hardware part per piece)
// -- this file doesn't need to know the physical meaning, just whether
// to multiply by sqft or by qty.
const SQFT_SCALED_UNITS = new Set(["SQFT"]);

function isSqftScaled(basis: string) {
  return SQFT_SCALED_UNITS.has(basis);
}

function sumByScaling(lineCosts: LineCost[], sqftScaled: boolean, field: "recentLineCost" | "avgLineCost") {
  return lineCosts.filter((lc) => isSqftScaled(lc.line.basis) === sqftScaled).reduce((sum, lc) => sum + lc[field], 0);
}

export function computeWorkCentreCost(
  workCentre: string,
  template: BomTemplateRow,
  rates: WorkCentreRateRow[],
  sqft: number,
  qty: number
): WorkCentreCost {
  // Print-dependent work centres key on (work_centre, print_mode, substrate);
  // every other work centre keys on (work_centre, '-', substrate) -- same
  // split as the Excel workbook's Rate Card, because a QC/Packing/Cut rate
  // doesn't vary by frontlit vs backlit, but a Printing rate does.
  const PRINT_DEPENDENT = new Set([
    "WC1A Solvent Printing",
    "WC1B UV Printing",
    "WC1C Latex Printing",
    "WC1D Dye Sub Printing",
    "WC3 Dye Sub Transfer",
  ]);
  const printMode = PRINT_DEPENDENT.has(workCentre) ? template.print_mode : "-";
  const rateRow =
    rates.find((r) => r.work_centre === workCentre && r.print_mode === printMode && r.substrate === template.substrate_type) ??
    null;
  if (!rateRow || rateRow.rate === null) {
    return { workCentre, rateRow, cost: null };
  }
  const basisQty = rateRow.rate_basis === "per_piece" ? qty : sqft;
  return { workCentre, rateRow, cost: rateRow.rate * basisQty };
}

export function computeCostSheet(
  template: BomTemplateRow,
  lines: BomTemplateLineRow[],
  rawMaterialsByCode: Map<string, RawMaterialRow>,
  rates: WorkCentreRateRow[],
  inputs: CostSheetInputs
): CostSheetResult {
  const sqft = computeSqft(inputs);
  const sellingAmount = sqft * inputs.sellingPricePerSqft;

  const lineCosts = lines.map((l) => computeLineCost(l, rawMaterialsByCode));
  const materialCostRecent =
    sumByScaling(lineCosts, true, "recentLineCost") * sqft + sumByScaling(lineCosts, false, "recentLineCost") * inputs.qty;
  const materialCostAvg =
    sumByScaling(lineCosts, true, "avgLineCost") * sqft + sumByScaling(lineCosts, false, "avgLineCost") * inputs.qty;

  const workCentreCosts = template.work_centres.map((wc) => computeWorkCentreCost(wc, template, rates, sqft, inputs.qty));
  const totalProcessCost = workCentreCosts.reduce((sum, w) => sum + (w.cost ?? 0), 0);

  const totalCostRecent = materialCostRecent + totalProcessCost;
  const totalCostAvg = materialCostAvg + totalProcessCost;
  const gpRecent = sellingAmount - totalCostRecent;
  const gpAvg = sellingAmount - totalCostAvg;

  return {
    sqft,
    sellingAmount,
    lineCosts,
    materialCostRecent,
    materialCostAvg,
    workCentreCosts,
    totalProcessCost,
    totalCostRecent,
    totalCostAvg,
    gpRecent,
    gpRecentPct: sellingAmount ? gpRecent / sellingAmount : null,
    gpAvg,
    gpAvgPct: sellingAmount ? gpAvg / sellingAmount : null,
  };
}
