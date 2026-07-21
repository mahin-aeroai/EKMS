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
//  CUT OPTIMIZER — Fabrication Planner (two-phase: split, then pack)
//
//  Earlier versions of this rewrite went through two failure modes worth
//  recording, because both came from real shop-floor feedback:
//
//   1. The very first version summed raw member lengths straight into
//      "bins" with no regard for whether a single member was longer than
//      the stock bar -- a bin's `used` could exceed `stockLen`, producing
//      nonsense like 122% utilisation on a 5.0m bar.
//   2. The fix for that greedily spliced ANY member using whatever offcut
//      happened to be sitting in the pool at that moment -- which reused
//      material well, but meant two structurally IDENTICAL members (e.g.
//      both Widths of a frame, which always share one length) could end
//      up cut completely differently (one as 5.00m+1.10m, the other as
//      3.90m+2.19m), including thin, awkward slivers as splice pieces. A
//      real fabricator would never accept that -- it looks improvised,
//      not planned, and a small sliver at a connector joint is a weak
//      joint.
//
//  This version separates the two concerns the shop actually cares about:
//
//   PHASE 1 -- decide WHAT to cut. Every member is looked at by its
//   required length alone. A length that fits on one stock bar is always
//   cut as ONE clean piece, never spliced just to save material. A length
//   that's genuinely longer than the stock bar is split EVENLY into the
//   minimum number of pieces (see evenSplit) -- e.g. 6000mm on 4000mm
//   stock becomes two 3000mm pieces, not a lopsided 4000+2000. Crucially,
//   this pattern is decided ONCE per distinct member length and reused
//   for every member that shares it, so identical members are always cut
//   identically.
//
//   PHASE 2 -- decide WHERE to cut it FROM. The full flat list of pieces
//   from every member (now fixed, atomic lengths) is bin-packed together:
//   before opening a fresh stock bar, check whether an offcut already
//   left over from an earlier piece -- possibly from a completely
//   different member -- is big enough to supply this one instead. This is
//   where "reuse offcuts wherever possible" happens, and it can never
//   distort the split patterns decided in Phase 1, only which physical
//   bar (fresh or reused) ends up supplying each already-decided piece.
//
//  Every stock bar is tracked by everything ever cut from it -- both
//  whatever it was originally opened for AND any later piece that reused
//  its leftover -- so a bar's final `used`/`remaining` always reflects
//  true end-of-job utilisation, and can never exceed the bar's own length
//  by construction (see assertValidBin).
//
//  All of kerf / connector allowance / mitre allowance / minimum reusable
//  offcut are configurable via an options object (all default to the
//  tool's historical values -- kerf 0, connector 0, mitre off -- so
//  existing estimates don't shift unless a caller opts in), and
//  `packMembers`/`packAuto` accept labelled, pooled member lists so
//  multiple signs (or multiple candidate stock lengths) can be optimised
//  together later without changing this module's shape again.
// ═══════════════════════════════════════════════════════════

export interface CutOptimizerOptions {
  /** Saw blade width consumed whenever a bar or offcut is trimmed down to
   *  less than its full available length, in mm. Using a piece in full
   *  (no trimming) costs no kerf. Default 0 (no kerf modelled) --
   *  matches historical behaviour. */
  kerfMM: number;
  /** Extra material consumed at each connector splice -- i.e. every time
   *  a member needs a 2nd+ segment to reach its full length -- in mm.
   *  Default 0. */
  connectorAllowanceMM: number;
  /** An unclaimed offcut only counts as reusable stock (vs. scrap) once
   *  it's at least this long, in mm. Default 300mm. */
  minReusableOffcutMM: number;
  /** Whether every member gets extra length for a 45° mitred corner on
   *  both ends before planning. Default off. */
  mitreEnabled: boolean;
  /** Extra length added per mitred end when mitreEnabled is true, in mm. */
  mitreAllowanceMM: number;
}

const DEFAULT_CUT_OPTIONS: CutOptimizerOptions = {
  kerfMM: 0,
  connectorAllowanceMM: 0,
  minReusableOffcutMM: 300,
  mitreEnabled: false,
  mitreAllowanceMM: 0,
};

export interface CutPiece {
  /** Length of this segment as cut, in mm. */
  length: number;
  /** Which member this segment belongs to, e.g. "Member 1" or
   *  "Member 1 (piece 2/2)" when it's one of several segments spliced
   *  together to build up a member longer than one stock bar. */
  label: string;
  /** True if this segment came from an already-open offcut rather than
   *  fresh stock cut specifically for it. */
  fromOffcut: boolean;
}

export interface CutBin {
  cuts: number[];
  cutDetails: CutPiece[];
  used: number;
  remaining: number;
  utilPct: number;
  isReusable: boolean;
}

export interface MemberAssembly {
  label: string;
  targetLength: number;
  /** Every segment (bar-cuts and/or reused offcuts) spliced together to
   *  build this member, in the order they were joined. */
  segments: { length: number; barNumber: number; fromOffcut: boolean }[];
  connectorsUsed: number;
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

interface BarInternal {
  barNumber: number;
  stockLen: number;
  cuts: CutPiece[];
  usedLength: number;
}

interface OffcutPoolItem {
  id: number;
  length: number;
  bar: BarInternal;
}

/** One "cut" of `takeLength` off a piece that currently has `available`
 *  mm on it. Returns the material actually consumed (takeLength + kerf,
 *  but only if this isn't a full, no-trim use of the piece) and the
 *  length left over afterwards. */
function trim(available: number, takeLength: number, kerfMM: number): { consumed: number; leftover: number } {
  const isFullUse = takeLength >= available - 1e-9;
  const consumed = isFullUse ? available : takeLength + Math.min(kerfMM, Math.max(0, available - takeLength));
  return { consumed, leftover: Math.max(0, available - consumed) };
}

/** Splits ONE oversized member into the minimum number of EQUAL(-ish)
 *  pieces that each fit within maxPieceMM -- e.g. a 6000mm member on
 *  4000mm stock becomes two 3000mm pieces, not a "full bar + small
 *  remainder" (4000+2000, let alone something as lopsided as 4900+1100).
 *  Real fabrication doesn't accept a thin sliver spliced onto the end of
 *  a member -- an even split keeps every piece substantial and every
 *  joint in a sensible, load-bearing position. Pieces may differ by at
 *  most 1mm (integer rounding of the total across n pieces). */
function evenSplit(lengthMM: number, maxPieceMM: number, connectorAllowanceMM: number): number[] {
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

interface PlannedPiece {
  length: number;
  label: string;
  memberIndex: number;
}

/** Runs the fabrication-planner pass described above, in two phases:
 *
 *  Phase 1 -- decide WHAT to cut. Every member with the same required
 *  length (e.g. both Widths of a frame, which always share one length)
 *  gets the exact same split pattern, decided once per distinct length
 *  and reused -- never two different-looking combinations for what's
 *  physically the same member length. Oversized members are split evenly
 *  (see evenSplit), so no piece is ever a small, awkward sliver.
 *
 *  Phase 2 -- decide WHERE to cut it FROM. The full, flat list of pieces
 *  from every member is bin-packed together: before opening a fresh
 *  stock bar, check whether an offcut already sitting around (left over
 *  from an earlier piece, possibly from a completely different member)
 *  is big enough to cut this piece from instead. This is where "reuse
 *  offcuts wherever possible" actually happens -- it never influences
 *  the piece lengths decided in Phase 1, only which physical bar (fresh
 *  or reused) supplies each one.
 */
function planFabrication(
  members: { length: number; label: string }[],
  chooseStockLen: (neededLen: number) => number,
  options: Partial<CutOptimizerOptions> | undefined
): { bars: BarInternal[]; assemblies: MemberAssembly[]; totalConnectors: number } {
  const opts: CutOptimizerOptions = { ...DEFAULT_CUT_OPTIONS, ...options };

  // ---- Phase 1: one canonical piece pattern per distinct member length.
  const patternCache = new Map<number, number[]>();
  const memberPieces: PlannedPiece[][] = members.map((member, memberIndex) => {
    const requiredLength = member.length + (opts.mitreEnabled ? 2 * opts.mitreAllowanceMM : 0);
    const key = Math.round(requiredLength * 100); // robust to float noise, 0.01mm precision
    let pattern = patternCache.get(key);
    if (!pattern) {
      const maxPieceMM = chooseStockLen(requiredLength);
      pattern = evenSplit(requiredLength, maxPieceMM, opts.connectorAllowanceMM);
      patternCache.set(key, pattern);
    }
    return pattern.map((length) => ({ length, label: member.label, memberIndex }));
  });
  const totalConnectors = memberPieces.reduce((s, pieces) => s + Math.max(0, pieces.length - 1), 0);

  // ---- Phase 2: bin-pack every piece from every member, longest first,
  // reusing any offcut already on hand before cutting a fresh bar. Each
  // piece is atomic here -- Phase 1 already decided its exact length, so
  // it's cut from ONE source (an offcut or a fresh bar), never stitched
  // together from several smaller offcuts (that's what produced
  // inconsistent, oddly-sized splices in an earlier version of this).
  const allPieces = memberPieces.flat().sort((a, b) => b.length - a.length);
  const pool: OffcutPoolItem[] = [];
  const bars: BarInternal[] = [];
  const segmentsByMember: MemberAssembly["segments"][] = members.map(() => []);
  let nextBarNumber = 1;
  let nextOffcutId = 1;

  for (const piece of allPieces) {
    // Best-fit: the smallest pooled offcut that's still big enough,
    // so a big reusable offcut isn't burned on a small piece.
    let best: OffcutPoolItem | null = null;
    for (const item of pool) {
      if (item.length + 1e-9 >= piece.length && (!best || item.length < best.length)) best = item;
    }

    if (best) {
      const { consumed, leftover } = trim(best.length, piece.length, opts.kerfMM);
      best.bar.cuts.push({ length: piece.length, label: piece.label, fromOffcut: true });
      best.bar.usedLength += consumed;
      segmentsByMember[piece.memberIndex].push({ length: piece.length, barNumber: best.bar.barNumber, fromOffcut: true });
      if (leftover > 1e-9) {
        best.length = leftover;
      } else {
        pool.splice(pool.indexOf(best), 1);
      }
      continue;
    }

    // Nothing in the pool covers it -- open a fresh stock bar sized for
    // this piece and cut it from there, pooling whatever's left over.
    const stockLen = chooseStockLen(piece.length);
    const bar: BarInternal = { barNumber: nextBarNumber++, stockLen, cuts: [], usedLength: 0 };
    bars.push(bar);
    const { consumed, leftover } = trim(stockLen, piece.length, opts.kerfMM);
    bar.cuts.push({ length: piece.length, label: piece.label, fromOffcut: false });
    bar.usedLength += consumed;
    segmentsByMember[piece.memberIndex].push({ length: piece.length, barNumber: bar.barNumber, fromOffcut: false });
    if (leftover > 1e-9) pool.push({ id: nextOffcutId++, length: leftover, bar });
  }

  const assemblies: MemberAssembly[] = members.map((member, i) => ({
    label: member.label,
    targetLength: member.length,
    segments: segmentsByMember[i],
    connectorsUsed: segmentsByMember[i].length - 1,
  }));

  return { bars, assemblies, totalConnectors };
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

function toCutBins(bars: BarInternal[], opts: CutOptimizerOptions): CutBin[] {
  return bars.map((bar) => {
    const remaining = bar.stockLen - bar.usedLength;
    const bin: CutBin = {
      cuts: bar.cuts.map((c) => c.length),
      cutDetails: bar.cuts,
      used: bar.usedLength,
      remaining,
      utilPct: (bar.usedLength / bar.stockLen) * 100,
      isReusable: remaining >= opts.minReusableOffcutMM,
    };
    assertValidBin(bin, bar.stockLen);
    return bin;
  });
}

function attachExtras<T extends object>(bins: T, totalConnectors: number, assemblies: MemberAssembly[]): T {
  Object.defineProperty(bins, "__totalConnectors", { value: totalConnectors, enumerable: false });
  Object.defineProperty(bins, "__assemblies", { value: assemblies, enumerable: false });
  return bins;
}

export const CutOpt = {
  /** Lower-level entry point: plan an arbitrary, already-labelled list of
   *  members (e.g. pooled from several signs) against ONE stock length.
   *  `pack()` below is a thin wrapper over this for the existing
   *  single-sign call sites. */
  packMembers(members: { length: number; label: string }[], stockLen: number, options?: Partial<CutOptimizerOptions>): CutBin[] {
    if (stockLen <= 0) throw new Error(`Cut optimizer: stock length must be positive, got ${stockLen}`);
    const opts: CutOptimizerOptions = { ...DEFAULT_CUT_OPTIONS, ...options };
    const { bars, assemblies, totalConnectors } = planFabrication(members, () => stockLen, options);
    const bins = toCutBins(bars, opts);
    return attachExtras(bins, totalConnectors, assemblies);
  },

  /** Backward-compatible entry point -- takes a flat array of raw member
   *  lengths (mm), the same shape every caller has always passed (e.g.
   *  `[wMM, wMM, hMM, hMM]` for one sign's frame). */
  pack(cuts: number[], stockLen: number, options?: Partial<CutOptimizerOptions>): CutBin[] {
    const members = cuts.map((length, i) => ({ length, label: `Member ${i + 1}` }));
    return CutOpt.packMembers(members, stockLen, options);
  },

  /** Same idea as packMembers(), but tries every stock length in
   *  `stockLengths` for each new bar and opens whichever candidate is the
   *  smallest one that still covers what's needed at that moment (or the
   *  largest candidate, if the remainder needs more splicing regardless)
   *  -- e.g. a yard stocking 4m/5m/6m bar can minimise scrap instead of
   *  being locked to one length. */
  packAuto(members: { length: number; label: string }[], stockLengths: number[], options?: Partial<CutOptimizerOptions>): CutBin[] {
    if (stockLengths.length === 0) throw new Error("packAuto requires at least one stock length");
    const opts: CutOptimizerOptions = { ...DEFAULT_CUT_OPTIONS, ...options };
    const sortedLengths = [...stockLengths].sort((a, b) => a - b);
    const maxAvailable = sortedLengths[sortedLengths.length - 1];
    const chooseStockLen = (neededLen: number) => sortedLengths.find((len) => len >= neededLen) ?? maxAvailable;
    const { bars, assemblies, totalConnectors } = planFabrication(members, chooseStockLen, options);
    const bins = toCutBins(bars, opts);
    return attachExtras(bins, totalConnectors, assemblies);
  },

  /** Per-member breakdown of how it was assembled (which bar/offcut each
   *  segment came from, and how many connectors it needed) -- attached to
   *  whatever `pack()`/`packMembers()`/`packAuto()` last returned. Reads
   *  the same hidden channel `analyse()` uses for totalConnectors, kept
   *  as a separate accessor so today's callers (which only look at
   *  `bins`/`analysis`) are unaffected. */
  assembliesOf(bins: CutBin[]): MemberAssembly[] {
    return (bins as CutBin[] & { __assemblies?: MemberAssembly[] }).__assemblies ?? [];
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
