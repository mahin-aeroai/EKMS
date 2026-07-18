// Grid-based irregular nesting engine.
//
// True analytic nesting (no-fit-polygon / Minkowski-difference based) is a
// serious computational-geometry undertaking. This engine uses the common
// practical alternative instead: rasterize each piece's real cut-contour
// onto a fine occupancy grid (in mm), then run a bottom-left-fill placement
// heuristic, trying each allowed rotation and keeping whichever gives the
// lowest placement. It genuinely respects each piece's real shape (not just
// its bounding box) but is a heuristic, not an optimal solver — very tight
// interlocking layouts (like puzzle-piece nesting) may leave more waste
// than a commercial NFP-based nester would. Good starting point; can be
// swapped for a true NFP engine later without changing the UI.

import { type Point, polygonBounds, rotatePolygon, translatePolygon, pointInPolygon } from "./geometry";

export interface NestPieceInput {
  pieceId: string;
  label: string;
  outline: Point[]; // mm, the real cut-contour (or rectangle fallback)
  quantity: number;
  allowRotationsDeg: number[]; // e.g. [0, 90, 180, 270]
  // Extra circular areas (e.g. registration dot centers + radius) that must
  // also be reserved during nesting even though they fall outside
  // `outline` itself. `outline` is now always the tight, real cut path
  // (a trim rectangle or an auto-traced silhouette) — it does NOT include
  // the surrounding dot/margin zone, so without this a neighboring piece
  // could get packed into a concave pocket or margin area that visually
  // overlaps this piece's own printed registration dots.
  reserveCircles?: { point: Point; radiusMm: number }[];
}

export interface NestPlacement {
  pieceId: string;
  instanceIndex: number;
  label: string;
  x: number; // mm, translation applied to the (already-rotated) outline
  y: number;
  rotationDeg: number;
  outline: Point[]; // final placed outline in sheet coordinates, mm
}

export interface NestResult {
  sheetWidthMm: number;
  sheetHeightMm: number;
  resolutionMm: number;
  placements: NestPlacement[];
  unplaced: { pieceId: string; label: string; instanceIndex: number }[];
  utilizationPct: number;
}

interface Mask {
  cols: number;
  rows: number;
  data: Uint8Array; // row-major, 1 = occupied
}

/**
 * Rasterizes `outline` (already normalized so nothing is negative) onto a
 * mask of explicit `cols`x`rows`, additionally marking any cell within a
 * reserveCircles entry's radius of its center as occupied. The dimensions
 * are passed in rather than derived from `outline` alone because when
 * reserveCircles extend further than the outline itself (a dot sitting
 * outside a tight/concave shape), the mask needs to be sized to the
 * COMBINED bounds — see the caller in nestPieces().
 */
function rasterize(
  outline: Point[],
  resMm: number,
  dims: { cols: number; rows: number },
  reserveCircles?: { point: Point; radiusMm: number }[]
): Mask {
  const { cols, rows } = dims;
  const data = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * resMm;
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * resMm;
      let occupied = pointInPolygon({ x, y }, outline);
      if (!occupied && reserveCircles) {
        for (const rc of reserveCircles) {
          const dx = x - rc.point.x;
          const dy = y - rc.point.y;
          if (dx * dx + dy * dy <= rc.radiusMm * rc.radiusMm) {
            occupied = true;
            break;
          }
        }
      }
      if (occupied) data[r * cols + c] = 1;
    }
  }
  return { cols, rows, data };
}

/**
 * Dilates a mask by `radiusCells` and PADS the output so the buffer has
 * somewhere to actually spill into. A same-size dilation would clip growth
 * at the piece's own bounding box, silently producing a check mask no wider
 * than the true shape — which would make the spacing gap effectively zero.
 * The returned mask is (cols + 2*radius) x (rows + 2*radius), with the
 * original content offset by (radius, radius) within it.
 */
function dilate(mask: Mask, radiusCells: number): Mask {
  const { cols, rows, data } = mask;
  if (radiusCells <= 0) return mask;

  const outCols = cols + 2 * radiusCells;
  const outRows = rows + 2 * radiusCells;
  const out = new Uint8Array(outCols * outRows);

  const offsets: [number, number][] = [];
  for (let dy = -radiusCells; dy <= radiusCells; dy++) {
    for (let dx = -radiusCells; dx <= radiusCells; dx++) {
      if (dx * dx + dy * dy <= radiusCells * radiusCells) offsets.push([dx, dy]);
    }
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!data[r * cols + c]) continue;
      const baseR = r + radiusCells;
      const baseC = c + radiusCells;
      for (const [dx, dy] of offsets) {
        const rr = baseR + dy, cc = baseC + dx;
        if (rr >= 0 && rr < outRows && cc >= 0 && cc < outCols) out[rr * outCols + cc] = 1;
      }
    }
  }
  return { cols: outCols, rows: outRows, data: out };
}

const MAX_SHEET_CELLS = 4_000_000;

export function nestPieces(opts: {
  sheetWidthMm: number;
  sheetHeightMm: number;
  spacingMm: number;
  resolutionMm: number;
  pieces: NestPieceInput[];
  onProgress?: (msg: string) => void;
}): NestResult {
  const { sheetWidthMm, sheetHeightMm, spacingMm, pieces, onProgress } = opts;

  let resolutionMm = opts.resolutionMm;
  const wantCells = (sheetWidthMm / resolutionMm) * (sheetHeightMm / resolutionMm);
  if (wantCells > MAX_SHEET_CELLS) {
    const scale = Math.sqrt(wantCells / MAX_SHEET_CELLS);
    resolutionMm = resolutionMm * scale;
    onProgress?.(`Sheet is large — auto-coarsened grid resolution to ${resolutionMm.toFixed(2)}mm to keep nesting responsive.`);
  }

  const sheetCols = Math.ceil(sheetWidthMm / resolutionMm);
  const sheetRows = Math.ceil(sheetHeightMm / resolutionMm);
  const sheet = new Uint8Array(sheetCols * sheetRows);
  const dilateRadius = Math.max(0, Math.round(spacingMm / resolutionMm));

  // Expand quantities into individual instances, largest bounding area first
  // (a standard, simple bin-packing heuristic: big pieces are hardest to
  // place, so give them first pick of open space).
  type Instance = {
    pieceId: string;
    label: string;
    outline: Point[];
    allowRotationsDeg: number[];
    reserveCircles: { point: Point; radiusMm: number }[];
    instanceIndex: number;
    area: number;
  };
  const instances: Instance[] = [];
  for (const p of pieces) {
    const b = polygonBounds(p.outline);
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    for (let i = 0; i < p.quantity; i++) {
      instances.push({
        pieceId: p.pieceId,
        label: p.label,
        outline: p.outline,
        allowRotationsDeg: p.allowRotationsDeg.length ? p.allowRotationsDeg : [0],
        reserveCircles: p.reserveCircles ?? [],
        instanceIndex: i,
        area,
      });
    }
  }
  instances.sort((a, b) => b.area - a.area);

  const placements: NestPlacement[] = [];
  const placementReserves: { point: Point; radiusMm: number }[][] = [];
  const unplaced: NestResult["unplaced"] = [];
  let placedArea = 0;

  for (const inst of instances) {
    onProgress?.(`Placing ${inst.label} #${inst.instanceIndex + 1}…`);

    type Candidate = {
      rotationDeg: number;
      normOutline: Point[];
      normReserve: { point: Point; radiusMm: number }[];
      checkMask: Mask;
      trueMask: Mask;
    };
    const candidates: Candidate[] = inst.allowRotationsDeg.map((rot) => {
      const rotated = rotatePolygon(inst.outline, rot);
      const rotatedReserve = inst.reserveCircles.map((rc) => ({
        point: rotatePolygon([rc.point], rot)[0],
        radiusMm: rc.radiusMm,
      }));

      // Combined bounds across the outline AND any reserve circles — a
      // circle can extend further out than the outline itself (a dot
      // sitting outside a tight/concave traced shape), so the mask has to
      // be sized to whichever is larger, not just the outline.
      let b = polygonBounds(rotated);
      for (const rc of rotatedReserve) {
        b = {
          minX: Math.min(b.minX, rc.point.x - rc.radiusMm),
          minY: Math.min(b.minY, rc.point.y - rc.radiusMm),
          maxX: Math.max(b.maxX, rc.point.x + rc.radiusMm),
          maxY: Math.max(b.maxY, rc.point.y + rc.radiusMm),
        };
      }

      const normOutline = translatePolygon(rotated, -b.minX, -b.minY);
      const normReserve = rotatedReserve.map((rc) => ({
        point: { x: rc.point.x - b.minX, y: rc.point.y - b.minY },
        radiusMm: rc.radiusMm,
      }));

      const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / resolutionMm) + 1);
      const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / resolutionMm) + 1);
      const trueMask = rasterize(normOutline, resolutionMm, { cols, rows }, normReserve);
      const checkMask = dilate(trueMask, dilateRadius);
      return { rotationDeg: rot, normOutline, normReserve, checkMask, trueMask };
    });

    let best: { cand: Candidate; gx: number; gy: number } | null = null;

    for (const cand of candidates) {
      const { cols: pc, rows: pr, data: pdata } = cand.checkMask;
      if (pc > sheetCols || pr > sheetRows) continue;
      outer: for (let gy = 0; gy <= sheetRows - pr; gy++) {
        for (let gx = 0; gx <= sheetCols - pc; gx++) {
          let ok = true;
          for (let r = 0; r < pr && ok; r++) {
            const sheetRowBase = (gy + r) * sheetCols + gx;
            const pieceRowBase = r * pc;
            for (let c = 0; c < pc; c++) {
              if (pdata[pieceRowBase + c] && sheet[sheetRowBase + c]) {
                ok = false;
                break;
              }
            }
          }
          if (ok) {
            if (!best || gy < best.gy || (gy === best.gy && gx < best.gx)) {
              best = { cand, gx, gy };
            }
            break outer; // bottom-left fill: first valid spot for this rotation is good enough
          }
        }
      }
    }

    if (!best) {
      unplaced.push({ pieceId: inst.pieceId, label: inst.label, instanceIndex: inst.instanceIndex });
      continue;
    }

    // Stamp the TRUE (undilated) footprint so spacing is only counted once
    // between any two neighboring pieces (the *next* piece's dilated check
    // mask is what enforces the gap, not double-dilation here). The true
    // mask sits at offset (dilateRadius, dilateRadius) inside the padded
    // check mask's coordinate frame, so it stamps at (gx+radius, gy+radius),
    // not (gx, gy) — (gx, gy) is where the padded/expanded mask starts.
    const { cand, gx, gy } = best;
    const trueGx = gx + dilateRadius;
    const trueGy = gy + dilateRadius;
    const { cols: pc, rows: pr, data: pdata } = cand.trueMask;
    for (let r = 0; r < pr; r++) {
      const sheetRowBase = (trueGy + r) * sheetCols + trueGx;
      const pieceRowBase = r * pc;
      for (let c = 0; c < pc; c++) {
        if (pdata[pieceRowBase + c]) sheet[sheetRowBase + c] = 1;
      }
    }

    const xMm = trueGx * resolutionMm;
    const yMm = trueGy * resolutionMm;
    const finalOutline = translatePolygon(cand.normOutline, xMm, yMm);
    const b = polygonBounds(cand.normOutline);
    placedArea += (b.maxX - b.minX) * (b.maxY - b.minY);

    placements.push({
      pieceId: inst.pieceId,
      instanceIndex: inst.instanceIndex,
      label: inst.label,
      x: xMm,
      y: yMm,
      rotationDeg: cand.rotationDeg,
      outline: finalOutline,
    });
    // Final sheet-space reserve-circle positions for this placement, kept
    // in lockstep with `placements` (same index) — needed below so the
    // top/center alignment shift accounts for the dot zone, which extends
    // beyond the tight outline and would otherwise get pushed off-sheet.
    placementReserves.push(
      cand.normReserve.map((rc) => ({ point: { x: rc.point.x + xMm, y: rc.point.y + yMm }, radiusMm: rc.radiusMm }))
    );
  }

  const utilizationPct = (placedArea / (sheetWidthMm * sheetHeightMm)) * 100;

  // The fill algorithm above packs from the bottom-left corner outward,
  // which is a fine way to search for space but an awkward place to leave
  // the result sitting — the operator wants the placed group centered
  // left-to-right on the sheet and flush against the top edge (a
  // consistent reference edge to load material against), not jammed into
  // a corner. This is a pure post-process shift: it doesn't affect which
  // spots were found valid, just where the whole already-packed group sits
  // on the sheet, so it's always safe (the group already fit within the
  // sheet bounds; centering/top-aligning it can't push anything off-sheet).
  //
  // IMPORTANT: the group's bounds must include each placement's reserved
  // dot circles, not just its outline. The outline is now the tight cut
  // path — dots sit beyond it, in the margin reserveCircles carves out
  // (see nestPieces's placement loop above). Computing the shift from the
  // outline alone would flush the CUT PATH to the sheet's top edge while
  // the dots (which extend further out) get pushed past it, off the
  // printable area — exactly the bug this fixes.
  if (placements.length > 0) {
    let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
    for (let i = 0; i < placements.length; i++) {
      const b = polygonBounds(placements[i].outline);
      if (b.minX < gMinX) gMinX = b.minX;
      if (b.minY < gMinY) gMinY = b.minY;
      if (b.maxX > gMaxX) gMaxX = b.maxX;
      if (b.maxY > gMaxY) gMaxY = b.maxY;
      for (const rc of placementReserves[i]) {
        if (rc.point.x - rc.radiusMm < gMinX) gMinX = rc.point.x - rc.radiusMm;
        if (rc.point.y - rc.radiusMm < gMinY) gMinY = rc.point.y - rc.radiusMm;
        if (rc.point.x + rc.radiusMm > gMaxX) gMaxX = rc.point.x + rc.radiusMm;
        if (rc.point.y + rc.radiusMm > gMaxY) gMaxY = rc.point.y + rc.radiusMm;
      }
    }
    const groupWidth = gMaxX - gMinX;
    const shiftX = (sheetWidthMm - groupWidth) / 2 - gMinX;
    const shiftY = sheetHeightMm - gMaxY; // flush to the top edge
    for (const p of placements) {
      p.x += shiftX;
      p.y += shiftY;
      p.outline = translatePolygon(p.outline, shiftX, shiftY);
    }
  }

  return { sheetWidthMm, sheetHeightMm, resolutionMm, placements, unplaced, utilizationPct };
}

/**
 * Searches for the shortest sheet height (at a fixed sheet width — the
 * common case for roll-fed material where width is set by the roll and
 * length is the free variable) that fits every piece instance. Runs the
 * real nester repeatedly (exponential search for an upper bound, then
 * binary search for the minimum), so it's meant for an explicit
 * "Suggest sheet size" action, not something to run on every keystroke.
 */
export function suggestSheetHeight(opts: {
  sheetWidthMm: number;
  spacingMm: number;
  resolutionMm: number;
  pieces: NestPieceInput[];
  maxHeightMm?: number;
}): { heightMm: number; utilizationPct: number } | null {
  const { sheetWidthMm, spacingMm, resolutionMm, pieces } = opts;

  let totalArea = 0;
  let anyQty = false;
  for (const p of pieces) {
    if (p.quantity <= 0) continue;
    anyQty = true;
    const b = polygonBounds(p.outline);
    totalArea += (b.maxX - b.minX) * (b.maxY - b.minY) * p.quantity;
  }
  if (!anyQty || totalArea <= 0) return null;

  const fits = (heightMm: number) => nestPieces({ sheetWidthMm, sheetHeightMm: heightMm, spacingMm, resolutionMm, pieces }).unplaced.length === 0;

  let lo = Math.max(resolutionMm * 2, totalArea / sheetWidthMm); // optimistic (100% utilization) lower bound
  let hi = opts.maxHeightMm ?? Math.max(lo * 2, 100);

  let guard = 0;
  while (!fits(hi) && guard < 10) {
    hi *= 1.6;
    guard++;
  }
  if (!fits(hi)) return null; // pieces likely wider than the sheet even alone — no height will help

  for (let i = 0; i < 12 && hi - lo > resolutionMm; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }

  const finalResult = nestPieces({ sheetWidthMm, sheetHeightMm: hi, spacingMm, resolutionMm, pieces });
  return { heightMm: Math.ceil(hi / 5) * 5, utilizationPct: finalResult.utilizationPct };
}

/**
 * Same idea as suggestSheetHeight, but for a flatbed-style sheet where
 * neither dimension is fixed by a material roll: alternates fixing width
 * and searching for minimal height, then fixing that height and searching
 * for minimal width, a couple of rounds. Not a globally optimal packing —
 * just a practical way to shrink both dimensions toward a tighter sheet
 * than leaving one arbitrarily fixed would.
 */
export function suggestSheetSize(opts: {
  initialWidthMm: number;
  spacingMm: number;
  resolutionMm: number;
  pieces: NestPieceInput[];
}): { widthMm: number; heightMm: number; utilizationPct: number } | null {
  const { spacingMm, resolutionMm, pieces } = opts;

  let totalArea = 0;
  let anyQty = false;
  for (const p of pieces) {
    if (p.quantity <= 0) continue;
    anyQty = true;
    const b = polygonBounds(p.outline);
    totalArea += (b.maxX - b.minX) * (b.maxY - b.minY) * p.quantity;
  }
  if (!anyQty || totalArea <= 0) return null;

  let widthMm = opts.initialWidthMm;
  const heightResult = suggestSheetHeight({ sheetWidthMm: widthMm, spacingMm, resolutionMm, pieces });
  if (!heightResult) return null;
  let heightMm = heightResult.heightMm;

  for (let round = 0; round < 2; round++) {
    const widthResult = suggestSheetHeight({
      // Reuse the same height-search binary search, just with axes swapped:
      // fix the "width" role to the current heightMm and search the other axis.
      sheetWidthMm: heightMm,
      spacingMm,
      resolutionMm,
      pieces: swapXY(pieces),
    });
    if (!widthResult) break;
    widthMm = widthResult.heightMm;

    const nextHeight = suggestSheetHeight({ sheetWidthMm: widthMm, spacingMm, resolutionMm, pieces });
    if (!nextHeight) break;
    heightMm = nextHeight.heightMm;
  }

  const finalResult = nestPieces({ sheetWidthMm: widthMm, sheetHeightMm: heightMm, spacingMm, resolutionMm, pieces });
  return { widthMm, heightMm, utilizationPct: finalResult.utilizationPct };
}

/** Swaps X/Y on every outline + reserve circle, used to reuse the width-searching binary search for the other axis. */
function swapXY(pieces: NestPieceInput[]): NestPieceInput[] {
  const swapPt = (p: Point): Point => ({ x: p.y, y: p.x });
  return pieces.map((p) => ({
    ...p,
    outline: p.outline.map(swapPt),
    reserveCircles: p.reserveCircles?.map((rc) => ({ point: swapPt(rc.point), radiusMm: rc.radiusMm })),
  }));
}
