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

function rasterize(outline: Point[], resMm: number): Mask {
  const b = polygonBounds(outline);
  const cols = Math.max(1, Math.ceil((b.maxX - b.minX) / resMm) + 1);
  const rows = Math.max(1, Math.ceil((b.maxY - b.minY) / resMm) + 1);
  const data = new Uint8Array(cols * rows);
  const norm = translatePolygon(outline, -b.minX, -b.minY);
  for (let r = 0; r < rows; r++) {
    const y = (r + 0.5) * resMm;
    for (let c = 0; c < cols; c++) {
      const x = (c + 0.5) * resMm;
      if (pointInPolygon({ x, y }, norm)) data[r * cols + c] = 1;
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
  type Instance = { pieceId: string; label: string; outline: Point[]; allowRotationsDeg: number[]; instanceIndex: number; area: number };
  const instances: Instance[] = [];
  for (const p of pieces) {
    const b = polygonBounds(p.outline);
    const area = (b.maxX - b.minX) * (b.maxY - b.minY);
    for (let i = 0; i < p.quantity; i++) {
      instances.push({ pieceId: p.pieceId, label: p.label, outline: p.outline, allowRotationsDeg: p.allowRotationsDeg.length ? p.allowRotationsDeg : [0], instanceIndex: i, area });
    }
  }
  instances.sort((a, b) => b.area - a.area);

  const placements: NestPlacement[] = [];
  const unplaced: NestResult["unplaced"] = [];
  let placedArea = 0;

  for (const inst of instances) {
    onProgress?.(`Placing ${inst.label} #${inst.instanceIndex + 1}…`);

    type Candidate = { rotationDeg: number; normOutline: Point[]; checkMask: Mask; trueMask: Mask };
    const candidates: Candidate[] = inst.allowRotationsDeg.map((rot) => {
      const rotated = rotatePolygon(inst.outline, rot);
      const b = polygonBounds(rotated);
      const normOutline = translatePolygon(rotated, -b.minX, -b.minY);
      const trueMask = rasterize(normOutline, resolutionMm);
      const checkMask = dilate(trueMask, dilateRadius);
      return { rotationDeg: rot, normOutline, checkMask, trueMask };
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
  }

  const utilizationPct = (placedArea / (sheetWidthMm * sheetHeightMm)) * 100;

  return { sheetWidthMm, sheetHeightMm, resolutionMm, placements, unplaced, utilizationPct };
}
