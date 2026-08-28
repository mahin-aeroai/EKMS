"use client";

import { RefreshCw } from "lucide-react";
import { MasterPickSelect } from "@/components/installationReport/MasterPickSelect";
import { Button } from "@/components/ui/Button";
import type { SiteSurveyMeasurement } from "@/lib/siteSurveyReport/types";

// The reference PDF's "Site Photo and measurement" page: a Visual size (the
// artwork itself) plus a Bleed allowance on each side (how much bigger the
// printed material is cut, so it can be trimmed to the wall/window edge)
// combine into the Material size actually ordered from the printer --
// Material width = Visual width + Bleed left + Bleed right (same for
// height). Bleed defaults to 30mm/side (see emptyMeasurement()) and, like
// every field here, is directly editable -- "Recalculate" re-derives
// Material from the current Visual + Bleed values on demand rather than
// fighting the user's typing on every keystroke; editing Material directly
// (e.g. to match a PDF's own stated material size once AI extraction lands)
// simply sticks until Recalculate is pressed again.
//
// Material Type / Installation Type / Equipment Source / Installed By use
// MasterPickSelect, the same admin-editable master-data-table pick-list
// component Installation Report Creator uses for its own Material/Fixture
// Type/Team pickers (see supabase-site-survey-report-master-migration.sql)
// -- a real dropdown with an inline "+ Add new" escape hatch, rather than a
// hardcoded (and possibly wrong) enum.

interface Props {
  measurement: SiteSurveyMeasurement;
  onChange: <K extends keyof SiteSurveyMeasurement>(key: K, value: SiteSurveyMeasurement[K]) => void;
}

export function MeasurementStep({ measurement, onChange }: Props) {
  function recalculateMaterial() {
    const { visualWidthMm, visualHeightMm, bleedLeftMm, bleedRightMm, bleedTopMm, bleedBottomMm } = measurement;
    if (visualWidthMm != null) {
      onChange("materialWidthMm", visualWidthMm + (bleedLeftMm ?? 0) + (bleedRightMm ?? 0));
    }
    if (visualHeightMm != null) {
      onChange("materialHeightMm", visualHeightMm + (bleedTopMm ?? 0) + (bleedBottomMm ?? 0));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section title="Visual Size">
        <Grid>
          <NumberField label="Visual Width (mm)" value={measurement.visualWidthMm} onChange={(v) => onChange("visualWidthMm", v)} />
          <NumberField label="Visual Height (mm)" value={measurement.visualHeightMm} onChange={(v) => onChange("visualHeightMm", v)} />
        </Grid>
      </Section>

      <Section title="Bleed Allowance">
        <Grid>
          <NumberField label="Bleed Left (mm)" value={measurement.bleedLeftMm} onChange={(v) => onChange("bleedLeftMm", v)} />
          <NumberField label="Bleed Right (mm)" value={measurement.bleedRightMm} onChange={(v) => onChange("bleedRightMm", v)} />
          <NumberField label="Bleed Top (mm)" value={measurement.bleedTopMm} onChange={(v) => onChange("bleedTopMm", v)} />
          <NumberField label="Bleed Bottom (mm)" value={measurement.bleedBottomMm} onChange={(v) => onChange("bleedBottomMm", v)} />
        </Grid>
      </Section>

      <Section
        title="Material Size"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={recalculateMaterial}>
            <RefreshCw size={13} /> Recalculate from Visual + Bleed
          </Button>
        }
      >
        <Grid>
          <NumberField label="Material Width (mm)" value={measurement.materialWidthMm} onChange={(v) => onChange("materialWidthMm", v)} />
          <NumberField label="Material Height (mm)" value={measurement.materialHeightMm} onChange={(v) => onChange("materialHeightMm", v)} />
        </Grid>
        <p className="mt-2 text-xs text-ink-muted">
          Material = Visual + Bleed (left/right for width, top/bottom for height). Edit directly to override, or use
          Recalculate to re-derive it.
        </p>
      </Section>

      <Section title="Installation">
        <Grid>
          <MasterPickSelect
            label="Material Type"
            table="site_survey_report_materials"
            value={measurement.materialType}
            onChange={(v) => onChange("materialType", v)}
          />
          <MasterPickSelect
            label="Installation Type"
            table="site_survey_report_installation_types"
            value={measurement.installationType}
            onChange={(v) => onChange("installationType", v)}
          />
          <MasterPickSelect
            label="Equipment Source"
            table="site_survey_report_equipment_sources"
            value={measurement.equipmentSource}
            onChange={(v) => onChange("equipmentSource", v)}
          />
          <MasterPickSelect
            label="Installed By"
            table="site_survey_report_installers"
            value={measurement.installedBy}
            onChange={(v) => onChange("installedBy", v)}
          />
          <TextField
            label="Equipment Required"
            value={measurement.equipmentDetail}
            onChange={(v) => onChange("equipmentDetail", v)}
            className="sm:col-span-2"
          />
          <TextAreaField
            label="Measurement Notes"
            value={measurement.measurementNotes}
            onChange={(v) => onChange("measurementNotes", v)}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>
    </div>
  );
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="flex items-center justify-between gap-3 rounded-t-lg border-b border-line bg-surface-sunken px-4 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function NumberField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function TextAreaField({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </label>
  );
}
