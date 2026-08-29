"use client";

import { useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { MasterPickSelect } from "@/components/installationReport/MasterPickSelect";
import { Button } from "@/components/ui/Button";
import { useLfgDistinctValues } from "@/lib/useLfgDistinctValues";
import { INSTALLATION_TYPE_LABEL, SURVEY_COMPANY_LABEL, type SiteSurveyMeasurement, type SiteSurveyPhotoRow, type YesNo } from "@/lib/siteSurveyReport/types";

// The reference PDF's "Site Photo and measurement" page: a Visual size (the
// artwork itself) plus a Bleed allowance on each side (how much bigger the
// printed material is cut, so it can be trimmed to the wall/window edge)
// combine into the Material size actually ordered from the printer --
// Material width = Visual width + Bleed left + Bleed right (same for
// height). Bleed defaults to 30mm/side (see emptyMeasurement()). Material
// size is calculated automatically and kept read-only: an effect in
// SiteCard re-derives Material Width/Height from the current Visual +
// Bleed values on mount and on every subsequent Visual/Bleed edit, rather
// than requiring a manual "Recalculate" step or allowing Material to drift
// out of sync (or show stale/blank values for an already-filled site until
// its next edit).
//
// Equipment Source still uses MasterPickSelect, the same admin-editable
// master-data-table pick-list component Installation Report Creator uses
// for its own Material/Fixture Type/Team pickers (see
// supabase-site-survey-report-master-migration.sql) -- a real dropdown with
// an inline "+ Add new" escape hatch. Material Type / Installation Type /
// Installed By do NOT use it (any more): Material Type is free text with
// autocomplete suggestions drawn from LFG Connect's own real site records
// (lfg_sites.material, via useLfgDistinctValues -- same "New Site" form
// pattern LfgSiteWorkspaceClient.tsx already uses) rather than a
// site-survey-report-specific master table; Installation Type and Installed
// By are locked dropdowns (InstallationType / SurveyCompany, both from
// types.ts) with a fixed set of real-world options, not admin-editable
// lists.
//
// A store can have more than one opportunity worth surveying at this level
// of detail (a second window/banner location, say) -- `measurements` is an
// array, one editable "Site" card per entry, each with its own copy of
// every section below plus a Site Photo picker (assigns which uploaded
// 'measurement'-category photo -- see PhotosStep -- belongs to THIS site,
// via measurementPhotoId; pdfBuild.ts's drawSitePages resolves it the same
// way). "+ Add another site" appends a blank one; a site can only be
// removed while more than one exists, so a report is never left with zero.

interface Props {
  measurements: SiteSurveyMeasurement[];
  onChange: <K extends keyof SiteSurveyMeasurement>(index: number, key: K, value: SiteSurveyMeasurement[K]) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  /** Uploaded photos already tagged category='measurement' on the Photos step -- the pool the Site Photo picker below chooses from. */
  measurementPhotos: SiteSurveyPhotoRow[];
}

export function MeasurementStep({ measurements, onChange, onAdd, onRemove, measurementPhotos }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {measurements.map((measurement, index) => (
        <SiteCard
          key={index}
          index={index}
          total={measurements.length}
          measurement={measurement}
          onChange={(key, value) => onChange(index, key, value)}
          onRemove={measurements.length > 1 ? () => onRemove(index) : undefined}
          measurementPhotos={measurementPhotos}
        />
      ))}
      <Button type="button" variant="secondary" onClick={onAdd} className="self-start">
        <Plus size={14} /> Add another site
      </Button>
    </div>
  );
}

function SiteCard({
  index,
  total,
  measurement,
  onChange,
  onRemove,
  measurementPhotos,
}: {
  index: number;
  total: number;
  measurement: SiteSurveyMeasurement;
  onChange: <K extends keyof SiteSurveyMeasurement>(key: K, value: SiteSurveyMeasurement[K]) => void;
  onRemove?: () => void;
  measurementPhotos: SiteSurveyPhotoRow[];
}) {
  const materialOptions = useLfgDistinctValues("material");

  // Material Width/Height are fully derived from Visual + Bleed -- kept in
  // sync on mount (so an already-filled site shows the correct Material
  // immediately, not just after its next edit) and on every subsequent
  // Visual/Bleed change, via this effect rather than threading extra logic
  // through each of the six NumberFields below. The equality checks just
  // avoid redundant onChange calls once already in sync.
  const { visualWidthMm, visualHeightMm, bleedLeftMm, bleedRightMm, bleedTopMm, bleedBottomMm, materialWidthMm, materialHeightMm } = measurement;
  useEffect(() => {
    const width = visualWidthMm != null ? visualWidthMm + (bleedLeftMm ?? 0) + (bleedRightMm ?? 0) : null;
    const height = visualHeightMm != null ? visualHeightMm + (bleedTopMm ?? 0) + (bleedBottomMm ?? 0) : null;
    if (width !== materialWidthMm) onChange("materialWidthMm", width);
    if (height !== materialHeightMm) onChange("materialHeightMm", height);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visualWidthMm, visualHeightMm, bleedLeftMm, bleedRightMm, bleedTopMm, bleedBottomMm]);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-line-strong">
      <div className="flex items-center justify-between gap-3 bg-surface-sunken px-4 py-2.5">
        <h2 className="text-sm font-bold text-ink">{total > 1 ? `Site ${index + 1} of ${total}` : "Site Details"}</h2>
        {onRemove && (
          <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
            <Trash2 size={13} /> Remove site
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-6 p-4">
        <Section title="Site Photo">
          <Grid>
            <SelectField
              label="Which uploaded photo is this site?"
              value={measurement.measurementPhotoId ?? ""}
              onChange={(v) => onChange("measurementPhotoId", v || null)}
              options={[
                ["", measurementPhotos.length === 0 ? "— None uploaded yet —" : "— Select —"],
                ...measurementPhotos.map((p, i) => [p.id, p.caption || `Measurement Photo ${i + 1}`] as [string, string]),
              ]}
            />
          </Grid>
          <p className="mt-2 text-xs text-ink-muted">
            Upload photos and tag them category &quot;Site Measurement&quot; on the Photos step, then pick which one belongs to
            this site here.
          </p>
        </Section>

        {/*
          Opportunity Information used to live here, per-site. It's now
          filled once for the whole report on the Complete Details step /
          Default Answers page (SiteSurveyFormData) and applies to every
          site -- see that interface's own header comment. Only genuinely
          per-site measurement/material/installation/Apple-standards fields
          remain on this card.
        */}

      <Section title="Visual Size">
        <Grid>
          <NumberField label="Visual Width (mm)" value={measurement.visualWidthMm} onChange={(v) => onChange("visualWidthMm", v)} />
          <NumberField label="Visual Height (mm)" value={measurement.visualHeightMm} onChange={(v) => onChange("visualHeightMm", v)} />
          <NumberField label="Quantity" value={measurement.visualSizeQuantity} onChange={(v) => onChange("visualSizeQuantity", v)} />
          <SelectField
            label="Unit of Measurement"
            value={measurement.measurementUnit || "mm"}
            onChange={(v) => onChange("measurementUnit", v)}
            options={[
              ["mm", "Millimetres (mm)"],
              ["cm", "Centimetres (cm)"],
              ["inch", "Inches (in)"],
            ]}
          />
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

      <Section title="Material Size">
        <Grid>
          <NumberField label="Material Width (mm)" value={measurement.materialWidthMm} readOnly />
          <NumberField label="Material Height (mm)" value={measurement.materialHeightMm} readOnly />
        </Grid>
        <p className="mt-2 text-xs text-ink-muted">
          Calculated automatically as Visual + Bleed (left/right for width, top/bottom for height) -- updates as soon
          as either changes.
        </p>
      </Section>

      <Section title="Installation">
        <Grid>
          <ComboField
            label="Material Type"
            value={measurement.materialType}
            onChange={(v) => onChange("materialType", v)}
            options={materialOptions}
          />
          <SelectField
            label="Installation Type"
            value={measurement.installationType}
            onChange={(v) => onChange("installationType", v as SiteSurveyMeasurement["installationType"])}
            options={[["", "— Select —"], ...Object.entries(INSTALLATION_TYPE_LABEL)] as [string, string][]}
          />
          <MasterPickSelect
            label="Equipment Source"
            table="site_survey_report_equipment_sources"
            value={measurement.equipmentSource}
            onChange={(v) => onChange("equipmentSource", v)}
          />
          <SelectField
            label="Installed By"
            value={measurement.installedBy}
            onChange={(v) => onChange("installedBy", v as SiteSurveyMeasurement["installedBy"])}
            options={[["", "— Select —"], ...Object.entries(SURVEY_COMPANY_LABEL)] as [string, string][]}
          />
          <TextField
            label="Fixing Requirements (inc. any measurements)"
            value={measurement.fixingsRequired}
            onChange={(v) => onChange("fixingsRequired", v)}
            className="sm:col-span-2"
          />
          <TextField
            label="Equipment Required"
            value={measurement.equipmentDetail}
            onChange={(v) => onChange("equipmentDetail", v)}
            className="sm:col-span-2"
          />
          <YesNoField
            label="Are there any fixed visual obstructions?"
            value={measurement.existingVisualObstructions}
            onChange={(v) => onChange("existingVisualObstructions", v as SiteSurveyMeasurement["existingVisualObstructions"])}
          />
          <TextAreaField
            label="Description"
            value={measurement.existingVisualObstructionsDescription}
            onChange={(v) => onChange("existingVisualObstructionsDescription", v)}
          />
          <TextAreaField
            label="Measurement Notes"
            value={measurement.measurementNotes}
            onChange={(v) => onChange("measurementNotes", v)}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Apple Standards">
        <Grid>
          <SelectField
            label="Does the opportunity and system meet Apple standards?"
            value={measurement.appleStandardsMet}
            onChange={(v) => onChange("appleStandardsMet", v as SiteSurveyMeasurement["appleStandardsMet"])}
            options={[
              ["", "— Select —"],
              ["yes", "Yes"],
              ["no", "No"],
              ["modifications", "Only With Modifications"],
            ]}
          />
          <div />
          {measurement.appleStandardsMet === "modifications" && (
            <>
              <TextAreaField label="Reason" value={measurement.appleStandardsReason} onChange={(v) => onChange("appleStandardsReason", v)} />
              <TextAreaField
                label="Modification Required"
                value={measurement.appleStandardsModification}
                onChange={(v) => onChange("appleStandardsModification", v)}
              />
            </>
          )}
        </Grid>
      </Section>
      </div>
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

function NumberField({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: number | null;
  onChange?: (v: number | null) => void;
  /** Used for Material Width/Height -- calculated from Visual + Bleed, not directly editable. */
  readOnly?: boolean;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <input
        type="number"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={readOnly ? undefined : (e) => onChange?.(e.target.value === "" ? null : Number(e.target.value))}
        className={`w-full rounded-md border px-3 py-2 text-sm focus:outline-none ${
          readOnly ? "cursor-default border-line bg-surface-sunken text-ink-secondary" : "border-line-strong bg-surface text-ink focus:border-primary"
        }`}
      />
    </label>
  );
}

/** A free-text field with a <datalist> of existing values -- same pattern as LfgSiteWorkspaceClient.tsx's ComboEditField / the New Site form: autocomplete over what's already on file, typing a genuinely new value still works. */
function ComboField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  className?: string;
}) {
  const listId = `measurement-${label.replace(/\s+/g, "-").toLowerCase()}-options`;
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <input
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
      <datalist id={listId}>
        {options.map((v) => (
          <option key={v} value={v} />
        ))}
      </datalist>
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

function SelectField({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function YesNoField({ label, value, onChange, className }: { label: string; value: YesNo; onChange: (v: string) => void; className?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-xs font-medium text-ink-secondary">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      >
        <option value="">— Select —</option>
        <option value="yes">Yes</option>
        <option value="no">No</option>
      </select>
    </label>
  );
}
