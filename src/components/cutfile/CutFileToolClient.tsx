"use client";

import { useRef, useState } from "react";
import { Scissors, Upload, Download, Trash2, RefreshCw } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Tabs } from "@/components/ui/Tabs";
import { useToast } from "@/components/ui/Notifications";
import { DotCanvas } from "@/components/cutfile/DotCanvas";
import { OutlineCanvas } from "@/components/cutfile/OutlineCanvas";
import { NestPreview } from "@/components/cutfile/NestPreview";
import { computeDotLayout, rectPolygon, type DotSpec, type Point } from "@/lib/cutfile/geometry";
import { loadPdf, buildDotPlacementPdf, buildNestedSheetPdf, downloadBlob } from "@/lib/cutfile/pdfIO";
import { nestPieces, type NestResult } from "@/lib/cutfile/nesting";

interface DotParams {
  bleedMm: number;
  dotDiameterMm: number;
  dotHaloMm: number;
  marginMm: number;
  topCount: number;
  bottomCount: number;
  leftCount: number;
  rightCount: number;
}

const DEFAULT_DOT_PARAMS: DotParams = {
  bleedMm: 14,
  dotDiameterMm: 6,
  dotHaloMm: 2,
  marginMm: 4,
  topCount: 3,
  bottomCount: 3,
  leftCount: 2,
  rightCount: 2,
};

interface UploadedPiece {
  id: string;
  fileName: string;
  bytes: ArrayBuffer;
  widthMm: number;
  heightMm: number;
  previewDataUrl: string;
  dotParams: DotParams;
  dots: DotSpec[];
  canvasWidthMm: number;
  canvasHeightMm: number;
  contentOffsetMm: number;
  // The cut-contour used for BOTH nesting placement and the exported cut
  // path. Defaults to a rectangle matching the full output canvas (design
  // + bleed + dot zone + margin) — nesting must respect that whole area,
  // not just the bare design — and stays in sync with that rectangle as
  // layout parameters change, until the operator manually reshapes it.
  outline: Point[];
  outlineIsDefault: boolean;
  quantity: number;
  rotations: number[];
}

function recomputeLayout(widthMm: number, heightMm: number, params: DotParams) {
  return computeDotLayout({
    trimWidthMm: widthMm,
    trimHeightMm: heightMm,
    bleedMm: params.bleedMm,
    dotDiameterMm: params.dotDiameterMm,
    marginMm: params.marginMm,
    topCount: params.topCount,
    bottomCount: params.bottomCount,
    leftCount: params.leftCount,
    rightCount: params.rightCount,
  });
}

export default function CutFileToolClient() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pieces, setPieces] = useState<UploadedPiece[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [sheetWidthMm, setSheetWidthMm] = useState(3000);
  const [sheetHeightMm, setSheetHeightMm] = useState(1500);
  const [spacingMm, setSpacingMm] = useState(5);
  const [resolutionMm, setResolutionMm] = useState(2);
  const [nesting, setNesting] = useState(false);
  const [nestStatus, setNestStatus] = useState<string | null>(null);
  const [nestResult, setNestResult] = useState<NestResult | null>(null);

  const selected = pieces.find((p) => p.id === selectedId) ?? null;

  function updatePiece(id: string, patch: Partial<UploadedPiece>) {
    setPieces((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
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
          outline: rectPolygon(layout.canvasWidthMm, layout.canvasHeightMm),
          outlineIsDefault: true,
          quantity: 1,
          rotations: [0, 90, 180, 270],
        };
        setPieces((prev) => [...prev, piece]);
        setSelectedId((cur) => cur ?? id);
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
  }

  function recomputeDots(piece: UploadedPiece) {
    const layout = recomputeLayout(piece.widthMm, piece.heightMm, piece.dotParams);
    updatePiece(piece.id, {
      dots: layout.dots,
      canvasWidthMm: layout.canvasWidthMm,
      canvasHeightMm: layout.canvasHeightMm,
      contentOffsetMm: layout.contentOffsetMm,
      // Keep the default rectangle outline (used for nesting + the cut
      // path) matched to the new canvas size, unless the operator has
      // manually reshaped it — a manual edit should survive a parameter
      // tweak rather than getting silently overwritten.
      outline: piece.outlineIsDefault ? rectPolygon(layout.canvasWidthMm, layout.canvasHeightMm) : piece.outline,
    });
  }

  async function exportDotPdf(piece: UploadedPiece) {
    try {
      const blob = await buildDotPlacementPdf({
        originalBytes: piece.bytes,
        canvasWidthMm: piece.canvasWidthMm,
        canvasHeightMm: piece.canvasHeightMm,
        contentOffsetMm: piece.contentOffsetMm,
        dots: piece.dots,
        dotDiameterMm: piece.dotParams.dotDiameterMm,
        dotHaloMm: piece.dotParams.dotHaloMm,
        outline: piece.outline,
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
        })),
        onProgress: (msg) => setNestStatus(msg),
      });
      setNestResult(result);
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

  async function exportNestedPdf() {
    if (!nestResult) return;
    try {
      const blob = await buildNestedSheetPdf({
        sheetWidthMm: nestResult.sheetWidthMm,
        sheetHeightMm: nestResult.sheetHeightMm,
        placements: nestResult.placements,
        sources: pieces.map((p) => ({
          pieceId: p.id,
          bytes: p.bytes,
          outline: p.outline,
          contentOffsetMm: { x: p.contentOffsetMm, y: p.contentOffsetMm },
          dots: p.dots,
          dotDiameterMm: p.dotParams.dotDiameterMm,
          dotHaloMm: p.dotParams.dotHaloMm,
        })),
      });
      downloadBlob(blob, "nested_sheet.pdf");
      toast("success", "Exported nested sheet — download started");
    } catch (err) {
      toast("danger", err instanceof Error ? err.message : "Export failed");
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
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />
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
                        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Pieces</h3>
                        <div className="flex flex-col gap-1">
                          {pieces.map((p) => (
                            <button
                              key={p.id}
                              onClick={() => setSelectedId(p.id)}
                              className={`flex items-center justify-between rounded-md px-2 py-1.5 text-left text-sm ${
                                selectedId === p.id ? "bg-primary text-on-brand" : "text-ink hover:bg-surface-sunken"
                              }`}
                            >
                              <span className="truncate">{p.fileName}</span>
                              <Trash2
                                size={13}
                                className="ml-2 shrink-0 opacity-60 hover:opacity-100"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removePiece(p.id);
                                }}
                              />
                            </button>
                          ))}
                        </div>
                      </div>

                      {selected && (
                        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-line bg-surface p-3">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Layout parameters</h3>
                          <p className="text-xs text-ink-secondary">
                            Trim size detected: {selected.widthMm.toFixed(1)} × {selected.heightMm.toFixed(1)} mm
                          </p>
                          <NumberField label="Bleed already in file (mm, reference only)" value={selected.dotParams.bleedMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, bleedMm: v } })} />
                          <NumberField label="Dot diameter (mm)" value={selected.dotParams.dotDiameterMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, dotDiameterMm: v } })} />
                          <NumberField label="White halo under dot (mm)" value={selected.dotParams.dotHaloMm} onChange={(v) => updatePiece(selected.id, { dotParams: { ...selected.dotParams, dotHaloMm: v } })} />
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
                          contentWidthMm={selected.widthMm}
                          contentHeightMm={selected.heightMm}
                          previewDataUrl={selected.previewDataUrl}
                          dotDiameterMm={selected.dotParams.dotDiameterMm}
                          dotHaloMm={selected.dotParams.dotHaloMm}
                          bleedMm={selected.dotParams.bleedMm}
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
                        <Button onClick={runNesting} loading={nesting}>
                          Run Nesting
                        </Button>
                        {nestStatus && <p className="text-xs text-ink-muted">{nestStatus}</p>}
                        {nestResult && (
                          <div className="rounded-md bg-surface-sunken p-2 text-xs text-ink-secondary">
                            <p>Utilization: {nestResult.utilizationPct.toFixed(1)}%</p>
                            <p>Placed: {nestResult.placements.length}</p>
                            {nestResult.unplaced.length > 0 && (
                              <p className="text-danger">Did not fit: {nestResult.unplaced.length}</p>
                            )}
                            <Button size="sm" variant="secondary" className="mt-2" onClick={exportNestedPdf}>
                              <Download size={13} className="mr-1.5" /> Export nested PDF
                            </Button>
                          </div>
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
                              <div className="mt-2">
                                <OutlineCanvas
                                  canvasWidthMm={p.canvasWidthMm}
                                  canvasHeightMm={p.canvasHeightMm}
                                  contentOffsetMm={p.contentOffsetMm}
                                  contentWidthMm={p.widthMm}
                                  contentHeightMm={p.heightMm}
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
