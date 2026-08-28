"use client";

import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Renders the exact PDF Generate would produce (same buildPdfBlob call, in
// SiteSurveyReportEditorClient), without downloading it or touching
// status/generated_at -- purely a look-before-you-commit step. The blob
// URL is built by the parent (it already owns persist/photo-fetch logic
// for Generate) and handed down; this component is just the embed + a
// rebuild button for after further edits.

interface Props {
  previewUrl: string | null;
  building: boolean;
  onBuild: () => void;
}

export function PreviewStep({ previewUrl, building, onBuild }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-ink-secondary">
          A preview of the PDF Generate would produce right now, built from the details, photos, and measurements entered so
          far.
        </p>
        <Button variant="secondary" size="sm" onClick={onBuild} loading={building}>
          <RefreshCw size={13} /> {previewUrl ? "Rebuild Preview" : "Build Preview"}
        </Button>
      </div>
      {previewUrl ? (
        <iframe src={previewUrl} title="Site Survey Report preview" className="h-[75vh] w-full rounded-lg border border-line" />
      ) : (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-line py-16 text-center">
          <p className="text-sm text-ink-muted">No preview built yet.</p>
          <Button onClick={onBuild} loading={building}>
            Build Preview
          </Button>
        </div>
      )}
    </div>
  );
}
