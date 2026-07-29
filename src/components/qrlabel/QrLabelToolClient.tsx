"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode, Printer, Download, RotateCcw } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";
import { encodeQr, type ErrorCorrectLevel } from "@/lib/qrlabel/qrEncoder";

// Fixed manufacturing-label fields. Everything here is editable in the UI —
// these are just the day-to-day defaults so the form doesn't start blank.
const DEFAULTS = {
  company: "Macromedia Digital Imaging Pvt Ltd (MMDI)",
  address: "23B & 24, Ph5, IDA Ph5, Cherlapally, Hyderabad-500051, TG, India",
  material: "Retroreflective Type 11",
  make: "3M",
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function ordinal(n: number): string {
  const suffixes = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${suffixes[(v - 20) % 10] ?? suffixes[v] ?? suffixes[0]}`;
}

function domHuman(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${ordinal(d)} ${MONTHS[m - 1]} ${y}`;
}

// Rendering + print-size constants. Quiet zone (4 blank modules on every
// side) is required by the QR spec for reliable scanning and is NOT part of
// QrMatrix.moduleCount, so it's added on top everywhere below.
const MODULE_PX = 10;
const QUIET_ZONE_MODULES = 4;
const MM_PER_MODULE_MIN = 0.4; // safe minimum for a decent printer + phone camera
const MM_PER_MODULE_COMFY = 0.5;

const EC_OPTIONS: { value: ErrorCorrectLevel; label: string }[] = [
  { value: "L", label: "L — low (smallest, recommended)" },
  { value: "M", label: "M — medium" },
  { value: "Q", label: "Q — quartile" },
  { value: "H", label: "H — high (largest, most damage-resistant)" },
];

const FIELD_LABEL = "mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-muted";
const FIELD_INPUT =
  "w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none focus-visible:ring-2 focus-visible:ring-primary";

export default function QrLabelToolClient() {
  const { toast } = useToast();
  const [company, setCompany] = useState(DEFAULTS.company);
  const [address, setAddress] = useState(DEFAULTS.address);
  const [material, setMaterial] = useState(DEFAULTS.material);
  const [make, setMake] = useState(DEFAULTS.make);
  const [domIso, setDomIso] = useState(todayISO());
  const [ecLevel, setEcLevel] = useState<ErrorCorrectLevel>("L");
  // null = "not yet touched by the user" -> follow the computed minimum automatically.
  const [printSizeMm, setPrintSizeMm] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const printImgRef = useRef<HTMLImageElement>(null);

  const payload = useMemo(() => {
    return `${company.trim()} | ${address.trim()} | DOM: ${domHuman(domIso)} | Material: ${material.trim()} | Make: ${make.trim()}`;
  }, [company, address, domIso, material, make]);

  const qrResult = useMemo(() => {
    try {
      return { ok: true as const, qr: encodeQr(payload, ecLevel) };
    } catch (e) {
      return { ok: false as const, error: e instanceof Error ? e.message : "Failed to encode QR code" };
    }
  }, [payload, ecLevel]);

  const totalUnits = qrResult.ok ? qrResult.qr.moduleCount + QUIET_ZONE_MODULES * 2 : 0;
  const minMm = qrResult.ok ? Math.round(totalUnits * MM_PER_MODULE_MIN * 10) / 10 : 0;
  const comfyMm = qrResult.ok ? Math.round(totalUnits * MM_PER_MODULE_COMFY * 10) / 10 : 0;
  const effectivePrintSizeMm = printSizeMm ?? minMm;
  const belowMin = qrResult.ok && effectivePrintSizeMm < minMm;

  // Draw the matrix to canvas whenever the encoded QR changes, then mirror it
  // into the print-only <img> so the print stylesheet has something to show.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !qrResult.ok) return;
    const { qr } = qrResult;
    const size = (qr.moduleCount + QUIET_ZONE_MODULES * 2) * MODULE_PX;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = "#000000";
    for (let row = 0; row < qr.moduleCount; row++) {
      for (let col = 0; col < qr.moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect((col + QUIET_ZONE_MODULES) * MODULE_PX, (row + QUIET_ZONE_MODULES) * MODULE_PX, MODULE_PX, MODULE_PX);
        }
      }
    }
    if (printImgRef.current) {
      printImgRef.current.src = canvas.toDataURL("image/png");
    }
  }, [qrResult]);

  function handlePrint() {
    if (canvasRef.current && printImgRef.current) {
      printImgRef.current.src = canvasRef.current.toDataURL("image/png");
    }
    window.print();
  }

  function handleDownload() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.href = canvas.toDataURL("image/png");
    a.download = `qr-label_${domIso}.png`;
    a.click();
  }

  function handleReset() {
    setCompany(DEFAULTS.company);
    setAddress(DEFAULTS.address);
    setMaterial(DEFAULTS.material);
    setMake(DEFAULTS.make);
    setDomIso(todayISO());
    setEcLevel("L");
    setPrintSizeMm(null);
    toast("info", "Reset to today's defaults");
  }

  return (
    <div>
      <div className="print:hidden">
        <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Manufacturing" }, { label: "QR Label Tool" }]} />

        <div className="mt-4 flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
              <QrCode size={22} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-semibold text-ink">QR Label Tool</h1>
                <Badge status="info">Runs locally in your browser</Badge>
              </div>
              <p className="mt-0.5 text-sm text-ink-secondary">
                Daily product-label QR generator for retroreflective sheeting stock. Update the manufacturing date each
                morning, then print at the size shown below.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={handleReset}>
              <RotateCcw size={14} className="mr-1.5" /> Reset defaults
            </Button>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card interactive={false} className="flex flex-col gap-1">
            <div>
              <label className={FIELD_LABEL}>Company</label>
              <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className={FIELD_INPUT} />
            </div>
            <div className="mt-3">
              <label className={FIELD_LABEL}>Address</label>
              <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} className={FIELD_INPUT} />
            </div>
            <div className="mt-3">
              <label className={FIELD_LABEL}>Date of Manufacturing</label>
              <input type="date" value={domIso} onChange={(e) => setDomIso(e.target.value)} className={FIELD_INPUT} />
            </div>
            <div className="mt-3 flex gap-3">
              <div className="flex-1">
                <label className={FIELD_LABEL}>Make of Material</label>
                <input type="text" value={material} onChange={(e) => setMaterial(e.target.value)} className={FIELD_INPUT} />
              </div>
              <div className="flex-1">
                <label className={FIELD_LABEL}>Make</label>
                <input type="text" value={make} onChange={(e) => setMake(e.target.value)} className={FIELD_INPUT} />
              </div>
            </div>
            <div className="mt-3">
              <label className={FIELD_LABEL}>Error correction (lower = smaller code)</label>
              <select
                value={ecLevel}
                onChange={(e) => setEcLevel(e.target.value as ErrorCorrectLevel)}
                className={FIELD_INPUT}
              >
                {EC_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </Card>

          <Card interactive={false} className="flex flex-col items-center">
            {qrResult.ok ? (
              <canvas
                ref={canvasRef}
                className="rounded-md border border-line bg-white"
                style={{ width: 220, height: 220, imageRendering: "pixelated" }}
              />
            ) : (
              <div className="flex h-[220px] w-[220px] items-center justify-center rounded-md border border-dashed border-danger/40 bg-danger-tint p-4 text-center text-sm text-danger">
                {qrResult.error}
              </div>
            )}

            {qrResult.ok && (
              <div className="mt-4 w-full border-t border-line pt-3 text-xs text-ink-secondary">
                <div className="flex justify-between py-0.5">
                  <span>Characters encoded</span>
                  <b className="text-ink">{payload.length}</b>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>QR modules</span>
                  <b className="text-ink">
                    {qrResult.qr.moduleCount} × {qrResult.qr.moduleCount}
                  </b>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Minimum reliable print size</span>
                  <b className="text-ink">{minMm} mm</b>
                </div>
                <div className="flex justify-between py-0.5">
                  <span>Comfortable print size</span>
                  <b className="text-ink">{comfyMm} mm</b>
                </div>
              </div>
            )}

            <div className="mt-3 w-full rounded-md bg-surface-sunken p-2 font-mono text-[11px] text-ink-secondary">
              {payload}
            </div>

            <div className="mt-4 flex w-full items-end gap-3">
              <div className="flex-1">
                <label className={FIELD_LABEL}>Print size (mm, square)</label>
                <input
                  type="number"
                  min={minMm}
                  step={0.5}
                  value={effectivePrintSizeMm}
                  onChange={(e) => setPrintSizeMm(Number(e.target.value) || minMm)}
                  className={FIELD_INPUT}
                />
              </div>
            </div>
            {belowMin && (
              <p className="mt-1 w-full text-xs text-warning">
                Below the minimum reliable size for this much text — code may not scan.
              </p>
            )}

            <div className="mt-4 flex w-full gap-2">
              <Button onClick={handlePrint} disabled={!qrResult.ok} className="flex-1">
                <Printer size={14} className="mr-1.5" /> Print label
              </Button>
              <Button variant="secondary" onClick={handleDownload} disabled={!qrResult.ok} className="flex-1">
                <Download size={14} className="mr-1.5" /> Download PNG
              </Button>
            </div>
          </Card>
        </div>
      </div>

      {/* Print-only view: shown exclusively inside @media print, everything above is hidden via print:hidden. */}
      <div className="hidden print:fixed print:inset-0 print:flex print:items-center print:justify-center">
        {/* eslint-disable-next-line @next/next/no-img-element -- data-URL snapshot of the canvas, not an optimizable asset */}
        <img
          ref={printImgRef}
          alt="QR code"
          style={{ width: `${effectivePrintSizeMm}mm`, height: `${effectivePrintSizeMm}mm` }}
        />
      </div>
    </div>
  );
}
