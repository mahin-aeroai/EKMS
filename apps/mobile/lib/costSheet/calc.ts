// MMDI ONE Cost Sheet -- pure calculation helpers.
//
// Direct port of apps/web/src/app/workspaces/cost-sheet/calc.ts (the real
// "Tools -> Cost Sheet" tool, BOM + Work Centre costing model) -- see
// this project's own note on that file for the full history/reasoning.
// Duplicated here rather than imported cross-app: apps/mobile and
// apps/web are separate workspace packages that don't import each
// other's src directly, and moving it into packages/shared would mean
// also touching apps/web's own import path -- a web-app change with its
// own Vercel deploy, out of scope for a mobile-only session. The math
// itself is copied byte-for-byte from the web version; if that file
// changes, this one should too.
//
// "in my previous chat i asked to add new module cost sheet but not
// sign costsheets. the cost sheet from tool from web app and which we
// build costing like attached screen" -- this replaces the earlier,
// wrongly-scoped mobile "Cost Sheets" tab (a list of past Sign Costing
// runs) with the actual BOM+Work-Centre calculator tool.

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
  recentLineCost: number;
  avgLineCost: number;
}

export interface WorkCentreCost {
  workCentre: string;
  rateRow: WorkCentreRateRow | null;
  cost: number | null;
}

export interface CostSheetResult {
  sqft: number;
  sellingAmount: number;
  lineCosts: LineCost[];
  materialCostRecent: number;
  materialCostAvg: number;
  inkCostRecent: number;
  inkCostAvg: number;
  workCentreCosts: WorkCentreCost[];
  totalProcessCost: number;
  totalCostRecent: number;
  totalCostAvg: number;
  gpRecent: number;
  gpRecentPct: number | null;
  gpAvg: number;
  gpAvgPct: number | null;
}

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
  const multiplier = line.consumption_qty * (1 + line.wastage_pct) * (1 + line.markup_pct);
  return {
    line,
    rawMaterial,
    recentUnitPrice,
    avgUnitPrice,
    recentLineCost: (recentUnitPrice ?? 0) * multiplier,
    avgLineCost: (avgUnitPrice ?? 0) * multiplier,
  };
}

const SQFT_SCALED_UNITS = new Set(["SQFT"]);

function isSqftScaled(basis: string) {
  return SQFT_SCALED_UNITS.has(basis);
}

function sumByScaling(lineCosts: LineCost[], sqftScaled: boolean, field: "recentLineCost" | "avgLineCost") {
  return lineCosts.filter((lc) => isSqftScaled(lc.line.basis) === sqftScaled).reduce((sum, lc) => sum + lc[field], 0);
}

function sumMaterialCost(lineCosts: LineCost[], field: "recentLineCost" | "avgLineCost", sqft: number, qty: number) {
  return sumByScaling(lineCosts, true, field) * sqft + sumByScaling(lineCosts, false, field) * qty;
}

export const PRINT_DEPENDENT_WORK_CENTRES = new Set([
  "WC1A Solvent Printing",
  "WC1B UV Printing",
  "WC1C Latex Printing",
  "WC1D Dye Sub Printing",
  "WC3 Dye Sub Transfer",
]);

export function computeWorkCentreCost(
  workCentre: string,
  template: BomTemplateRow,
  rates: WorkCentreRateRow[],
  sqft: number,
  qty: number
): WorkCentreCost {
  const printMode = PRINT_DEPENDENT_WORK_CENTRES.has(workCentre) ? template.print_mode : "-";
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
  const materialCostRecent = sumMaterialCost(lineCosts, "recentLineCost", sqft, inputs.qty);
  const materialCostAvg = sumMaterialCost(lineCosts, "avgLineCost", sqft, inputs.qty);
  const inkLineCosts = lineCosts.filter((lc) => lc.line.material_category === "Ink");
  const inkCostRecent = sumMaterialCost(inkLineCosts, "recentLineCost", sqft, inputs.qty);
  const inkCostAvg = sumMaterialCost(inkLineCosts, "avgLineCost", sqft, inputs.qty);

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
    inkCostRecent,
    inkCostAvg,
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

// "The Traditional GP and Value-Addition GP should be calculated on a
// cost-based methodology, not on the selling price" -- this replaces an
// earlier, WRONG implementation of this function that used the
// gross-profit-MARGIN formula (price = cost / (1 - GP%), i.e. GP% as a
// fraction of the final selling price). That was verified against a
// chat-shorthand example earlier in this project's history ("GP 50%
// means 100 becomes 200") and looked consistent at the time, but this
// round's detailed written methodology makes clear the real intent was
// always a cost-plus MARKUP -- GP% as a fraction of the COST BASE, added
// on top of it -- which is a different formula except by coincidence at
// certain percentages. Implemented literally from that methodology:
//
//  1. Traditional (total_cost) -- "Raw Material Cost + Wastage +
//     Material Mark-up + All Work Centre Costs + 50% GP ... the 50% GP
//     is applied to the overall cost base, including the raw material
//     component." GP% x (material + ink + work centre cost), added to
//     that same total. Default 50% -> price = 1.5x total cost.
//
//  2. Value Addition (services_only) -- "Raw Material Cost + Wastage +
//     Material Mark-up + Work Centre Costs + GP on Work Centre Costs +
//     Ink Cost ... the raw material component is excluded from the GP
//     calculation ... by default it should be charged more GP% like
//     instead 50% we make it 100%." Material and ink are both recovered
//     at cost (no GP on either) -- GP% applies ONLY to work centre cost,
//     added on top of it. Default 100% -> price = material + ink +
//     2x work centre cost, which typically lands the overall total
//     somewhere around 1.5x depending on how much of the job's cost is
//     raw material vs. processing (the "1.5X" the methodology mentions
//     is that rough real-world outcome, not a fixed multiplier baked
//     into the formula itself).
export type GpMethod = "total_cost" | "services_only";

/** Traditional method's default -- GP on the full cost base. */
export const TRADITIONAL_DEFAULT_GP_PCT = 50;
/** Value Addition method's default -- GP only on work centre cost, so it
 * needs to run higher to recover a comparable margin overall. */
export const VALUE_ADDITION_DEFAULT_GP_PCT = 100;

/**
 * Suggested selling amount (₹, NOT per-sqft -- divide by sqft yourself)
 * under the given method's cost-plus markup formula. `materialAtCost`
 * should exclude ink (see inkCostRecent/Avg on CostSheetResult);
 * `inkCost` and `workCentreCost` are passed separately since Value
 * Addition treats them differently (ink recovered at cost, GP only on
 * work centre cost) -- Traditional applies the same GP% to all three
 * either way, so the split doesn't change its result, just lets one
 * function serve both methods with one clear contract.
 */
export function suggestSellingPrice(
  materialAtCost: number,
  inkCost: number,
  workCentreCost: number,
  targetGpPct: number,
  method: GpMethod
): number {
  if (method === "total_cost") {
    const totalCost = materialAtCost + inkCost + workCentreCost;
    return totalCost * (1 + targetGpPct);
  }
  return materialAtCost + inkCost + workCentreCost * (1 + targetGpPct);
}
