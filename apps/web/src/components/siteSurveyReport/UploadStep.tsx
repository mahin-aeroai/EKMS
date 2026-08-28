"use client";

import { useRef } from "react";
import { FileText, Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";

// Step 1 of the PDF-extraction path: get an existing filled-in Site Survey
// PDF into R2 (source_pdf_relative_path), nothing else. Upload logic lives
// in the parent editor (same place Save/Generate live) since it needs to
// persist onto the report row; this component is just the picker UI.

interface Props {
  sourcePdfName: string | null;
  uploading: boolean;
  onUpload: (file: File) => void;
  onContinue: () => void;
}

export function UploadStep({ sourcePdfName, uploading, onUpload, onContinue }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-line py-16 text-center">
      <FileText size={28} className="text-primary" />
      <p className="text-sm font-medium text-ink">Upload the existing Site Survey Report PDF</p>
      <p className="max-w-md text-xs text-ink-muted">
        AI reads the whole document and fills in as many fields as it can confidently find — anything it can&apos;t find stays
        blank for you to fill in on the next steps.
      </p>

      <input
        ref={fileInput}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) onUpload(file);
        }}
      />

      {sourcePdfName ? (
        <div className="mt-2 flex flex-col items-center gap-3">
          <p className="text-xs text-success">PDF uploaded ✓</p>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => fileInput.current?.click()} loading={uploading}>
              Replace PDF
            </Button>
            <Button size="sm" onClick={onContinue}>
              Continue to AI Extraction
            </Button>
          </div>
        </div>
      ) : (
        <Button className="mt-2" onClick={() => fileInput.current?.click()} loading={uploading}>
          <Upload size={15} /> Choose PDF
        </Button>
      )}
    </div>
  );
}
