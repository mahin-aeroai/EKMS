"use client";

import { AlertTriangle, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Step 2 of the PDF-extraction path: kick off the one forced tool-call to
// Claude (see /api/site-survey-reports/[reportId]/extract) and show its
// outcome. The call itself is a single synchronous request/response (no
// background job/polling) -- this step's job is honest before/during/after
// states around that one call, not a progress bar with fake increments.

interface Props {
  canRun: boolean;
  running: boolean;
  error: string | null;
  hasRunBefore: boolean;
  onRun: () => void;
}

export function ExtractionStep({ canRun, running, error, hasRunBefore, onRun }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-line py-16 text-center">
      <Sparkles size={28} className={running ? "animate-pulse text-primary" : "text-primary"} />
      <p className="text-sm font-medium text-ink">{running ? "Reading the PDF…" : "Run AI Extraction"}</p>
      <p className="max-w-md text-xs text-ink-muted">
        {running
          ? "Claude is reading every page of the uploaded PDF and filling in what it can confidently find. This usually takes under a minute."
          : "Reads the uploaded PDF and fills in Complete Details and Measurements with anything it can confidently find. Nothing is guessed — blank fields stay blank for you to fill in on Review."}
      </p>

      {error && (
        <div className="mt-1 flex max-w-md items-start gap-2 rounded-md border border-danger/30 bg-danger-tint px-3 py-2 text-left text-xs text-danger">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {!canRun && !running && (
        <p className="text-xs text-ink-muted">Upload a PDF on the previous step first.</p>
      )}

      <Button onClick={onRun} loading={running} disabled={!canRun} className="mt-2">
        {hasRunBefore ? "Run Extraction Again" : "Run AI Extraction"}
      </Button>
    </div>
  );
}
