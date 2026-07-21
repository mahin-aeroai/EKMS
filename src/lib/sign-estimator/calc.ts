// src/lib/sign-estimator/calc.ts
//
// Pure, framework-free port of the calculation engine from SignERP_v2.html
// (the user's original single-file vanilla-JS costing tool). Every formula
// below is copied verbatim from that file's logic -- comments explain WHY a
// formula is shaped the way it is because the original file's comments
// explicitly documented bugs in an "old ERP" this replaced, and that context
// matters for anyone touching this code later.
//
// This module takes plain data in and returns plain data out -- no DOM, no
// React, no Supabase. The Estimator wizard component owns state and calls
// `runEstimate()` on every change, exactly like the original called
// calcAll() from every input's onchange handler.

// ── Master data shapes (structurally compatible with the Supabase row types
//    in src/lib/supabase.ts -- kept separate so this file has zero imports
//    and is trivially unit-testable) ──────────────────────────────────────

export interface ProfileMaster {
  id: string;
  name: string;
  category: "nonlit" | "seg-indoor" | "seg-outdoor";
  stock_len: number;
  cost: number;
}

export interface SheetMaster {
  width: number;
  height: number;
  cost_per_sheet: number;
  wastage: number | null;
}

export interface AccessoryMaster {
  id: string;
  name: string;
  unit: string;
  mandatory: boolean;
  unit_cost: number;
}

export interface LedModuleMaster {
  mod_w: number;
  mod_h: number;
  h_gap: number;
  v_gap: number;
  watt: number;
  cost: number;
}

export interface LedBarMaster {
  bar_len: number;
  bar_width: number;
  watt: number;
  cost: number;
}

export interface DriverMaster {
  id: string;
  watt: number;
  brand: string | null;
  cost: number;
  active: boolean;
}

export interface PrintingMediaMaster {
  cost_per_sqft: number;
  wastage: number | null;
}

// ═══════════════════════════════════════════════════════════
//  CUT OPTIMIZER — 1D Cutting Stock (Bin Packing)
//
//  Rewritten from the ground up. The previous version just summed raw
//  member lengths into "bins" and never checked whether a single member
//  was longer than the stock bar itself -- a bin's `used` could exceed
//  `stockLen`, producing nonsense like 122% utilisation and negative
//  leftover on a 5m bar (physically impossible: a 5.0m profile can never
//  hold 6.1m of material).
//
//  This version makes that structurally impossible instead of just
//  patching the symptom:
//   1. Each sign contributes 4 raw frame members: 2×Width, 2×Height (mm).
//   2. An optional 45° mitre allowance adds length to each member end
//      that's mitre-cut (`mitreEnabled` + `mitreAllowanceMM`).
//   3. Any member longer than the stock length is pre-split into multiple
//      connector-joined pieces BEFORE packing even starts, so every piece
//      handed to the bin packer is already guaranteed <= stockLen.
//      `connectorAllowanceMM` models the extra material a connector
//      sleeve consumes at each joint.
//   4. The flat list of pieces is bin-packed with First Fit Decreasing
//      (default) or Best Fit Decreasing, reusing any bin already opened
//      -- and therefore any offcut already committed -- before starting a
//      new stock bar, and reserving saw kerf between consecutive cuts on
//      the same bar (`kerfMM`).
//   5. Every bin is validated on the way out: used <= stockLen,
//      remaining >= 0, utilisation <= 100%. A bin that fails this throws
//      instead of silently shipping an impossible cutting plan (see
//      assertValidBin) -- this should never fire given the construction
//      above, but it's cheap insurance against a future regression.
//
//  All of kerf / connector allowance / mitre allowance / minimum reusable
//  offcut / algorithm are configurable via an options object (all default
//  to the tool's historical values -- kerf 0, connector 0, mitre off --
//  so existing estimates don't shift unless a caller opts in), and
//  `packMembers`/`packAuto` accept labelled, pooled member lists so
//  multiple signs (or multiple candidate stock lengths) can be optimised
//  together later without changing this module's shape again.
// ═══════════════════════════════════════════════════════════

export interface CutOptimizerOptions {
  /** Saw blade width consumed between two consecutive cuts on the same
   *  bar, in mm. Lost material per bar is (piecesInBin - 1) * kerfMM.
   *  Default 0 (no kerf modelled) -- matches historical behaviour. */
  kerfMM: number;
  /** Extra material consumed at each connector splice when an oversized
   *  member is joined from multiple stock pieces, in mm. Default 0. */
  connectorAllowanceMM: number;
  /** A bar's leftover offcut only counts as reusable stock (vs. scrap)
   *  once it's at least this long, in mm. Default 300mm. */
  minReusableOffcutMM: number;
  /** Whether every member gets extra length for a 45° mitred corner on
   *  both ends before splitting/packing. Default off. */
  mitreEnabled: boolean;
  /** Extra length added per mitred end when mitreEnabled is true, in mm. */
  mitreAllowanceMM: number;
  /** First Fit Decreasing (places each cut in the first bin with room) or
   *  Best Fit Decreasing (places each cut in whichever open bin leaves
   *  the least leftover space) -- BFD packs tighter at the cost of a
   *  little more work per cut. Default "FFD". */
  algorithm: "FFD" | "BFD";
}

const DEFAULT_CUT_OPTIONS: CutOptimizerOptions = {
  kerfMM: 0,
  connectorAllowanceMM: 0,
  minReusableOffcutMM: 300,
  mitreEnabled: false,
  mitreAllowanceMM: 0,
  algorithm: "FFD",
};

export interface CutPiece {
  /** Final cuttable length in mm -- always <= the stock length it's
   *  packed against. */
  length: number;
  /** e.g. "Member 1" or "Member 1 (piece 2/3)" for a split member. */
  label: string;
  /** True for every piece after the first from the same oversized member
   *  -- i.e. it's joined to the previous piece by a connector. */
  isSplice: boolean;
}

export interface CutBin {
  cuts: number[];
  cutDetails: CutPiece[];
  used: number;
  remaining: number;
  utilPct: number;
  isReusable: boolean;
}

export interface CutAnalysis {
  totalBars: number;
  totalUsed: number;
  totalCap: number;
  totalWaste: number;
  reusable: number;
  scrap: number;
  util: number;
  totalCost: number;
  scrapCost: number;
  totalConnectors: number;
}

/** Splits one member into 1+ connector-joined pieces, each <= maxPieceMM.
 *  Returned pieces sum to (length + connectors * connectorAllowanceMM)
 *  since every splice consumes extra material at the joint. */
function splitMember(lengthMM: number, maxPieceMM: number, connectorAllowanceMM: number): number[] {
  if (lengthMM <= maxPieceMM) return [lengthMM];
  // Guard against a misconfigured connector allowance that would consume
  // an entire (or more than an entire) bar and loop forever below.
  const connAllow = Math.min(Math.max(0, connectorAllowanceMM), Math.max(1, maxPieceMM - 1));
  let n = Math.ceil(lengthMM / maxPieceMM);
  while (n * maxPieceMM - (n - 1) * connAllow < lengthMM) n++;
  const totalMaterial = lengthMM + (n - 1) * connAllow;
  const base = Math.floor(totalMaterial / n);
  const pieces = new Array(n).fill(base) as number[];
  let extra = totalMaterial - base * n;
  for (let i = 0; i < pieces.length && extra > 0; i++, extra--) pieces[i] += 1;
  return pieces;
}

interface WorkingBin {
  pieces: CutPiece[];
  rawUsed: number;
}

function usedWithKerf(rawUsed: number, pieceCount: number, kerfMM: number): number {
  return rawUsed + Math.max(0, pieceCount - 1) * kerfMM;
}

/** Throws if a bin violates the physical constraints every stock bar must
 *  satisfy. A correctly-built bin can never fail this -- it's a
 *  fail-loud guard against a future regression, not a normal code path. */
function assertValidBin(bin: CutBin, stockLen: number) {
  const EPS = 1e-6;
  if (bin.used > stockLen + EPS || bin.remaining < -EPS || bin.utilPct > 100 + EPS) {
    throw new Error(
      `Cut optimizer produced an invalid stock bar: used=${bin.used}mm on a ${stockLen}mm bar ` +
        `(remaining=${bin.remaining}mm, util=${bin.utilPct.toFixed(1)}%). This should never happen.`
    );
  }
}

function finaliseBins(bins: WorkingBin[], stockLen: number, opts: CutOptimizerOptions): CutBin[] {
  return bins.map((w) => {
    const used = usedWithKerf(w.rawUsed, w.pieces.length, opts.kerfMM);
    const remaining = stockLen - used;
    const bin: CutBin = {
      cuts: w.pieces.map((p) => p.length),
      cutDetails: w.pieces,
      used,
      remaining,
      utilPct: (used / stockLen) * 100,
      isReusable: remaining >= opts.minReusableOffcutMM,
    };
    assertValidBin(bin, stockLen);
    return bin;
  });
}

function toPieces(members: { length: number; label: string }[], maxPieceMM: number, opts: CutOptimizerOptions): { pieces: CutPiece[]; totalConnectors: number } {
  let totalConnectors = 0;
  const pieces: CutPiece[] = [];
  for (const member of members) {
    const requiredLength = member.length + (opts.mitreEnabled ? 2 * opts.mitreAllowanceMM : 0);
    const split = splitMember(requiredLength, maxPieceMM, opts.connectorAllowanceMM);
    totalConnectors += split.length - 1;
    split.forEach((len, i) => {
      pieces.push({
        length: len,
        label: split.length > 1 ? `${member.label} (piece ${i + 1}/${split.length})` : member.label,
        isSplice: i > 0,
      });
    });
  }
  return { pieces, totalConnectors };
}

/** First Fit Decreasing / Best Fit Decreasing over a single stock length.
 *  Every `piece.length` is assumed already <= stockLen (guaranteed by
 *  splitMember above) -- reuses any bin already opened before starting a
 *  new one, and accounts for kerf on every fit check. */
function packPieces(pieces: CutPiece[], stockLen: number, kerfMM: number, algorithm: "FFD" | "BFD"): WorkingBin[] {
  const sorted = [...pieces].sort((a, b) => b.length - a.length);
  const bins: WorkingBin[] = [];

  for (const piece of sorted) {
    if (piece.length > stockLen) {
      // Structurally shouldn't happen -- splitMember() caps every piece
      // at maxPieceMM, which callers always pass as (at most) stockLen.
      throw new Error(`Cut optimizer: a ${piece.length}mm piece cannot fit on ${stockLen}mm stock even alone.`);
    }

    let target: WorkingBin | null = null;
    let bestSlack = Infinity;
    for (const bin of bins) {
      const candidate = usedWithKerf(bin.rawUsed + piece.length, bin.pieces.length + 1, kerfMM);
      if (candidate > stockLen) continue;
      if (algorithm === "FFD") {
        target = bin;
        break;
      }
      const slack = stockLen - candidate;
      if (slack < bestSlack) {
        bestSlack = slack;
        target = bin;
      }
    }

    if (target) {
      target.pieces.push(piece);
      target.rawUsed += piece.length;
    } else {
      bins.push({ pieces: [piece], rawUsed: piece.length });
    }
  }

  return bins;
}

function attachConnectorCount<T extends object>(bins: T, totalConnectors: number): T {
  Object.defineProperty(bins, "__totalConnectors", { value: totalConnectors, enumerable: false });
  return bins;
}

export const CutOpt = {
  /** Lower-level entry point: pack an arbitrary, already-labelled list of
   *  members (e.g. pooled from several signs) against ONE stock length.
   *  `pack()` below is a thin wrapper over this for the existing
   *  single-sign call sites. */
  packMembers(members: { length: number; label: string }[], stockLen: number, options?: Partial<CutOptimizerOptions>): CutBin[] {
    if (stockLen <= 0) throw new Error(`Cut optimizer: stock length must be positive, got ${stockLen}`);
    const opts: CutOptimizerOptions = { ...DEFAULT_CUT_OPTIONS, ...options };
    const { pieces, totalConnectors } = toPieces(members, stockLen, opts);
    const working = packPieces(pieces, stockLen, opts.kerfMM, opts.algorithm);
    const bins = finaliseBins(working, stockLen, opts);
    return attachConnectorCount(bins, totalConnectors);
  },

  /** Backward-compatible entry point -- takes a flat array of raw member
   *  lengths (mm), the same shape every caller has always passed (e.g.
   *  `[wMM, wMM, hMM, hMM]` for one sign's frame). */
  pack(cuts: number[], stockLen: number, options?: Partial<CutOptimizerOptions>): CutBin[] {
    const members = cuts.map((length, i) => ({ length, label: `Member ${i + 1}` }));
    return CutOpt.packMembers(members, stockLen, options);
  },

  /** Same idea as packMembers(), but tries every stock length in
   *  `stockLengths` for each new bar and opens whichever one wastes the
   *  least against the piece that triggered it -- e.g. a yard stocking
   *  4m/5m/6m bar can minimise scrap instead of being locked to one
   *  length. Oversized members are split against the LARGEST available
   *  length, so a member only needs connectors if it's longer than every
   *  candidate stock length. */
  packAuto(members: { length: number; label: string }[], stockLengths: number[], options?: Partial<CutOptimizerOptions>): CutBin[] {
    if (stockLengths.length === 0) throw new Error("packAuto requires at least one stock length");
    if (stockLengths.length === 1) return CutOpt.packMembers(members, stockLengths[0], options);

    const opts: CutOptimizerOptions = { ...DEFAULT_CUT_OPTIONS, ...options };
    const sortedLengths = [...stockLengths].sort((a, b) => a - b);
    const maxAvailable = sortedLengths[sortedLengths.length - 1];
    const { pieces, totalConnectors } = toPieces(members, maxAvailable, opts);
    const sortedPieces = [...pieces].sort((a, b) => b.length - a.length);

    const bins: { stockLen: number; working: WorkingBin }[] = [];
    for (const piece of sortedPieces) {
      let target: { stockLen: number; working: WorkingBin } | null = null;
      let bestSlack = Infinity;
      for (const b of bins) {
        const candidate = usedWithKerf(b.working.rawUsed + piece.length, b.working.pieces.length + 1, opts.kerfMM);
        if (candidate > b.stockLen) continue;
        if (opts.algorithm === "FFD") {
          target = b;
          break;
        }
        const slack = b.stockLen - candidate;
        if (slack < bestSlack) {
          bestSlack = slack;
          target = b;
        }
      }
      if (target) {
        target.working.pieces.push(piece);
        target.working.rawUsed += piece.length;
      } else {
        const chosen = sortedLengths.find((len) => len >= piece.length) ?? maxAvailable;
        bins.push({ stockLen: chosen, working: { pieces: [piece], rawUsed: piece.length } });
      }
    }

    const finalised: CutBin[] = bins.map(({ stockLen, working }) => finaliseBins([working], stockLen, opts)[0]);
    return attachConnectorCount(finalised, totalConnectors);
  },

  analyse(bins: CutBin[], stockLen: number, costPerStock: number): CutAnalysis {
    const totalBars = bins.length;
    const totalUsed = bins.reduce((s, b) => s + b.used, 0);
    // Bins may carry their own true capacity (packAuto mixes stock
    // lengths) -- recover it as used+remaining per bin rather than
    // assuming every bar is `stockLen`.
    const totalCap = totalBars > 0 ? bins.reduce((s, b) => s + (b.used + b.remaining), 0) : 0;
    const totalWaste = totalCap - totalUsed;
    const reusable = bins.reduce((s, b) => s + (b.isReusable ? b.remaining : 0), 0);
    const scrap = totalWaste - reusable;
    const util = totalCap > 0 ? (totalUsed / totalCap) * 100 : 0;
    // Single flat cost-per-stock-bar, matching every current caller (one
    // profile => one stockLen => one price). packAuto's mixed-length bins
    // would need a length->cost map here if/when it's wired into pricing.
    const totalCost = totalBars * costPerStock;
    const scrapCost = stockLen > 0 ? (scrap / stockLen) * costPerStock : 0;
    const totalConnectors = (bins as CutBin[] & { __totalConnectors?: number }).__totalConnectors ?? 0;
    return { totalBars, totalUsed, totalCap, totalWaste, reusable, scrap, util, totalCost, scrapCost, totalConnectors };
  },
};

// ═══════════════════════════════════════════════════════════
//  SHEET CALCULATOR — Area-based costing (NOT full-sheet)
//
//  WHY THIS IS CORRECT:
//  A naive approach computes sheetsRequired = ceil(signArea / sheetArea),
//  cost = sheetsRequired x costPerSheet -- which always charges for at
//  least 1 full sheet, even for a tiny sign.
//
//  Correct logic: charge for actual sq.ft consumed + wastage %.
//  chargeable = actual x (1 + wastage / 100)
//  cost       = chargeable x (costPerSheet / sheetSqFt)
// ═══════════════════════════════════════════════════════════
const MM2_SQFT = 1 / (304.8 * 304.8);

export interface SheetResult {
  sigSqFt: number;
  shSqFt: number;
  cpSqFt: number;
  wPct: number;
  wasteArea: number;
  chargeable: number;
  chargedCost: number;
  balance: number;
  util: number;
}

export const SheetCalc = {
  calc(wMM: number, hMM: number, sheet: SheetMaster, overrideWaste: number | null, overrideCost: number | null): SheetResult {
    const signArea = wMM * hMM;
    const sheetArea = sheet.width * sheet.height;
    const cps = overrideCost || sheet.cost_per_sheet;
    const shSqFt = sheetArea * MM2_SQFT;
    const sigSqFt = signArea * MM2_SQFT;
    const cpSqFt = cps / shSqFt;
    const wPct = overrideWaste !== null ? overrideWaste : sheet.wastage || 0;
    const wasteArea = (sigSqFt * wPct) / 100;
    const chargeable = sigSqFt + wasteArea;
    const chargedCost = Math.round(chargeable * cpSqFt);
    const balance = Math.max(0, shSqFt - sigSqFt);
    return {
      sigSqFt: +sigSqFt.toFixed(3),
      shSqFt: +shSqFt.toFixed(3),
      cpSqFt: +cpSqFt.toFixed(2),
      wPct,
      wasteArea: +wasteArea.toFixed(3),
      chargeable: +chargeable.toFixed(3),
      chargedCost,
      balance: +balance.toFixed(3),
      util: +((sigSqFt / shSqFt) * 100).toFixed(1),
    };
  },
};

// ═══════════════════════════════════════════════════════════
//  LED CALCULATOR
// ═══════════════════════════════════════════════════════════
export interface ModuleGridResult {
  cols: number;
  rows: number;
  total: number;
  watt: number;
  cost: number;
  density: number;
  lux: number;
  hGap: number;
  vGap: number;
  footW: number;
  footH: number;
  availW: number;
  availH: number;
  covW: number;
  covH: number;
}

export interface BarLayoutResult {
  numBars: number;
  piecesPerCol: number;
  totalPieces: number;
  cutWastePerCol: number;
  watt: number;
  cost: number;
  spacing: number;
  availW: number;
  gapMM: number;
  marginMM: number;
}

export const LEDCalc = {
  // ── MODULE GRID ──────────────────────────────────────────
  // Grid placement across the full sign area.
  //   cols = floor((availW - modW) / (modW + hGap)) + 1
  //   rows = floor((availH - modH) / (modH + vGap)) + 1
  // This gives the number of modules that FIT within the available area
  // (sign minus edge margins on both sides).
  calcModules(wMM: number, hMM: number, mod: LedModuleMaster, marginMM: number, customHGap: number, customVGap: number): ModuleGridResult | null {
    const hGap = customHGap > 0 ? customHGap : mod.h_gap;
    const vGap = customVGap > 0 ? customVGap : mod.v_gap;
    const availW = wMM - 2 * marginMM;
    const availH = hMM - 2 * marginMM;
    if (availW < mod.mod_w || availH < mod.mod_h) return null;

    const cols = Math.max(1, Math.floor((availW - mod.mod_w) / (mod.mod_w + hGap)) + 1);
    const rows = Math.max(1, Math.floor((availH - mod.mod_h) / (mod.mod_h + vGap)) + 1);
    const total = cols * rows;
    const watt = +(total * mod.watt).toFixed(2);
    const cost = Math.round(total * mod.cost);

    const signM2 = (wMM / 1000) * (hMM / 1000);
    const density = +(total / signM2).toFixed(1);
    const wPerM2 = watt / signM2;
    // Rough lux: ~90 lm/W efficacy, /4 diffusion through fabric.
    const lux = Math.round(((wPerM2 * 90) / 4));

    const footW = cols * mod.mod_w + (cols - 1) * hGap;
    const footH = rows * mod.mod_h + (rows - 1) * vGap;
    return {
      cols, rows, total, watt, cost, density, lux, hGap, vGap,
      footW, footH, availW, availH,
      covW: +((footW / availW) * 100).toFixed(1),
      covH: +((footH / availH) * 100).toFixed(1),
    };
  },

  // ── LED BARS — VERTICAL PLACEMENT ONLY ──────────────────
  //  WHY VERTICAL?
  //  - Rainwater drains downward; horizontal bars collect water.
  //  - Industry standard for outdoor signage.
  //  - Wiring runs cleanly along the height direction.
  //
  //  numBars = floor((availW + gap) / (barWidth + gap))
  //  Derivation: n bars need n*barWidth + (n-1)*gap <= availW
  //              => n <= (availW + gap) / (barWidth + gap)
  //
  //  Each bar column covers the FULL sign height.
  //  piecesPerCol = ceil(signHeight / stockBarLen)
  //  totalPieces  = numBars * piecesPerCol
  calcBars(wMM: number, hMM: number, bar: LedBarMaster, gapMM: number, marginMM: number): BarLayoutResult | null {
    const availW = wMM - 2 * marginMM;
    if (availW < bar.bar_width) return null;

    const numBars = Math.max(1, Math.floor((availW + gapMM) / (bar.bar_width + gapMM)));
    const piecesPerCol = Math.ceil(hMM / bar.bar_len);
    const totalPieces = numBars * piecesPerCol;
    const cutWastePerCol = piecesPerCol * bar.bar_len - hMM; // mm wasted per column
    const watt = +(totalPieces * bar.watt).toFixed(2);
    const cost = Math.round(totalPieces * bar.cost);
    // Centre-to-centre spacing between adjacent bars.
    const spacing = numBars > 1 ? +((availW - bar.bar_width) / (numBars - 1)).toFixed(1) : availW;
    return {
      numBars, piecesPerCol, totalPieces,
      cutWastePerCol: +cutWastePerCol.toFixed(1),
      watt, cost, spacing, availW, gapMM, marginMM,
    };
  },
};

// ═══════════════════════════════════════════════════════════
//  DRIVER OPTIMIZER
//
//  1. requiredW    = totalLEDwatt x (1 + safetyBuf/100)
//  2. minCapacity  = totalLEDwatt / (maxLoad/100)   (never load beyond maxLoad%)
//  3. Find the smallest single driver that satisfies BOTH conditions.
//  4. If no single driver exists, use multiples of the largest.
//
//  Example: 142W LED, 30% buffer, 80% max load
//    requiredW   = 142 x 1.30 = 184.6W
//    minCapacity = 142 / 0.80 = 177.5W
//    -> select 200W driver (next standard size above 184.6W)
// ═══════════════════════════════════════════════════════════
export interface DriverSelection {
  selected: { drv: DriverMaster; qty: number }[];
  totalCap: number;
  required: number;
  util: number;
  spare: number;
  totalCost: number;
  strategy: "single" | "multiple";
}

export const DriverOpt = {
  optimise(ledWatt: number, safetyPct: number, maxLoadPct: number, drivers: DriverMaster[]): DriverSelection | null {
    if (!ledWatt || !drivers.length) return null;
    const required = ledWatt * (1 + safetyPct / 100);
    const minCap = ledWatt / (maxLoadPct / 100);
    const threshold = Math.max(required, minCap);
    const active = [...drivers].filter((d) => d.active !== false).sort((a, b) => a.watt - b.watt);

    // Strategy 1: smallest single driver above threshold.
    const single = active.find((d) => d.watt >= threshold);
    if (single) {
      return {
        selected: [{ drv: single, qty: 1 }],
        totalCap: single.watt,
        required: +required.toFixed(1),
        util: +((ledWatt / single.watt) * 100).toFixed(1),
        spare: +(single.watt - ledWatt).toFixed(1),
        totalCost: single.cost,
        strategy: "single",
      };
    }
    // Strategy 2: multiple of the largest driver.
    const largest = active[active.length - 1];
    if (!largest) return null;
    const qty = Math.ceil(threshold / largest.watt);
    const totalCap = qty * largest.watt;
    return {
      selected: [{ drv: largest, qty }],
      totalCap,
      required: +required.toFixed(1),
      util: +((ledWatt / totalCap) * 100).toFixed(1),
      spare: +(totalCap - ledWatt).toFixed(1),
      totalCost: qty * largest.cost,
      strategy: "multiple",
    };
  },
};

// ═══════════════════════════════════════════════════════════
//  ACCESSORY AUTO-QUANTITIES
//  Ported from initAccs() -- auto-computes qty for the 4 "structural"
//  accessory line items based on sign size/profile; anything else in the
//  accessories master defaults to 0 until the user ticks it on.
// ═══════════════════════════════════════════════════════════
export interface AccessoryLine {
  id: string;
  name: string;
  qty: number;
  unitCost: number;
  unit: string;
  mandatory: boolean;
  autoQty: number;
  locked: boolean;
  custom: boolean;
}

export function computeAccessoryDefaults(wMM: number, hMM: number, stockLen: number, masters: AccessoryMaster[]): AccessoryLine[] {
  const corners = 4;
  const needJoin = wMM > stockLen || hMM > stockLen;
  const flatJ = needJoin ? Math.ceil((wMM + hMM) / 2 / stockLen) : 0;
  const screws = corners * 4 + flatJ * 2;
  const brackets = Math.max(2, Math.ceil((wMM + hMM) / 1000 / 0.8));

  // Mapped by position in the master list the same way the original mapped
  // by fixed ids (ac1..ac4) -- Corner Joiner, Flat Joiner, Screw, Bracket.
  // Matched here by name substring so re-ordering the master list doesn't
  // silently break the auto-quantity mapping.
  const autoQtyFor = (name: string): number => {
    const n = name.toLowerCase();
    if (n.includes("corner")) return corners;
    if (n.includes("flat joiner")) return flatJ;
    if (n.includes("screw")) return screws;
    if (n.includes("bracket")) return brackets;
    return 0;
  };

  return masters.map((a) => {
    const autoQty = autoQtyFor(a.name);
    return {
      id: a.id, name: a.name, qty: autoQty, unitCost: a.unit_cost, unit: a.unit,
      mandatory: a.mandatory, autoQty, locked: false, custom: false,
    };
  });
}

// ═══════════════════════════════════════════════════════════
//  PRINTING & FINISHING
//  Ported from calcPrint() -- print area includes bleed on all 4 sides,
//  charged sq.ft = base + wastage%, plus flat-rate/per-metre finishing
//  add-ons (SEG silicone border only applies to lit signs; perimeter-based).
// ═══════════════════════════════════════════════════════════
export interface FinishingOptions {
  segBorder: boolean; // only meaningful when the sign is lit
  hemming: boolean;
  eyelets: boolean;
  welding: boolean;
  stitching: boolean;
}

export interface FinishingRates {
  segRatePerM: number;
  hemFlat: number;
  otherFlat: number; // eyelets / welding / stitching each use this flat rate
}

export interface PrintResult {
  printCost: number;
  printSqFt: number;
  printCostPerSqFt: number;
  finishingCost: number;
  finishingLabel: string;
  finLines: { label: string; detail: string; cost: number }[];
}

export function computePrint(
  wMM: number,
  hMM: number,
  media: PrintingMediaMaster,
  bleedMM: number,
  overrideWastePct: number | null,
  overrideCostPerSqFt: number | null,
  isLitSign: boolean,
  finishing: FinishingOptions,
  rates: FinishingRates
): PrintResult {
  const wPct = overrideWastePct !== null && overrideWastePct > 0 ? overrideWastePct : media.wastage || 0;
  const cpSqFt = overrideCostPerSqFt || media.cost_per_sqft;

  const pW = (wMM + bleedMM * 2) / 304.8;
  const pH = (hMM + bleedMM * 2) / 304.8;
  const baseArea = pW * pH;
  const wasteArea = (baseArea * wPct) / 100;
  const chgArea = baseArea + wasteArea;
  const printBase = chgArea * cpSqFt;

  const perimM = (wMM * 2 + hMM * 2) / 1000;
  let finishingCost = 0;
  const finLines: { label: string; detail: string; cost: number }[] = [];

  if (finishing.segBorder && isLitSign) {
    const cost = perimM * rates.segRatePerM;
    finishingCost += cost;
    finLines.push({ label: "SEG Silicone Border", detail: `${perimM.toFixed(2)}m × ₹${rates.segRatePerM}/m`, cost });
  }
  if (finishing.hemming) {
    finishingCost += rates.hemFlat;
    finLines.push({ label: "Hemming / Heat-seal", detail: "Flat rate", cost: rates.hemFlat });
  }
  ([
    ["eyelets", "Eyelets"],
    ["welding", "Welding"],
    ["stitching", "Stitching"],
  ] as const).forEach(([key, label]) => {
    if (finishing[key]) {
      finishingCost += rates.otherFlat;
      finLines.push({ label, detail: "Flat rate", cost: rates.otherFlat });
    }
  });

  return {
    printCost: Math.round(printBase + finishingCost),
    printSqFt: +chgArea.toFixed(3),
    printCostPerSqFt: cpSqFt,
    finishingCost,
    finishingLabel: finLines.length ? finLines.map((f) => f.label).join(", ") : "None",
    finLines,
  };
}

// ═══════════════════════════════════════════════════════════
//  PRICING
//  Ported from calcPricing() -- rolls every cost bucket up into overhead,
//  labour, installation, markup, discount, and GST.
// ═══════════════════════════════════════════════════════════
export interface PricingInputs {
  qty: number;
  labour: number;
  install: number;
  overheadPct: number;
  markupPct: number;
  discountPct: number;
  gstPct: number;
}

export interface PricingResult {
  raw: number;
  ovh: number;
  costPer: number;
  costAll: number;
  sellBD: number;
  discAmt: number;
  sell: number;
  gstAmt: number;
  final: number;
  margin: number;
  mgnAmt: number;
}

export function computePricing(
  costs: { profCost: number; sheetCost: number; accCost: number; ledCost: number; drvCost: number; printCost: number },
  p: PricingInputs
): PricingResult {
  const raw = (costs.profCost || 0) + (costs.sheetCost || 0) + (costs.accCost || 0) + (costs.ledCost || 0) + (costs.drvCost || 0) + (costs.printCost || 0);
  const ovh = Math.round(raw * (p.overheadPct / 100));
  const costPer = raw + ovh + p.labour + p.install;
  const costAll = costPer * p.qty;
  const sellBD = Math.round(costAll * (1 + p.markupPct / 100));
  const discAmt = Math.round(sellBD * (p.discountPct / 100));
  const sell = sellBD - discAmt;
  const gstAmt = Math.round(sell * (p.gstPct / 100));
  const final = sell + gstAmt;
  const margin = sell > 0 ? Math.round(((sell - costAll) / sell) * 100) : 0;
  const mgnAmt = sell - costAll;
  return { raw, ovh, costPer, costAll, sellBD, discAmt, sell, gstAmt, final, margin, mgnAmt };
}

// ═══════════════════════════════════════════════════════════
//  UNIT CONVERSION + MISC UTILS
// ═══════════════════════════════════════════════════════════
export const toMM = (v: number, unit: "mm" | "feet" | "inches"): number => (unit === "feet" ? v * 304.8 : unit === "inches" ? v * 25.4 : v);
export const fmtRupee = (n: number): string => `₹${Math.round(n).toLocaleString("en-IN")}`;
