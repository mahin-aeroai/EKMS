"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import { useUserRole, canWrite } from "@/lib/UserRoleContext";
import { FormDataFields } from "./ReportFormFields";
import { emptyFormData, type SiteSurveyFormData } from "@/lib/siteSurveyReport/types";

// "Default Answers" -- a one-time settings page for the ~66-field Complete
// Details form's own answers, reusing the exact same section components
// (FormDataFields, split out of ReportFormFields.tsx for this reason) so a
// person configuring their defaults sees the identical fields/labels they'll
// later fill in per-report. Saved to the single-row
// site_survey_report_field_defaults table (see that migration's header
// comment for why it's a singleton). Every new MANUAL report pre-fills from
// this row at creation time (SiteSurveyReportsListClient.tsx), and the
// Complete Details / Review steps offer an "Apply saved defaults" action
// that pulls this in on demand, merging only into fields still blank.

export function SiteSurveyReportDefaultsClient() {
  const { toast } = useToast();
  const role = useUserRole();
  const [formData, setFormData] = useState<SiteSurveyFormData | null>(null);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ personnel: true });
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from("site_survey_report_field_defaults")
      .select("form_data, updated_at")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        setFormData({ ...emptyFormData(), ...((data?.form_data as Partial<SiteSurveyFormData>) ?? {}) });
        setUpdatedAt(data?.updated_at ?? null);
      });
  }, []);

  function update<K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) {
    setFormData((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function handleSave() {
    if (!formData) return;
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("site_survey_report_field_defaults")
      .upsert({ id: true, form_data: formData, updated_by: userData?.user?.id ?? null });
    setSaving(false);
    if (error) {
      toast("danger", "Couldn't save your defaults");
      return;
    }
    setUpdatedAt(new Date().toISOString());
    toast("success", "Saved — new reports will start pre-filled with these answers");
  }

  if (!formData) {
    return <p className="py-10 text-center text-sm text-ink-muted">Loading your saved defaults…</p>;
  }

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Site Survey Reports", href: "/workspaces/site-survey-report" },
          { label: "Default Answers" },
        ]}
      />

      <div className="mt-4 flex flex-col gap-3 border-b border-line pb-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-tint text-primary">
            <Sparkles size={18} />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-ink">Default Answers</h1>
            <p className="mt-0.5 max-w-2xl text-xs text-ink-secondary">
              Fill in the answers that stay the same across most of your reports — leave anything site-specific blank. Every
              new manually-started report begins pre-filled with these, and you can pull them into any existing report with
              &quot;Apply saved defaults&quot;. Nothing here is ever forced onto a field you&apos;ve already answered.
            </p>
            {updatedAt && <p className="mt-1 text-[11px] text-ink-muted">Last saved {new Date(updatedAt).toLocaleString()}</p>}
          </div>
        </div>
        <Link
          href="/workspaces/site-survey-report"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-line-strong px-3 py-2 text-sm font-medium text-ink-secondary hover:bg-surface-sunken sm:w-auto"
        >
          <ArrowLeft size={14} /> Back to Site Survey Reports
        </Link>
      </div>

      <div className="mt-4 flex flex-col gap-2.5">
        <FormDataFields formData={formData} onFormDataChange={update} openSections={openSections} onToggleSection={toggleSection} />
      </div>

      <div className="mt-6 flex justify-end border-t border-line pt-4">
        <Button onClick={handleSave} loading={saving} disabled={!canWrite(role)}>
          Save Defaults
        </Button>
      </div>
    </div>
  );
}
