"use client";

import { ReportFormFields, type ReportHeaderFields } from "./ReportFormFields";
import type { FieldSourceKey, FieldSources, SiteSurveyFormData } from "@/lib/siteSurveyReport/types";

// Thin "manual entry" chrome around the shared <ReportFormFields> --
// once AI extraction (milestone 4) lands, a <ReviewStep> wraps the exact
// same component with an extraction-progress banner instead of this plain
// heading, rather than duplicating the ~26-field form a second time.

interface Props {
  header: ReportHeaderFields;
  onHeaderChange: <K extends keyof ReportHeaderFields>(key: K, value: ReportHeaderFields[K]) => void;
  formData: SiteSurveyFormData;
  onFormDataChange: <K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) => void;
  fieldSources: FieldSources;
  onTouched: (key: FieldSourceKey) => void;
}

export function DetailsStep({ header, onHeaderChange, formData, onFormDataChange, fieldSources, onTouched }: Props) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-ink-secondary">
        Work through the sections below at your own pace — each one opens on its own, and only what&apos;s still blank needs
        filling in.
      </p>
      <ReportFormFields
        header={header}
        onHeaderChange={onHeaderChange}
        formData={formData}
        onFormDataChange={onFormDataChange}
        fieldSources={fieldSources}
        onTouched={onTouched}
      />
    </div>
  );
}
