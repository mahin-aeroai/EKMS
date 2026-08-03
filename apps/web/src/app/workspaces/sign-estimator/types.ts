// src/app/workspaces/sign-estimator/types.ts
//
// EstimateSnapshot is the shape stored verbatim in sign_estimates.calc
// (jsonb). It's built once by the Estimator wizard when a cost sheet is
// generated, and read back unchanged by CostSheetTab/HistoryTab so a past
// estimate's cost sheet always re-renders exactly as it was quoted, even if
// master prices have since changed. This mirrors the original SignERP_v2.html
// generateCostSheet()'s `rec.data` snapshot.

export interface AccessoryLineSnapshot {
  name: string;
  qty: number;
  unit: string;
  unitCost: number;
  lineCost: number;
}

export interface ProfileSnapshot {
  name: string;
  widthMM: number;
  heightMM: number;
  stockLenMM: number;
  barsRequired: number;
  utilPct: number;
  scrapCost: number;
  cost: number;
}

export interface SheetSnapshot {
  name: string;
  signSqFt: number;
  wastePct: number;
  chargeableSqFt: number;
  costPerSqFt: number;
  cost: number;
}

export interface LedModuleSnapshot {
  mode: "module";
  modelName: string;
  cols: number;
  rows: number;
  count: number;
  watt: number;
  cost: number;
}

export interface LedBarSnapshot {
  mode: "bar";
  modelName: string;
  numBars: number;
  piecesPerCol: number;
  totalPieces: number;
  watt: number;
  cost: number;
}

export interface DriverSnapshot {
  requiredW: number;
  count: number;
  driverWatt: number;
  utilPct: number;
  cost: number;
}

export interface PrintSnapshot {
  mediaName: string;
  sqFt: number; // chargeable -- plain sign size, never inflated by bleed/waste
  productionSqFt: number; // reference only -- incl. bleed + waste, never billed
  costPerSqFt: number;
  finishingLabel: string;
  cost: number;
}

export interface PricingSnapshot {
  // Signage (frame) -- full cost-plus build-up.
  raw: number;
  ovh: number;
  ovhPct: number;
  labour: number;
  costPer: number;
  costAll: number;
  sellBD: number;
  markupPct: number;
  discPct: number;
  discAmt: number;
  signageSell: number;
  // Signage can be invoiced either as the cost-plus suggestion/override
  // (lumpsum) or as a ₹/sq.ft rate × sign area -- both recorded so a past
  // estimate's cost sheet shows exactly how the posted price was arrived at.
  signagePriceBasis: "lumpsum" | "sqft";
  signageRatePerSqft: number | null;

  // Printing -- posted selling price, no cost-plus (printCostRef is
  // reference-only, computed on a cost-plus basis for margin visibility).
  // Same lumpsum-vs-₹/sqft basis as signage above.
  printCostRef: number;
  printSell: number;
  printPriceBasis: "lumpsum" | "sqft";
  printRatePerSqft: number | null;

  // Shipping -- posted selling price, no cost tracked.
  shipping: number;

  // Installation -- posted selling price, no cost tracked.
  installSell: number;

  // Combined invoice total (signageSell + printSell + shipping +
  // installSell), GST applied once on that combined total.
  sell: number;
  gstPct: number;
  gstAmt: number;
  final: number;
  margin: number;
  mgnAmt: number;
}

export interface EstimateSnapshot {
  category: string;
  categoryLabel: string;
  jobName: string;
  dimW: number;
  dimH: number;
  dimUnit: string;
  widthMM: number;
  heightMM: number;
  qty: number;
  profile: ProfileSnapshot | null;
  sheet: SheetSnapshot | null;
  accessories: AccessoryLineSnapshot[];
  led: LedModuleSnapshot | LedBarSnapshot | null;
  driver: DriverSnapshot | null;
  print: PrintSnapshot | null;
  pricing: PricingSnapshot;
}

export const CATEGORY_LABELS: Record<string, string> = {
  nonlit: "Non-Lit Sign",
  "seg-indoor": "Backlit SEG Indoor",
  "backlit-outdoor": "Backlit Outdoor",
  "outdoor-illum": "Outdoor Illuminated",
};

// Maps the 4 sign-type categories a user picks in Step 1 to the 3 profile
// categories masters are tagged with (backlit-outdoor and outdoor-illum
// both draw from the "seg-outdoor" profile pool).
export const CATEGORY_TO_PROFILE_CATEGORY: Record<string, "nonlit" | "seg-indoor" | "seg-outdoor"> = {
  nonlit: "nonlit",
  "seg-indoor": "seg-indoor",
  "backlit-outdoor": "seg-outdoor",
  "outdoor-illum": "seg-outdoor",
};
