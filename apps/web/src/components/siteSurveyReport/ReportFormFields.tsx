"use client";

import { FieldIndicator } from "./FieldIndicator";
import type { FieldSourceKey, FieldSources, SiteSurveyFormData, YesNo } from "@/lib/siteSurveyReport/types";

// The full ~26-field inspection form -- one component shared by DetailsStep
// (manual entry / "fill in the rest" after extraction) and, once the AI
// extraction milestone lands, ReviewStep (same fields, different
// surrounding chrome: an extraction-progress banner there vs. a plain "fill
// this in" heading here) -- rather than building the same field list twice.
// Sectioned to mirror the reference PDF's page 2 layout top to bottom: Site
// Information header block, On-site details + Site suitability (2-column,
// as in the reference), Store description, Installation details, Additional
// details.

export interface ReportHeaderFields {
  store_name: string;
  address: string;
  sfo_id: string;
  program: string;
  survey_date: string | null;
  surveyor_name: string;
}

interface Props {
  header: ReportHeaderFields;
  onHeaderChange: <K extends keyof ReportHeaderFields>(key: K, value: ReportHeaderFields[K]) => void;
  formData: SiteSurveyFormData;
  onFormDataChange: <K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) => void;
  fieldSources: FieldSources;
  /** Marks a field "user"-sourced the moment it's touched, once extraction exists. */
  onTouched: (key: FieldSourceKey) => void;
}

export function ReportFormFields({ header, onHeaderChange, formData, onFormDataChange, fieldSources, onTouched }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Section title="Site / Store Information">
        <Grid>
          <TextField
            label="Site / Store Name"
            value={header.store_name}
            onChange={(v) => {
              onHeaderChange("store_name", v);
              onTouched("store_name");
            }}
            source={fieldSources.store_name}
            className="sm:col-span-2"
          />
          <TextField
            label="Address"
            value={header.address}
            onChange={(v) => {
              onHeaderChange("address", v);
              onTouched("address");
            }}
            source={fieldSources.address}
            className="sm:col-span-2"
          />
          <TextField
            label="SFO ID"
            value={header.sfo_id}
            onChange={(v) => {
              onHeaderChange("sfo_id", v);
              onTouched("sfo_id");
            }}
            source={fieldSources.sfo_id}
          />
          <TextField
            label="Apple Program"
            value={header.program}
            onChange={(v) => {
              onHeaderChange("program", v);
              onTouched("program");
            }}
            source={fieldSources.program}
          />
        </Grid>
      </Section>

      <Section title="On-site Details">
        <Grid>
          <TextField
            label="Date of Inspection"
            type="date"
            value={header.survey_date ?? ""}
            onChange={(v) => {
              onHeaderChange("survey_date", v || null);
              onTouched("survey_date");
            }}
            source={fieldSources.survey_date}
          />
          <TextField
            label="Surveyor Details"
            value={header.surveyor_name}
            onChange={(v) => {
              onHeaderChange("surveyor_name", v);
              onTouched("surveyor_name");
            }}
            source={fieldSources.surveyor_name}
          />
          <TextField
            label="Store Person Contacted"
            value={formData.storePersonContacted}
            onChange={(v) => set(onFormDataChange, onTouched, "storePersonContacted", v)}
            source={fieldSources.storePersonContacted}
          />
          <TextField
            label="Printer"
            value={formData.printer}
            onChange={(v) => set(onFormDataChange, onTouched, "printer", v)}
            source={fieldSources.printer}
          />
        </Grid>
      </Section>

      <Section title="Site Suitability">
        <Grid>
          <YesNoField
            label="Does the site have high and uninterrupted visibility?"
            value={formData.siteVisibility}
            onChange={(v) => set(onFormDataChange, onTouched, "siteVisibility", v as YesNo)}
            source={fieldSources.siteVisibility}
          />
          <YesNoField
            label="Would this be considered a premium location?"
            value={formData.premiumLocation}
            onChange={(v) => set(onFormDataChange, onTouched, "premiumLocation", v as YesNo)}
            source={fieldSources.premiumLocation}
          />
          <TextAreaField
            label="Indicate potential issues with location"
            value={formData.potentialIssues}
            onChange={(v) => set(onFormDataChange, onTouched, "potentialIssues", v)}
            source={fieldSources.potentialIssues}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Store Description">
        <Grid>
          <TextAreaField
            label="Condition of silicon joins and edges"
            value={formData.siliconJoinsCondition}
            onChange={(v) => set(onFormDataChange, onTouched, "siliconJoinsCondition", v)}
            source={fieldSources.siliconJoinsCondition}
          />
          <TextAreaField
            label="Condition of Perspex cover for backlit"
            value={formData.perspexCondition}
            onChange={(v) => set(onFormDataChange, onTouched, "perspexCondition", v)}
            source={fieldSources.perspexCondition}
          />
          <TextAreaField
            label="Describe lighting for location / backlit potential"
            value={formData.lightingDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "lightingDescription", v)}
            source={fieldSources.lightingDescription}
            className="sm:col-span-2"
          />
          <TextAreaField
            label="Current artwork or store stickers on window"
            value={formData.existingCreative}
            onChange={(v) => set(onFormDataChange, onTouched, "existingCreative", v)}
            source={fieldSources.existingCreative}
          />
          <YesNoField
            label="Can existing creative be removed?"
            options={["yes", "no", ""] as const}
            value={formData.creativeRemovable}
            onChange={(v) => set(onFormDataChange, onTouched, "creativeRemovable", v as YesNo)}
            source={fieldSources.creativeRemovable}
            thirdOption="Not Applicable"
          />
          <TextAreaField
            label="Additional store observations"
            value={formData.additionalStoreNotes}
            onChange={(v) => set(onFormDataChange, onTouched, "additionalStoreNotes", v)}
            source={fieldSources.additionalStoreNotes}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Installation Details">
        <Grid>
          <TextField
            label="Time and date of installation"
            value={formData.installationDateTime}
            onChange={(v) => set(onFormDataChange, onTouched, "installationDateTime", v)}
            source={fieldSources.installationDateTime}
          />
          <TextField
            label="Delivery times into stores"
            value={formData.deliveryTimes}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryTimes", v)}
            source={fieldSources.deliveryTimes}
          />
          <YesNoField
            label="Are mall or work permits required?"
            options={["yes", "no", "unknown"] as const}
            value={formData.permitRequired}
            onChange={(v) => set(onFormDataChange, onTouched, "permitRequired", v as YesNo)}
            source={fieldSources.permitRequired}
            thirdOption="Unknown"
          />
          <TextAreaField
            label="Permit details (if yes)"
            value={formData.permitDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "permitDetails", v)}
            source={fieldSources.permitDetails}
          />
        </Grid>
      </Section>

      <Section title="Additional Details">
        <TextAreaField
          label="Please specify any general information regarding the store that may be of interest"
          value={formData.generalNotes}
          onChange={(v) => set(onFormDataChange, onTouched, "generalNotes", v)}
          source={fieldSources.generalNotes}
          className="w-full"
        />
      </Section>
    </div>
  );
}

function set<K extends keyof SiteSurveyFormData>(
  onFormDataChange: Props["onFormDataChange"],
  onTouched: Props["onTouched"],
  key: K,
  value: SiteSurveyFormData[K]
) {
  onFormDataChange(key, value);
  onTouched(key);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line">
      <div className="rounded-t-lg border-b border-line bg-surface-sunken px-4 py-2.5">
        <h2 className="text-xs font-bold uppercase tracking-wide text-ink-secondary">{title}</h2>
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>;
}

function FieldLabel({ label, source }: { label: string; source: Props["fieldSources"][FieldSourceKey] }) {
  return (
    <span className="flex items-center gap-1.5 text-xs font-medium text-ink-secondary">
      {label}
      <FieldIndicator source={source} />
    </span>
  );
}

function TextField({
  label,
  value,
  onChange,
  source,
  type = "text",
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source: Props["fieldSources"][FieldSourceKey];
  type?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
      <input
        type={type}
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
  source,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source: Props["fieldSources"][FieldSourceKey];
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-y rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function YesNoField({
  label,
  value,
  onChange,
  source,
  options = ["yes", "no", ""] as const,
  thirdOption,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source: Props["fieldSources"][FieldSourceKey];
  options?: readonly string[];
  thirdOption?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <FieldLabel label={label} source={source} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none"
      >
        <option value="">— Select —</option>
        {options
          .filter((o) => o !== "")
          .map((o) => (
            <option key={o} value={o}>
              {o === "yes" ? "Yes" : o === "no" ? "No" : (thirdOption ?? o)}
            </option>
          ))}
      </select>
    </label>
  );
}
