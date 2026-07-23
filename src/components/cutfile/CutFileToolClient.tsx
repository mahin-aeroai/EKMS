"use client";

import { useRef, useState } from "react";
import { Scissors, Upload, Download, Trash2, RefreshCw, FilePlus2, Wand2, Ruler } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Notifications";
import { DotCanvas } from "@/components/cutfile/DotCanvas";
import { OutlineCanvas } from "@/components/cutfile/OutlineCanvas";
import { NestPreview } from "@/components/cutfile/NestPreview";
import { computeDotLayout, polygonBounds, rectPolygon, translatePolygon, type DotSpec, type Point } from "@/lib/cutfile/geometry";
import { loadPdf, buildDotPlacementPdf, buildNestedPrintPdf, buildNestedCutPdf, downloadBlob, type RgbColor, type AddedBleedRect, type OverallDots } from "@/lib/cutfile/pdfIO";
import { traceOutlineFromPdf, sampleEdgeColorFromDataUrl } from "@/lib/cutfile/trace";
import { nestPieces, suggestSheetHeight, suggestSheetSize, type NestResult } from "@/lib/cutfile/nesting";

interface DotParams {
  bleedMm: number;
  // When true (default), the uploaded PDF is assumed to already include its
  // own bleed — bleedMm is purely a reference value for the trim line. When
  // false, the tool GENERATES bleed by extending the canvas beyond the
  // file's own edge by bleedMm on every side (e.g. the 12-14mm allowance
  // needed to stitch a silicone keder onto SEG fabric edges) and fills that
  // extra band with a sampled edge color.
  bleedAlreadyInFile: boolean;
  dotDiameterMm: number;
  dotHaloMm: number;
  haloClearanceMm: number;
  marginMm: number;
  topCount: number;
  bottomCount: number;
  leftCount: number;
  rightCount: number;
}

const DEFAULT_DOT_PARAMS: DotParams = {
  bleedMm: 14,
  bleedAlreadyInFile: true,
  dotDiameterMm: 6,
  dotHaloMm: 2,
  haloClearanceMm: 2,
  marginMm: 4,
  topCount: 3,
  bottomCount: 3,
  leftCount: 2,
  rightCount: 2,
};

const DEFAULT_SHEET = { widthMm: 3000, heightMm: 1500, spacingMm: 5, resolutionMm: 2 };

interface UploadedPiece {
  id: string;
  fileName: string;
  bytes: ArrayBuffer;
  // Raw uploaded PDF page size, untouched.
  widthMm: number;
  heightMm: number;
  previewDataUrl: string;
  dotParams: DotParams;
  dots: DotSpec[];
  canvasWidthMm: number;
  canvasHeightMm: number;
  // Offset of the EFFECTIVE content (trim + any tool-generated bleed) from
  // the canvas edge. Equal to pdfOffsetMm when bleedAlreadyInFile is true.
  contentOffsetMm: number;
  // Effective content size used for layout/outline purposes: same as
  // widthMm/heightMm when bleedAlreadyInFile is true, or widthMm/heightMm
  // expanded by 2*bleedMm when the tool is generating the bleed itself.
  effectiveWidthMm: number;
  effectiveHeightMm: number;
  // Offset of the RAW uploaded PDF page from the canvas edge — where the
  // page actually gets drawn on export. Equal to contentOffsetMm unless
  // bleed is being generated, in which case it sits bleedMm further in.
  pdfOffsetMm: number;
  // Sampled edge color used to fill the generated-bleed band, when
  // bleedAlreadyInFile is false. Null until sampling completes (or if
  // bleed isn't being generated at all).
  addedBleedColorRgb: RgbColor | null;
  // The cut-contour used for BOTH nesting placement and the exported cut
  // path. Defaults to a rectangle matching the full output canvas (design
  // + bleed + dot zone + margin) — nesting must respect that whole area,
  // not just the bare design — and stays in sync with that rectangle as
  // layout parameters change, until the operator manually reshapes it.
  outline: Point[];
  outlineIsDefault: boolean;
  // Set when the outline came from auto-trace: the shape's own sampled fill
  // color, used to paint a color-bleed stroke straddling the cut path on
  // export so minor cutter misalignment doesn't expose bare background.
  traceFillColorRgb: RgbColor | null;
  colorBleedMm: number;
  quantity: number;
  rotations: number[];
}

const DEFAULT_COLOR_BLEED_MM = 1.5;

/** The content rectangle actually used for layout: the raw page as-is, or that page expanded by the generated bleed on every side. */
function effectiveContentDims(widthMm: number, heightMm: number, params: DotParams): { width: number; height: number } {
  if (params.bleedAlreadyInFile) return { width: widthMm, height: heightMm };
  return { width: widthMm + 2 * params.bleedMm, height: heightMm + 2 * params.bleedMm };
}

/**
 * Default cut path for a piece that hasn't been manually reshaped or
 * auto-traced.
 *
 * When bleedAlreadyInFile is true: the TRIM rectangle — the design's
 * content inset by its own declared bleed, i.e. where the material
 * actually gets cut, matching the dashed amber reference line drawn in
 * DotCanvas. This is NOT the full canvas rectangle (which also spans the
 * dot zone + margin) — using the full canvas as the exported cut path was
 * the bug behind the cut line landing on the outer dot-zone edge instead
 * of the real trim edge.
 *
 * When bleedAlreadyInFile is false: the FULL effective content rectangle
 * (design + the tool-generated bleed band) with no further inset — the
 * generated bleed is real material meant to be kept (e.g. for a silicone
 * keder seam allowance), not trimmed away.
 *
 * Nesting still reserves the dot-zone space separately via reserveCircles
 * (see runNesting/suggestBestSheetSize) so this tight outline is safe to
 * use for both collision and the exported cut path.
 */
function defaultCutOutline(effWidthMm: number, effHeightMm: number, contentOffsetMm: number, params: DotParams): Point[] {
  const insetMm = params.bleedAlreadyInFile ? params.bleedMm : 0;
  const w = Math.max(0, effWidthMm - 2 * insetMm);
  const h = Math.max(0, effHeightMm - 2 * insetMm);
  const off = contentOffsetMm + insetMm;
  return translatePolygon(rectPolygon(w, h), off, off);
}

/** Registration dot centers + their printed radius (dot + halo), as nesting reserveCircles — see nesting.ts for why the tight cut-path outline alone isn't enough. */
function dotReserveCircles(piece: UploadedPiece): { point: Point; radiusMm: number }[] {
  const radiusMm = piece.dotParams.dotDiameterMm / 2 + piece.dotParams.dotHaloMm;
  return piece.dots.map((d) => ({ point: { x: d.x, y: d.y }, radiusMm }));
}

function recomputeLayout(widthMm: number, heightMm: number, params: DotParams) {
  const eff = effectiveContentDims(widthMm, heightMm, params);
  const layout = computeDotLayout({
    trimWidthMm: eff.width,
    trimHeightMm: eff.height,
    bleedMm: params.bleedMm,
    dotDiameterMm: params.dotDiameterMm,
    dotHaloMm: params.dotHaloMm,
    haloClearanceMm: params.haloClearanceMm,
    marginMm: params.marginMm,
    topCount: params.topCount,
    bottomCount: params.bottomCount,
    leftCount: params.leftCount,
    rightCount: params.rightCount,
  });
  // Where the RAW uploaded page gets drawn: same as the effective content
  // offset unless the tool is generating bleed, in which case the raw page
  // sits bleedMm further inside the effective content rectangle.
  const pdfOffsetMm = layout.contentOffsetMm + (params.bleedAlreadyInFile ? 0 : params.bleedMm);
  return {
    ...layout,
    effectiveWidthMm: eff.width,
    effectiveHeightMm: eff.height,
    pdfOffsetMm,
  };
}

/** Settings for the "Overall Layout" dot ring — same shape as a piece's
 *  DotParams minus the two bleed fields, which are meaningless for a ring
 *  drawn around a whole nested group rather than one design. Kept as its
 *  own independent state (not shared with any piece's dotParams) so tuning
 *  it never affects, or gets affected by, an individual piece's own dots. */
interface RingDotParams {
  dotDiameterMm: number;
  dotHaloMm: number;
  haloClearanceMm: number;
  marginMm: number;
  topCount: number;
  bottomCount: number;
  leftCount: number;
  rightCount: number;
}

const DEFAULT_RING_DOT_PARAMS: RingDotParams = {
  dotDiameterMm: 6,
  dotHaloMm: 2,
  haloClearanceMm: 4,
  marginMm: 6,
  topCount: 4,
  bottomCount: 4,
  leftCount: 3,
  rightCount: 3,
};

/**
 * Computes ONE ring of registration dots around the combined bounding box
 * of every placement in a completed nest — the "Overall Layout" dot mode's
 * core geometry. Reuses computeDotLayout() (the same function that lays out
 * a ring around a single piece's content) by treating the whole placed
 * group as if it were "the content": the group's bounding box becomes
 * trimWidthMm/trimHeightMm, and the dots that come back (in a canvas-local
 * frame starting at 0,0) get shifted so that local content rectangle lands
 * exactly on the group's real position in sheet coordinates. Returns null
 * if nothing has been placed yet.
 */
function computeOverallDots(
  result: NestResult,
  params: RingDotParams
): { dots: DotSpec[]; ringMinX: number; ringMinY: number; ringMaxX: number; ringMaxY: number } | null {
  if (result.placements.length === 0) return null;
  let gMinX = Infinity, gMinY = Infinity, gMaxX = -Infinity, gMaxY = -Infinity;
  for (const p of result.placements) {
    const b = polygonBounds(p.outline);
    if (b.minX < gMinX) gMinX = b.minX;
    if (b.minY < gMinY) gMinY = b.minY;
    if (b.maxX > gMaxX) gMaxX = b.maxX;
    if (b.maxY > gMaxY) gMaxY = b.maxY;
  }
  const layout = computeDotLayout({
    trimWidthMm: gMaxX - gMinX,
    trimHeightMm: gMaxY - gMinY,
    bleedMm: 0,
    dotDiameterMm: params.dotDiameterMm,
    dotHaloMm: params.dotHaloMm,
    haloClearanceMm: params.haloClearanceMm,
    marginMm: params.marginMm,
    topCount: params.topCount,
    bottomCount: params.bottomCount,
    leftCount: params.leftCount,
    rightCount: params.rightCount,
  });
  // Shift from the ring's own canvas-local frame into sheet coordinates, so
  // its "content" rectangle (where computeDotLayout assumed the design
  // sits) lines up with the group's actual bounds on the sheet.
  const shiftX = gMinX - layout.contentOffsetMm;
  const shiftY = gMinY - layout.contentOffsetMm;
  return {
    dots: layout.dots.map((d) => ({ ...d, x: d.x + shiftX, y: d.y + shiftY })),
    ringMinX: shiftX,
    ringMinY: shiftY,
    ringMaxX: shiftX + layout.canvasWidthMm,
    ringMaxY: shiftY + layout.canvasHeightMm,
  };
}

export default function CutFileToolClient() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<UploadedPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sheetWidthMm, setSheetWidthMm] = useState(DEFAULT_SHEET.widthMm);
  const [sheetHeightMm, setSheetHeightMm] = useState(DEFAULT_SHEET.heightMm);
  const [spacingMm, setSpacingMm] = useState(DEFAULT_SHEET.spacingMm);
  const [resolutionMm, setResolutionMm] = useState(DEFAULT_SHEET.resolutionMm);
  const [nesting, setNesting] = useState(false);
  const [nestStatus, setNestStatus] = useState<string | null>(null);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);
  // Frozen snapshot of each piece's artwork/outline/dots, captured at the
  // exact moment nesting ran — see runNesting(). Exports read from THIS,
  // never from live `pieces`, so a piece edited after nesting (auto-trace
  // re-run, dot params recomputed, outline reshaped) can't silently
  // desync the print/cut files from the layout that was actually packed.
  // Before this fix, exportPrintPdf/exportCutPdf rebuilt sources from
  // current `pieces` state on every export click — if ANY piece's outline
  // had changed since Run Nesting was last clicked, the placement
  // transform (derived from the outline nesting actually used) would be
  // computed against a DIFFERENT outline than what's now stored on the
  // piece, throwing the recovered rotate+translate off by an arbitrary
  // amount — large enough to visibly overlap a neighboring piece, not
  // just a fine boundary-precision issue.
  const [nestSources, setNestSources] = useState<Parameters<typeof buildNestedPrintPdf>[0]["sources"] | null>(null);
  // True once any piece has been added/edited/removed after the current
  // nestResult was computed — the export buttons stay usable (still export
  // the last good, internally-consistent snapshot) but a banner warns the
  // operator that what's about to download no longer reflects the pieces
  // panel, so they know to click Run Nesting again first.
  const [nestStale, setNestStale] = useState(false);

  function markNestStale() {
    setNestStale((cur) => (nestResult ? true : cur));
  }
  const [suggestingSheet, setSuggestingSheet] = useState(false);
  const [optimizeWidthToo, setOptimizeWidthToo] = useState(false);
  const [tracingId, setTracingId] = useState<string | null>(null);

  // Registration-dot placement for the NESTED exports only (the standalone
  // per-piece "Export PDF" button in the Bleed & Cut Dots tab always uses
  // that piece's own dots — there's no "overall layout" without a nest).
  // "perPiece" (default) matches existing behavior: every placed copy keeps
  // its own ring. "overall" draws one ring around the whole nested group
  // instead, using the independent ringParams below.
  const [dotMode, setDotMode] = useState<"perPiece" | "overall">("perPiece");
  const [ringParams, setRingParams] = useState<RingDotParams>({ ...DEFAULT_RING_DOT_PARAMS });

  const selected = pieces.find((p) => p.id === selectedId) ?? null;
  const overallDotsInfo = dotMode === "overall" && nestResult ? computeOverallDots(nestResult, ringParams) : null;
  const ringOverflowsSheet =
    !!overallDotsInfo &&
    !!nestResult &&
    (overallDotsInfo.ringMinX < -1e-6 ||
      overallDotsInfo.ringMinY < -1e-6 ||
      overallDotsInfo.ringMaxX > nestResult.sheetWidthMm + 1e-6 ||
      overallDotsInfo.ringMaxY > nestResult.sheetHeightMm + 1e-6);

  function updatePiece(id: string, patch: Partial<UploadedPiece>) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    markNestStale();
  }

  function startNewJob() {
    setPieces([]);
    setSelectedId(null);
    setNestResult(null);
    setNestSources(null);
    setNestStale(false);
    setNestStatus(null);
    setSheetWidthMm(DEFAULT_SHEET.widthMm);
    setSheetHeightMm(DEFAULT_SHEET.heightMm);
    setSpacingMm(DEFAULT_SHEET.spacingMm);
    setResolutionMm(DEFAULT_SHEET.resolutionMm);
    if (fileInputRef.current) fileInputRef.current.value = "";
    toast("success", "Cleared — ready for the next job");
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setLoading(true);
    try {
      for (const file of Array.from(files)) {
        if (file.type !== "application/pdf") {
          toast("warning", `${file.name} isn't a PDF — skipped`);
          continue;
        }
        const loaded = await loadPdf(file);
        const dotParams = { ...DEFAULT_DOT_PARAMS };
        const layout = recomputeLayout(loaded.widthMm, loaded.heightMm, dotParams);
        const id = crypto.randomUUID();
        const piece: UploadedPiece = {
          id,
          fileName: file.name,
          bytes: loaded.bytes,
          widthMm: loaded.widthMm,
          heightMm: loaded.heightMm,
          previewDataUrl: loaded.previewDataUrl,
          dotParams,
          dots: layout.dots,
          canvasWidthMm: layout.canvasWidthMm,
          canvasHeightMm: layout.canvasHeightMm,
          contentOffsetMm: layout.contentOffsetMm,
          effectiveWidthMm: layout.effectiveWidthMm,
          effectiveHeightMm: layout.effectiveHeightMm,
          pdfOffsetMm: layout.pdfOffsetMm,
          addedBleedColorRgb: null,
          outline: defaultCutOutline(layout.effectiveWidthMm, layout.effectiveHeightMm, layout.contentOffsetMm, dotParams),
          outlineIsDefault: true,
          traceFillColorRgb: null,
          colorBleedMm: DEFAULT_COLOR_BLEED_MM,
          quantity: 1,
          rotations: [0, 90, 180, 270],
        };
        setPieces((prev) => [...prev, piece]);
        setSelectedId((cur) => cur ?? id);
        markNestStale();
        if (!dotParams.bleedAlreadyInFile) {
          sampleEdgeColorFromDataUrl(loaded.previewDataUrl).then((rgb) => {
            if (rgb) updatePiece(id, { addedBleedColorRgb: rgb });
          });
        }
      }
      toast("success", "File(s) loaded — all processing stays in your browser, nothing is uploaded.");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Couldn't read that PDF");
    } finally {
      setLoading(false);
    }
  }

  function removePiece(id: string) {
    setPieces((prev) => prev.filter((p) => p.id !== id));
    if (selectedId === id) setSelectedId(null);
    markNestStale();
  }

  function recomputeDots(piece: UploadedPiece) {
    const layout = recomputeLayout(piece.widthMm, piece.heightMm, piece.dotParams);
    updatePiece(piece.id, {
      dots: layout.dots,
      canvasWidthMm: layout.canvasWidthMm,
      canvasHeightMm: layout.canvasHeightMm,
      contentOffsetMm: layout.contentOffsetMm,
      effectiveWidthMm: layout.effectiveWidthMm,
      effectiveHeightMm: layout.effectiveHeightMm,
      pdfOffsetMm: layout.pdfOffsetMm,
      // Keep the default cut-path outline (used for the cut path, plus
      // nesting collision together with reserveCircles) matched to the
      // new layout, unless the operator has manually reshaped it — a
      // manual edit should survive a parameter tweak rather than getting
      // silently overwritten.
      outline: piece.outlineIsDefault
        ? defaultCutOutline(layout.effectiveWidthMm, layout.effectiveHeightMm, layout.contentOffsetMm, piece.dotParams)
        : piece.outline,
    });
    if (!piece.dotParams.bleedAlreadyInFile) {
      sampleEdgeColorFromDataUrl(piece.previewDataUrl).then((rgb) => {
        if (rgb) updatePiece(piece.id, { addedBleedColorRgb: rgb });
      });
    } else if (piece.addedBleedColorRgb) {
      updatePiece(piece.id, { addedBleedColorRgb: null });
    }
  }

  /** Canvas-local fill rect for the tool-generated bleed band, or undefined when bleed is already baked into the file (or the color hasn't been sampled yet). */
  function addedBleedRectFor(piece: UploadedPiece): AddedBleedRect | undefined {
    if (piece.dotParams.bleedAlreadyInFile || !piece.addedBleedColorRgb) return undefined;
    return {
      x: piece.contentOffsetMm,
      y: piece.contentOffsetMm,
      width: piece.effectiveWidthMm,
      height: piece.effectiveHeightMm,
      colorRgb: piece.addedBleedColorRgb,
    };
  }

  async function exportDotPdf(piece: UploadedPiece) {
    try {
      const blob = await buildDotPlacementPdf({
        originalBytes: piece.bytes,
        canvasWidthMm: piece.canvasWidthMm,
        canvasHeightMm: piece.canvasHeightMm,
        contentOffsetMm: piece.pdfOffsetMm,
        dots: piece.dots,
        dotDiameterMm: piece.dotParams.dotDiameterMm,
        dotHaloMm: piece.dotParams.dotHaloMm,
        outline: piece.outline,
        bleedColorRgb: piece.traceFillColorRgb ?? undefined,
        colorBleedMm: piece.colorBleedMm,
        addedBleedRect: addedBleedRectFor(piece),
      });
      downloadBlob(blob, piece.fileName.replace(/\.pdf$/i, "") + "_bleed_dots.pdf");
      toast("success", "Exported — download started");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Export failed");
    }
  }

  async function runNesting() {
    if (pieces.length === 0) {
      toast("warning", "Upload at least one piece first");
      return;
    }
    setNesting(true);
    setNestStatus("Starting…");
    setNestResult(null);
    setNestSources(null);
    // Let the UI paint the loading state before the (synchronous, possibly
    // slow) grid nesting computation runs.
    await new Promise((r) => setTimeout(r, 30));
    try {
      const result = nestPieces({
        sheetWidthMm,
        sheetHeightMm,
        spacingMm,
        resolutionMm,
        pieces: pieces.map((p) => ({
          pieceId: p.id,
          label: p.fileName,
          outline: p.outline,
          quantity: p.quantity,
          allowRotationsDeg: p.rotations,
          // In "Overall Layout" mode no per-piece dot ring gets drawn, so
          // there's nothing to keep clear around each individual piece —
          // reserving that space anyway only wastes sheet area and, worse,
          // makes identical pieces land at slightly different offsets
          // (the bottom-left-fill scan finds the first gap AROUND each
          // piece's dot bumps, not a clean rectangle, so same-size pieces
          // can end up a few mm off from each other instead of lining up).
          reserveCircles: dotMode === "perPiece" ? dotReserveCircles(p) : [],
        })),
        onProgress: (msg) => setNestStatus(msg),
      });
      setNestResult(result);
      // Freeze the exact piece data nesting just used — see the nestSources
      // comment above for why exports must read from this snapshot, not
      // live `pieces`, which could drift before the operator clicks export.
      setNestSources(nestedSources());
      setNestStale(false);
      if (result.unplaced.length > 0) {
        toast("warning", `${result.unplaced.length} piece instance(s) didn't fit on the sheet`);
      } else {
        toast("success", "Nesting complete");
      }
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Nesting failed");
    } finally {
      setNesting(false);
      setNestStatus(null);
    }
  }

  function nestedSources(): Parameters<typeof buildNestedPrintPdf>[0]["sources"] {
    return pieces.map((p) => ({
      pieceId: p.id,
      bytes: p.bytes,
      outline: p.outline,
      contentOffsetMm: { x: p.pdfOffsetMm, y: p.pdfOffsetMm },
      dots: p.dots,
      dotDiameterMm: p.dotParams.dotDiameterMm,
      dotHaloMm: p.dotParams.dotHaloMm,
      bleedColorRgb: p.traceFillColorRgb ?? undefined,
      colorBleedMm: p.colorBleedMm,
      addedBleedRect: addedBleedRectFor(p),
    }));
  }

  /** Built fresh at export time (not memoized in state) so it always
   *  reflects the CURRENT ringParams/dotMode, same as everything else these
   *  export functions read live except the frozen nestSources snapshot. */
  function overallDotsForExport(): OverallDots | null {
    if (dotMode !== "overall" || !nestResult) return null;
    const info = computeOverallDots(nestResult, ringParams);
    if (!info) return null;
    return { dots: info.dots, dotDiameterMm: ringParams.dotDiameterMm, dotHaloMm: ringParams.dotHaloMm };
  }

  async function exportPrintPdf() {
    if (!nestResult || !nestSources) return;
    try {
      const blob = await buildNestedPrintPdf({
        sheetWidthMm: nestResult.sheetWidthMm,
        sheetHeightMm: nestResult.sheetHeightMm,
        placements: nestResult.placements,
        sources: nestSources,
        overallDots: overallDotsForExport(),
      });
      downloadBlob(blob, "nested_sheet_PRINT.pdf");
      toast("success", "Print file exported — download started");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Export failed");
    }
  }

  async function exportCutPdf() {
    if (!nestResult || !nestSources) return;
    try {
      const blob = await buildNestedCutPdf({
        sheetWidthMm: nestResult.sheetWidthMm,
        sheetHeightMm: nestResult.sheetHeightMm,
        placements: nestResult.placements,
        sources: nestSources,
        overallDots: overallDotsForExport(),
      });
      downloadBlob(blob, "nested_sheet_CUT.pdf");
      toast("success", "Cut file exported — download started");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Export failed");
    }
  }

  async function suggestBestSheetSize() {
    if (pieces.length === 0) {
      toast("warning", "Upload at least one piece first");
      return;
    }
    setSuggestingSheet(true);
    await new Promise((r) => setTimeout(r, 20));
    try {
      const nestPieceInputs = pieces.map((p) => ({
        pieceId: p.id,
        label: p.fileName,
        outline: p.outline,
        quantity: p.quantity,
        allowRotationsDeg: p.rotations,
        // Same reasoning as runNesting() above — keep this in sync with it.
        reserveCircles: dotMode === "perPiece" ? dotReserveCircles(p) : [],
      }));

      if (optimizeWidthToo) {
        const suggestion = suggestSheetSize({ initialWidthMm: sheetWidthMm, spacingMm, resolutionMm, pieces: nestPieceInputs });
        if (!suggestion) {
          toast("warning", "Couldn't find a fitting size — check quantities and rotations allowed");
          return;
        }
        setSheetWidthMm(suggestion.widthMm);
        setSheetHeightMm(suggestion.heightMm);
        toast(
          "success",
          `Suggested sheet: ${suggestion.widthMm.toFixed(0)} × ${suggestion.heightMm.toFixed(0)} mm (~${suggestion.utilizationPct.toFixed(0)}% utilization) — applied, run nesting again`
        );
      } else {
        const suggestion = suggestSheetHeight({ sheetWidthMm, spacingMm, resolutionMm, pieces: nestPieceInputs });
        if (!suggestion) {
          toast("warning", "Couldn't find a fitting size — check quantities and rotations allowed");
          return;
        }
        setSheetHeightMm(suggestion.heightMm);
        toast(
          "success",
          `Suggested sheet: ${sheetWidthMm.toFixed(0)} × ${suggestion.heightMm.toFixed(0)} mm (~${suggestion.utilizationPct.toFixed(0)}% utilization) — height applied, run nesting again`
        );
      }
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Couldn't compute a suggestion");
    } finally {
      setSuggestingSheet(false);
    }
  }

  async function autoTraceOutline(piece: UploadedPiece) {
    setTracingId(piece.id);
    try {
      const result = await traceOutlineFromPdf(piece.bytes, {
        contentWidthMm: piece.widthMm,
        contentHeightMm: piece.heightMm,
      });
      if (result.method === "none" || result.outline.length < 3) {
        toast(
          "warning",
          "Couldn't find a distinct shape to trace — no transparency, and no clear color break from the corners (a solid page, gradient, or photo). Reshape the outline by hand below instead."
        );
        return;
      }
      // The traced outline is in content-local mm (bottom-left origin at
      // the RAW uploaded page's own corner, since that's what trace reads)
      // — shift it into the piece's canvas-local frame the same way that
      // raw page itself sits there, via pdfOffsetMm (not contentOffsetMm,
      // which is the effective trim+generated-bleed offset and can differ
      // from where the raw page is actually drawn).
      const shifted = result.outline.map((pt) => ({ x: pt.x + piece.pdfOffsetMm, y: pt.y + piece.pdfOffsetMm }));
      updatePiece(piece.id, {
        outline: shifted,
        outlineIsDefault: false,
        traceFillColorRgb: result.fillColorRgb ?? null,
      });
      const via = result.method === "alpha" ? "the page's transparency" : "a color match against its background";
      toast(
        "success",
        `Traced ${shifted.length}-point outline from the artwork using ${via}. It's tight to the shape — dots/margin sit outside it, so increase nesting spacing. A color-bleed stroke (set below) will paint over the cut edge in the print export so a slightly off cut still shows the design's own color.`
      );
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Auto-trace failed");
    } finally {
      setTracingId(null);
    }
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "Cut File Tool" }]} />

      <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Scissors size={22} />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-ink">Cut File Tool</h1>
              <Badge status="info">Runs locally in your browser</Badge>
            </div>
            <p className="mt-0.5 text-sm text-ink-secondary">
              Bleed + cut-dot placement and material nesting. Files are processed entirely on this device — nothing is uploaded to Supabase or any server.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {pieces.length > 0 && (
            <Button variant="secondary" onClick={startNewJob}>
              <FilePlus2 size={14} className="mr-1.5" /> New Job
            </Button>
          )}
          <Button onClick={() => fileInputRef.current?.click()} loading={loading}>
            <Upload size={14} className="mr-1.5" /> Upload PDF(s)
          </Button>
        </div>
      </div>

      {pieces.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-line-strong bg-surface p-10 text-center text-sm text-ink-muted">
          Upload one or more PDFs to get started. Large, high-resolution files are fine — only a low-res preview is
          rendered on screen; exports re-embed your original full-resolution page content.
        </div>
      ) : (
        <div className="mt-6">
          <Tabs
            defaultId="dots"
            items={[
              {
                id: "dots",
                label: "Bleed & Cut Dots",
                content: (
                  <div className="flex flex-col gap-4 pt-5 lg:flex-row">
                    <div className="w-full shrink-0 lg:w-64">
                      <div className="rounded-lg border border-line bg-surface p-3">
                        <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">Pieces</h3>
                        <p className="mb-2 text-xs text-ink-muted">
                          Qty = how many copies of that PDF to place when nesting — bump it up instead of re-uploading
                          the same file.
                        </p>
                        <div className="flex flex-col gap-1">
                          {pieces.map((p) => (
                            <div
                              key={p.id}
                              onClick={() => setSelectedId(p.id)}
                              className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${
                                selectedId === p.id ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-sunken"
                              }`}
                            >
                              <span className="min-w-0 flex-1 truncate">{p.fileName}</span>
                              <input
                                type="number"
                                min={0}
                                value={p.quantity}
                                onClick={(e) => e.stopPropagation()}
                                onChange={(e) => updatePiece(p.id, { quantity: Number(e.target.value) || 0 })}
                                title="Copies to nest"
                                className={`w-14 shrink-0 rounded border px-1.5 py-0.5 text-right text-xs outline-none ${
                                  selectedId === p.id
                                    ? "border-on-brand/40 bg-white/10 text-on-brand"
                                    : "border-line-strong bg-surface text-ink"
                                }`}
                              />
                              <Trash2
                                size={13}
                                className="shrink-0 opacity-60 hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePiece(p.id);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>

                      {selected && (
                        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Layout parameters</h3>
                          <p className="text-xs text-ink-secondary">
                            Trim size detected: {selected.widthMm.toFixed(1)} × {selected.heightMm.toFixed(1)} mm
                          </p>
                          <label className="flex items-center gap-2 text-xs text-ink-secondary">
                            <input
                              type="checkbox"
                              checked={selected.dotParams.bleedAlreadyInFile}
                              onChange={(e) =>
                                updatePiece(selected.id, { dotParams: { ...selected.dotParams, bleedAlreadyInFile: e.target.checked } })
                              }
                            />
                            File already includes bleed
                          </label>
                          <NumberField
                            label={
                              selected.dotParams.bleedAlreadyInFile
                                ? "Bleed already in file (mm, reference only)"
                                : "Add bleed beyond print size (mm) — e.g. silicone keder allowance"
                            }
                            value={selected.dotParams.bleedMm}
                            onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, bleedMm: v } })}
                          />
                          {!selected.dotParams.bleedAlreadyInFile && (
                            <div className="flex items-center gap-2 rounded-md bg-surface-sunken p-2">
                              <span
                                className="h-5 w-5 shrink-0 rounded border border-line-strong"
                                style={
                                  selected.addedBleedColorRgb
                                    ? {
                                        backgroundColor: `rgb(${Math.round(selected.addedBleedColorRgb.r * 255)}, ${Math.round(
                                          selected.addedBleedColorRgb.g * 255
                                        )}, ${Math.round(selected.addedBleedColorRgb.b * 255)})`,
                                      }
                                    : undefined
                                }
                              />
                              <p className="text-xs text-ink-secondary">
                                {selected.addedBleedColorRgb
                                  ? "Generated bleed band fill color, sampled from the artwork's edge."
                                  : "Sampling edge color for the generated bleed band…"}
                              </p>
                            </div>
                          )}
                          <NumberField label="Dot diameter (mm)" value={selected.dotParams.dotDiameterMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, dotDiameterMm: v } })} />
                          <NumberField label="White halo under dot (mm)" value={selected.dotParams.dotHaloMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, dotHaloMm: v } })} />
                          <NumberField
                            label="Clearance between design and halo (mm)"
                            value={selected.dotParams.haloClearanceMm}
                            onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, haloClearanceMm: v } })}
                          />
                          <NumberField label="Extra margin beyond dot (mm)" value={selected.dotParams.marginMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, marginMm: v } })} />
                          <div className="grid grid-cols-2 gap-2">
                            <NumberField label="Top dots" value={selected.dotParams.topCount} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, topCount: v } })} />
                            <NumberField label="Bottom dots" value={selected.dotParams.bottomCount} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, bottomCount: v } })} />
                            <NumberField label="Left dots" value={selected.dotParams.leftCount} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, leftCount: v } })} />
                            <NumberField label="Right dots" value={selected.dotParams.rightCount} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, rightCount: v } })} />
                          </div>
                          <Button variant="secondary" size="sm" onClick={() => recomputeDots(selected)}>
                            <RefreshCw size={13} className="mr-1.5" /> Recompute auto layout
                          </Button>
                          <p className="text-xs text-ink-muted">Recomputing replaces any dots you have dragged manually.</p>
                          <Button size="sm" onClick={() => exportDotPdf(selected)}>
                            <Download size={13} className="mr-1.5" /> Export PDF
                          </Button>
                        </div>
                      )}
                    </div>

                    <div className="flex-1">
                      {selected ? (
                        <DotCanvas
                          canvasWidthMm={selected.canvasWidthMm}
                          canvasHeightMm={selected.canvasHeightMm}
                          contentOffsetMm={selected.contentOffsetMm}
                          contentWidthMm={selected.effectiveWidthMm}
                          contentHeightMm={selected.effectiveHeightMm}
                          pdfOffsetMm={selected.pdfOffsetMm}
                          pdfWidthMm={selected.widthMm}
                          pdfHeightMm={selected.heightMm}
                          previewDataUrl={selected.previewDataUrl}
                          dotDiameterMm={selected.dotParams.dotDiameterMm}
                          dotHaloMm={selected.dotParams.dotHaloMm}
                          bleedMm={selected.dotParams.bleedMm}
                          bleedAlreadyInFile={selected.dotParams.bleedAlreadyInFile}
                          addedBleedColorRgb={selected.addedBleedColorRgb}
                          dots={selected.dots}
                          onChange={(dots) => updatePiece(selected.id, { dots })}
                        />
                      ) : (
                        <p className="py-10 text-center text-sm text-ink-muted">Select a piece on the left.</p>
                      )}
                    </div>
                  </div>
                ),
              },
              {
                id: "nesting",
                label: "Nesting",
                content: (
                  <div className="flex flex-col gap-4 pt-5 lg:flex-row">
                    <div className="w-full shrink-0 lg:w-80">
                      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Material sheet</h3>
                        <NumberField label="Sheet width (mm)" value={sheetWidthMm} onChange={setSheetWidthMm} />
                        <NumberField label="Sheet height (mm)" value={sheetHeightMm} onChange={setSheetHeightMm} />
                        <NumberField label="Spacing between pieces (mm)" value={spacingMm} onChange={setSpacingMm} />
                        <NumberField label="Grid resolution (mm) — lower = tighter but slower" value={resolutionMm} onChange={setResolutionMm} step={0.5} />
                        <label className="flex items-center gap-2 text-xs text-ink-secondary">
                          <input type="checkbox" checked={optimizeWidthToo} onChange={(e) => setOptimizeWidthToo(e.target.checked)} />
                          Also optimize width (flatbed sheet, not a fixed-width roll)
                        </label>
                        <Button variant="secondary" size="sm" onClick={suggestBestSheetSize} loading={suggestingSheet}>
                          <Ruler size={13} className="mr-1.5" /> Suggest best-fit sheet size
                        </Button>
                        <p className="text-xs text-ink-muted">
                          {optimizeWidthToo
                            ? "Searches both dimensions for a tighter sheet — applies the result to both Sheet width and Sheet height above."
                            : "Keeps the sheet width you set and searches for the shortest height that fits everything — applies the result to Sheet height above."}
                        </p>
                        <Button onClick={runNesting} loading={nesting}>
                          Run Nesting
                        </Button>
                        {nestStatus && <p className="text-xs text-ink-muted">{nestStatus}</p>}
                        {nestResult && nestStale && (
                          <p className="rounded-md bg-warning-tint p-2 text-xs text-warning">
                            A piece changed since this layout was nested — the buttons below still export the last
                            good layout, but it won&apos;t match what&apos;s shown in the pieces panel now. Click Run
                            Nesting again first.
                          </p>
                        )}
                        {nestResult && (
                          <div className="rounded-md bg-surface-sunken p-2 text-xs text-ink-secondary">
                            <p>Utilization: {nestResult.utilizationPct.toFixed(1)}%</p>
                            <p>Placed: {nestResult.placements.length}</p>
                            {nestResult.unplaced.length > 0 && (
                              <p className="text-danger">Did not fit: {nestResult.unplaced.length}</p>
                            )}
                            <div className="mt-2 flex flex-col gap-2">
                              <Button size="sm" variant="secondary" onClick={exportPrintPdf}>
                                <Download size={13} className="mr-1.5" /> Export Print PDF (artwork + dots)
                              </Button>
                              <Button size="sm" variant="secondary" onClick={exportCutPdf}>
                                <Download size={13} className="mr-1.5" /> Export Cut PDF (path + dots, for Zund)
                              </Button>
                            </div>
                            <p className="mt-2 text-xs text-ink-muted">
                              Both files place the same registration dots at identical positions — print the first, send the second to the
                              cutter.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Registration dots</h3>
                        <div className="flex gap-1 rounded-md bg-surface-sunken p-1">
                          {(["perPiece", "overall"] as const).map((m) => (
                            <button
                              key={m}
                              onClick={() => setDotMode(m)}
                              className={`flex-1 rounded px-2 py-1.5 text-xs font-medium ${
                                dotMode === m ? "bg-primary text-on-brand" : "text-ink-secondary hover:bg-surface"
                              }`}
                            >
                              {m === "perPiece" ? "Around each piece" : "Around overall layout"}
                            </button>
                          ))}
                        </div>
                        <p className="text-xs text-ink-muted">
                          {dotMode === "perPiece"
                            ? "Every placed copy gets its own ring of dots (today's default). Nesting keeps a little extra clearance around each piece for that ring."
                            : "One ring of dots is placed around the whole nested layout instead. Pieces also nest tighter and line up more consistently, since there's no per-piece dot zone to work around anymore. Re-run nesting after switching to see this take effect."}
                        </p>
                        {dotMode === "overall" && (
                          <>
                            <NumberField label="Dot diameter (mm)" value={ringParams.dotDiameterMm} onChange={(v) => setRingParams((r) => ({ ...r, dotDiameterMm: v }))} />
                            <NumberField label="White halo under dot (mm)" value={ringParams.dotHaloMm} onChange={(v) => setRingParams((r) => ({ ...r, dotHaloMm: v }))} />
                            <NumberField label="Clearance between layout and halo (mm)" value={ringParams.haloClearanceMm} onChange={(v) => setRingParams((r) => ({ ...r, haloClearanceMm: v }))} />
                            <NumberField label="Extra margin beyond dot (mm)" value={ringParams.marginMm} onChange={(v) => setRingParams((r) => ({ ...r, marginMm: v }))} />
                            <div className="grid grid-cols-2 gap-2">
                              <NumberField label="Top dots" value={ringParams.topCount} onChange={(v) => setRingParams((r) => ({ ...r, topCount: v }))} />
                              <NumberField label="Bottom dots" value={ringParams.bottomCount} onChange={(v) => setRingParams((r) => ({ ...r, bottomCount: v }))} />
                              <NumberField label="Left dots" value={ringParams.leftCount} onChange={(v) => setRingParams((r) => ({ ...r, leftCount: v }))} />
                              <NumberField label="Right dots" value={ringParams.rightCount} onChange={(v) => setRingParams((r) => ({ ...r, rightCount: v }))} />
                            </div>
                            {!nestResult && <p className="text-xs text-ink-muted">Run nesting to preview the ring and check it fits the sheet.</p>}
                            {ringOverflowsSheet && overallDotsInfo && (
                              <p className="rounded-md bg-warning-tint p-2 text-xs text-warning">
                                This ring needs about {Math.ceil(overallDotsInfo.ringMaxX - overallDotsInfo.ringMinX)} ×{" "}
                                {Math.ceil(overallDotsInfo.ringMaxY - overallDotsInfo.ringMinY)}mm, which is bigger than the current{" "}
                                {sheetWidthMm} × {sheetHeightMm}mm sheet — increase the sheet size (or reduce margin/clearance
                                above) so the outer dots land on the printable area.
                              </p>
                            )}
                          </>
                        )}
                      </div>

                      <div className="mt-4 flex flex-col gap-3">
                        <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Pieces to nest</h3>
                        {pieces.map((p) => (
                          <div key={p.id} className="rounded-lg border border-line bg-surface p-3">
                            <p className="mb-1 truncate text-sm font-medium text-ink">{p.fileName}</p>
                            <p className="mb-2 text-xs text-ink-secondary">
                              Design {p.widthMm.toFixed(1)} × {p.heightMm.toFixed(1)} mm · nested unit{" "}
                              {p.canvasWidthMm.toFixed(1)} × {p.canvasHeightMm.toFixed(1)} mm (incl. bleed zone + dots)
                            </p>
                            <div className="mb-2 flex items-center gap-2">
                              <label className="text-xs text-ink-secondary">Qty</label>
                              <input
                                type="number"
                                min={0}
                                value={p.quantity}
                                onChange={(e) => updatePiece(p.id, { quantity: Number(e.target.value) || 0 })}
                                className="w-16 rounded-md border border-line-strong bg-surface px-2 py-1 text-sm"
                              />
                            </div>
                            <div className="mb-2 flex flex-wrap gap-2 text-xs">
                              {[0, 90, 180, 270].map((deg) => (
                                <label key={deg} className="flex items-center gap-1">
                                  <input
                                    type="checkbox"
                                    checked={p.rotations.includes(deg)}
                                    onChange={(e) =>
                                      updatePiece(p.id, {
                                        rotations: e.target.checked
                                          ? [...p.rotations, deg].sort((a, b) => a - b)
                                          : p.rotations.filter((r) => r !== deg),
                                      })
                                    }
                                  />
                                  {deg}°
                                </label>
                              ))}
                            </div>
                            <details>
                              <summary className="cursor-pointer text-xs text-primary">Edit cut outline</summary>
                              <div className="mt-2 flex flex-col gap-2">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => autoTraceOutline(p)}
                                  loading={tracingId === p.id}
                                >
                                  <Wand2 size={13} className="mr-1.5" /> Auto-trace shape from artwork
                                </Button>
                                <p className="text-xs text-ink-muted">
                                  Works via transparency, or by color difference against a solid background. Traces the real silhouette
                                  instead of a rectangle — increase nesting spacing afterward since dots sit outside the tight shape.
                                </p>
                                {p.traceFillColorRgb && (
                                  <div className="flex items-center gap-2 rounded-md bg-surface-sunken p-2">
                                    <span
                                      className="h-5 w-5 shrink-0 rounded border border-line-strong"
                                      style={{
                                        backgroundColor: `rgb(${Math.round(p.traceFillColorRgb.r * 255)}, ${Math.round(
                                          p.traceFillColorRgb.g * 255
                                        )}, ${Math.round(p.traceFillColorRgb.b * 255)})`,
                                      }}
                                    />
                                    <div className="flex-1">
                                      <NumberField
                                        label="Color bleed under the cut edge (mm)"
                                        value={p.colorBleedMm}
                                        onChange={(v) => updatePiece(p.id, { colorBleedMm: v })}
                                        step={0.5}
                                      />
                                    </div>
                                  </div>
                                )}
                                <OutlineCanvas
                                  canvasWidthMm={p.canvasWidthMm}
                                  canvasHeightMm={p.canvasHeightMm}
                                  contentOffsetMm={p.contentOffsetMm}
                                  contentWidthMm={p.effectiveWidthMm}
                                  contentHeightMm={p.effectiveHeightMm}
                                  pdfOffsetMm={p.pdfOffsetMm}
                                  pdfWidthMm={p.widthMm}
                                  pdfHeightMm={p.heightMm}
                                  addedBleedColorRgb={p.addedBleedColorRgb}
                                  previewDataUrl={p.previewDataUrl}
                                  outline={p.outline}
                                  onChange={(outline) => updatePiece(p.id, { outline, outlineIsDefault: false })}
                                />
                              </div>
                            </details>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex-1">
                      {nestResult ? (
                        <NestPreview
                          result={nestResult}
                          onChange={(placements) => setNestResult((prev) => (prev ? { ...prev, placements } : prev))}
                          overlayDots={overallDotsInfo?.dots}
                        />
                      ) : (
                        <div className="rounded-lg border border-line bg-surface p-10 text-center text-sm text-ink-muted">
                          Set your material size and quantities, then run nesting to see the layout here.
                        </div>
                      )}
                    </div>
                  </div>
                ),
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-ink-secondary">
      {label}
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        className="rounded-md border border-line-strong bg-surface px-2 py-1 text-sm text-ink"
      />
    </label>
  );
}
