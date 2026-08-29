"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  Eye,
  FileCheck2,
  HardHat,
  Image as ImageIcon,
  Info,
  LayoutGrid,
  MapPin,
  Sparkles,
  Store,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FieldIndicator } from "./FieldIndicator";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { supabase } from "@/lib/supabase";
import type { FieldSourceKey, FieldSources, SiteSurveyFormData } from "@/lib/siteSurveyReport/types";
import { emptyFormData } from "@/lib/siteSurveyReport/types";

// The full ~78-field inspection form -- shared by DetailsStep (manual entry
// / "fill in the rest" after extraction), ReviewStep (same fields, an
// extraction-progress banner instead of a plain heading), and the "Default
// Answers" settings page (SiteSurveyReportDefaultsClient.tsx, via the
// FormDataFields export below, header section omitted).
//
// Presented as a stack of rounded, shadowed "cards" (one per section --
// LFG Connect's own card look, see LfgSiteCardGrid.tsx: rounded-[20px]
// border shadow-2) rather than the flat bordered accordion this used
// before -- every section still starts COLLAPSED except the first, so the
// whole form is "visible in one shot" as a stack of card headers with a
// filled-count badge. Inside an open card, every field is one compact,
// landscape (label-left, control-right) ROW rather than a multi-column
// grid -- this mirrors the reference Apple PDF's own row-per-question
// table layout. A Yes/No question and its "if Yes/No, give details" follow
// -up (two separate fields/rows before) are now ONE row: real radio
// buttons (native <input type="radio">, tinted via accent-color so the
// selected one reads as a filled circle -- the same visual the reference
// PDF uses) plus the detail input inline, right where the reference PDF
// puts it. Field labels/inputs stay small (text-[11px]/text-xs) and
// tightly padded throughout, matching this app's own existing compact
// patterns (Comments.tsx, WorkflowTimeline.tsx, etc).

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
  const { toast } = useToast();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({ site: true });
  const defaultsRef = useRef<SiteSurveyFormData | null>(null);
  const [defaultsAvailable, setDefaultsAvailable] = useState(false);
  const [applyingDefaults, setApplyingDefaults] = useState(false);

  useEffect(() => {
    supabase
      .from("site_survey_report_field_defaults")
      .select("form_data")
      .eq("id", true)
      .maybeSingle()
      .then(({ data }) => {
        const fd = { ...emptyFormData(), ...((data?.form_data as Partial<SiteSurveyFormData>) ?? {}) };
        defaultsRef.current = fd;
        setDefaultsAvailable((Object.keys(fd) as (keyof SiteSurveyFormData)[]).some((k) => isFilled(fd[k])));
      });
  }, []);

  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function expandAll(open: boolean) {
    setOpenSections(Object.fromEntries(SECTION_KEYS.map((k) => [k, open])));
  }

  function handleApplyDefaults() {
    const defaults = defaultsRef.current;
    if (!defaults) return;
    setApplyingDefaults(true);
    let count = 0;
    (Object.keys(defaults) as (keyof SiteSurveyFormData)[]).forEach((key) => {
      const current = formData[key];
      const def = defaults[key];
      if (!isFilled(current) && isFilled(def)) {
        onFormDataChange(key, def);
        onTouched(key);
        count++;
      }
    });
    setApplyingDefaults(false);
    toast(count > 0 ? "success" : "info", count > 0 ? `Filled ${count} blank field${count === 1 ? "" : "s"} from your saved defaults` : "Every defaultable field is already filled in");
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface-sunken px-3 py-2">
        <p className="text-[11px] text-ink-secondary">
          Tap a card to open it — only what&apos;s still blank needs your input. Set up your{" "}
          <a href="/workspaces/site-survey-report/defaults" target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
            saved defaults
          </a>{" "}
          once and most of this fills itself in.
        </p>
        <div className="flex shrink-0 items-center gap-1.5">
          {defaultsAvailable && (
            <Button variant="secondary" size="sm" onClick={handleApplyDefaults} loading={applyingDefaults}>
              <Sparkles size={12} /> Apply saved defaults
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => expandAll(true)}>
            Expand all
          </Button>
          <Button variant="ghost" size="sm" onClick={() => expandAll(false)}>
            Collapse all
          </Button>
        </div>
      </div>

      <SurveyCard
        sectionKey="site"
        title="Site / Store Information"
        icon={MapPin}
        color="primary"
        filled={countFilled([header.store_name, header.address, header.sfo_id, header.program, header.survey_date, header.surveyor_name])}
        total={6}
        open={!!openSections.site}
        onToggle={toggleSection}
      >
        <TextRow
          label="Site / Store Name"
          value={header.store_name}
          onChange={(v) => {
            onHeaderChange("store_name", v);
            onTouched("store_name");
          }}
          source={fieldSources.store_name}
        />
        <TextRow
          label="Address"
          value={header.address}
          onChange={(v) => {
            onHeaderChange("address", v);
            onTouched("address");
          }}
          source={fieldSources.address}
        />
        <TextRow
          label="SFO ID"
          value={header.sfo_id}
          onChange={(v) => {
            onHeaderChange("sfo_id", v);
            onTouched("sfo_id");
          }}
          source={fieldSources.sfo_id}
        />
        <TextRow
          label="Apple Program"
          value={header.program}
          onChange={(v) => {
            onHeaderChange("program", v);
            onTouched("program");
          }}
          source={fieldSources.program}
        />
        <TextRow
          label="Date of Inspection"
          type="date"
          value={header.survey_date ?? ""}
          onChange={(v) => {
            onHeaderChange("survey_date", v || null);
            onTouched("survey_date");
          }}
          source={fieldSources.survey_date}
        />
        <TextRow
          label="Surveyor's Details"
          value={header.surveyor_name}
          onChange={(v) => {
            onHeaderChange("surveyor_name", v);
            onTouched("surveyor_name");
          }}
          source={fieldSources.surveyor_name}
        />
      </SurveyCard>

      <FormDataFields
        formData={formData}
        onFormDataChange={onFormDataChange}
        fieldSources={fieldSources}
        onTouched={onTouched}
        openSections={openSections}
        onToggleSection={toggleSection}
      />
    </div>
  );
}

/**
 * Every formData-driven section, WITHOUT the header (Site/Store
 * Information) section above -- reused as-is by the "Default Answers"
 * settings page (SiteSurveyReportDefaultsClient.tsx), where `fieldSources`/
 * `onTouched` are omitted (no AI-extraction concept applies to a saved
 * template) and section open/close state is owned by the caller.
 */
export function FormDataFields({
  formData,
  onFormDataChange,
  fieldSources,
  onTouched,
  openSections,
  onToggleSection,
}: {
  formData: SiteSurveyFormData;
  onFormDataChange: <K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) => void;
  fieldSources?: FieldSources;
  onTouched?: (key: FieldSourceKey) => void;
  openSections: Record<string, boolean>;
  onToggleSection: (key: string) => void;
}) {
  const src = fieldSources ?? {};
  // Shorthand bound to this call's onFormDataChange/onTouched, so every
  // field below just does `f("key", value)` instead of repeating both.
  const f = <K extends keyof SiteSurveyFormData>(key: K, value: SiteSurveyFormData[K]) => set(onFormDataChange, onTouched, key, value);

  return (
    <>
      <SurveyCard
        sectionKey="personnel"
        title="On-site Personnel Details"
        icon={Users}
        color="info"
        filled={countFilledKeys(formData, PERSONNEL_KEYS)}
        total={PERSONNEL_KEYS.length}
        open={!!openSections.personnel}
        onToggle={onToggleSection}
      >
        <TextRow label="Apple Representative" value={formData.appleRepresentative} onChange={(v) => f("appleRepresentative", v)} source={src.appleRepresentative} />
        <TextRow label="Retailer Representative" value={formData.retailerRepresentative} onChange={(v) => f("retailerRepresentative", v)} source={src.retailerRepresentative} />
        <TextRow label="Store Person Contacted" value={formData.storePersonContacted} onChange={(v) => f("storePersonContacted", v)} source={src.storePersonContacted} />
        <TextRow label="Store Contact Number" value={formData.storeContactNumber} onChange={(v) => f("storeContactNumber", v)} source={src.storeContactNumber} />
        <TextRow label="Printer / Survey Company" value={formData.printer} onChange={(v) => f("printer", v)} source={src.printer} />
      </SurveyCard>

      <SurveyCard
        sectionKey="store"
        title="Store Description"
        icon={Store}
        color="success"
        filled={countFilledKeys(formData, STORE_DESCRIPTION_KEYS)}
        total={STORE_DESCRIPTION_KEYS.length}
        open={!!openSections.store}
        onToggle={onToggleSection}
      >
        <SelectRow
          label="Location of Store"
          value={formData.storeLocationType}
          onChange={(v) => f("storeLocationType", v as SiteSurveyFormData["storeLocationType"])}
          source={src.storeLocationType}
          options={[
            ["", "— Select —"],
            ["mall", "Mall"],
            ["retail_high_street", "Retail High Street"],
            ["retail_park", "Retail Park"],
            ["other", "Other"],
          ]}
        />
        <TextRow label="If Other, please specify" value={formData.storeLocationOther} onChange={(v) => f("storeLocationOther", v)} source={src.storeLocationOther} />
        <TextRow label="Entrances — Into the Mall" value={formData.entrancesIntoMall} onChange={(v) => f("entrancesIntoMall", v)} source={src.entrancesIntoMall} />
        <TextRow label="Entrances — Into the Store" value={formData.entrancesIntoStore} onChange={(v) => f("entrancesIntoStore", v)} source={src.entrancesIntoStore} />
        <TextRow label="Floors — Within the Mall" value={formData.floorsWithinMall} onChange={(v) => f("floorsWithinMall", v)} source={src.floorsWithinMall} />
        <TextRow label="Floors — Within the Store" value={formData.floorsWithinStore} onChange={(v) => f("floorsWithinStore", v)} source={src.floorsWithinStore} />
        <TextRow label="Floor Apple Program Is On" value={formData.floorApplProgramOn} onChange={(v) => f("floorApplProgramOn", v)} source={src.floorApplProgramOn} />
        <YesNoRow
          name="storeOpenPlan"
          label="Is the store open plan?"
          value={formData.storeOpenPlan}
          onChange={(v) => f("storeOpenPlan", v as SiteSurveyFormData["storeOpenPlan"])}
          source={src.storeOpenPlan}
          detail={{ value: formData.openPlanLayoutDescription, onChange: (v) => f("openPlanLayoutDescription", v), source: src.openPlanLayoutDescription, placeholder: "If No, describe layout" }}
        />
        <TextRow label="Apple Program Position vs. Main Entrance" value={formData.applProgramPositionEntrance} onChange={(v) => f("applProgramPositionEntrance", v)} source={src.applProgramPositionEntrance} />
        <TextRow label="Store Address" value={formData.siteStoreAddress} onChange={(v) => f("siteStoreAddress", v)} source={src.siteStoreAddress} />
        <TextRow label="Store Contact Details" value={formData.storeContactDetails} onChange={(v) => f("storeContactDetails", v)} source={src.storeContactDetails} />
        <TextRow label="Condition of silicon joins/edges" value={formData.siliconJoinsCondition} onChange={(v) => f("siliconJoinsCondition", v)} source={src.siliconJoinsCondition} />
        <TextRow label="Condition of Perspex cover" value={formData.perspexCondition} onChange={(v) => f("perspexCondition", v)} source={src.perspexCondition} />
        <TextRow label="Lighting / backlit potential" value={formData.lightingDescription} onChange={(v) => f("lightingDescription", v)} source={src.lightingDescription} />
        <TextRow label="Current artwork / store stickers" value={formData.existingCreative} onChange={(v) => f("existingCreative", v)} source={src.existingCreative} />
        <YesNoRow
          name="creativeRemovable"
          label="Can existing creative be removed?"
          value={formData.creativeRemovable}
          onChange={(v) => f("creativeRemovable", v as SiteSurveyFormData["creativeRemovable"])}
          source={src.creativeRemovable}
        />
        <TextAreaRow label="Additional store observations" value={formData.additionalStoreNotes} onChange={(v) => f("additionalStoreNotes", v)} source={src.additionalStoreNotes} />
      </SurveyCard>

      <SurveyCard
        sectionKey="install"
        title="Installing on Site"
        icon={CalendarClock}
        color="warning"
        filled={countFilledKeys(formData, INSTALL_KEYS)}
        total={INSTALL_KEYS.length}
        open={!!openSections.install}
        onToggle={onToggleSection}
      >
        <div className="flex flex-col rounded-lg border border-line bg-surface px-2.5 py-1.5">
          <span className="mb-1 text-[11px] font-medium text-ink-secondary">Store Opening Times</span>
          <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {(
              [
                ["openingTimeMon", "Mon"],
                ["openingTimeTue", "Tue"],
                ["openingTimeWed", "Wed"],
                ["openingTimeThu", "Thu"],
                ["openingTimeFri", "Fri"],
                ["openingTimeSat", "Sat"],
                ["openingTimeSun", "Sun"],
              ] as const
            ).map(([key, day]) => (
              <label key={key} className="flex flex-col gap-0.5">
                <span className="text-[10px] font-medium text-ink-muted">{day}</span>
                <input
                  value={formData[key]}
                  onChange={(e) => f(key, e.target.value)}
                  className="w-full rounded border border-line-strong bg-surface px-1.5 py-1 text-[11px] text-ink focus:border-primary focus:outline-none"
                />
              </label>
            ))}
          </div>
        </div>
        <YesNoRow
          name="installOutsideHours"
          label="Install outside store opening hours?"
          value={formData.installOutsideHours}
          onChange={(v) => f("installOutsideHours", v as SiteSurveyFormData["installOutsideHours"])}
          source={src.installOutsideHours}
          detail={{ value: formData.installOutsideHoursDetails, onChange: (v) => f("installOutsideHoursDetails", v), source: src.installOutsideHoursDetails, placeholder: "If Yes, give details" }}
        />
        <YesNoRow
          name="retailerPreferredInstallTime"
          label="Retailer has preferred install days/time?"
          value={formData.retailerPreferredInstallTime}
          onChange={(v) => f("retailerPreferredInstallTime", v as SiteSurveyFormData["retailerPreferredInstallTime"])}
          source={src.retailerPreferredInstallTime}
          detail={{
            value: formData.retailerPreferredInstallDetails,
            onChange: (v) => f("retailerPreferredInstallDetails", v),
            source: src.retailerPreferredInstallDetails,
            placeholder: "If Yes, give details",
          }}
        />
        <TextRow label="Time and date of installation" value={formData.installationDateTime} onChange={(v) => f("installationDateTime", v)} source={src.installationDateTime} />
        <YesNoRow
          name="permitRequired"
          label="Are work permits required?"
          value={formData.permitRequired}
          onChange={(v) => f("permitRequired", v as SiteSurveyFormData["permitRequired"])}
          source={src.permitRequired}
          options={[
            { value: "yes", label: "Yes" },
            { value: "no", label: "No" },
            { value: "unknown", label: "Unknown" },
          ]}
          detail={{ value: formData.permitDetails, onChange: (v) => f("permitDetails", v), source: src.permitDetails, placeholder: "Permit details (if Yes)" }}
        />
      </SurveyCard>

      <SurveyCard
        sectionKey="delivery"
        title="Deliveries to Store"
        icon={Truck}
        color="ai"
        filled={countFilledKeys(formData, DELIVERY_KEYS)}
        total={DELIVERY_KEYS.length}
        open={!!openSections.delivery}
        onToggle={onToggleSection}
      >
        <TextRow label="Store Contact Name and Number" value={formData.deliveryContactNameNumber} onChange={(v) => f("deliveryContactNameNumber", v)} source={src.deliveryContactNameNumber} />
        <YesNoRow
          name="deliveryAddressSameAsStore"
          label="Delivery address same as store?"
          value={formData.deliveryAddressSameAsStore}
          onChange={(v) => f("deliveryAddressSameAsStore", v as SiteSurveyFormData["deliveryAddressSameAsStore"])}
          source={src.deliveryAddressSameAsStore}
          detail={{ value: formData.deliveryAddress, onChange: (v) => f("deliveryAddress", v), source: src.deliveryAddress, placeholder: "If No, give address" }}
        />
        <TextRow label="Day/time deliveries can be made" value={formData.deliveryTimes} onChange={(v) => f("deliveryTimes", v)} source={src.deliveryTimes} />
        <TextRow label="Other delivery comments" value={formData.deliveryOtherComments} onChange={(v) => f("deliveryOtherComments", v)} source={src.deliveryOtherComments} />
      </SurveyCard>

      <SurveyCard
        sectionKey="general"
        title="General Site Information"
        icon={Info}
        color="info"
        filled={countFilledKeys(formData, GENERAL_KEYS)}
        total={GENERAL_KEYS.length}
        open={!!openSections.general}
        onToggle={onToggleSection}
      >
        <YesNoRow
          name="weatherAffectsInstall"
          label="Will weather affect the install?"
          value={formData.weatherAffectsInstall}
          onChange={(v) => f("weatherAffectsInstall", v as SiteSurveyFormData["weatherAffectsInstall"])}
          source={src.weatherAffectsInstall}
          detail={{ value: formData.weatherAffectsInstallDetails, onChange: (v) => f("weatherAffectsInstallDetails", v), source: src.weatherAffectsInstallDetails, placeholder: "If Yes, give details" }}
        />
        <YesNoRow
          name="allOpportunitiesSurveyed"
          label="All possible opportunities surveyed?"
          value={formData.allOpportunitiesSurveyed}
          onChange={(v) => f("allOpportunitiesSurveyed", v as SiteSurveyFormData["allOpportunitiesSurveyed"])}
          source={src.allOpportunitiesSurveyed}
          detail={{
            value: formData.allOpportunitiesSurveyedReason,
            onChange: (v) => f("allOpportunitiesSurveyedReason", v),
            source: src.allOpportunitiesSurveyedReason,
            placeholder: "If No, give reason",
          }}
        />
        <TextAreaRow label="Any other helpful information" value={formData.generalNotes} onChange={(v) => f("generalNotes", v)} source={src.generalNotes} />
      </SurveyCard>

      <SurveyCard
        sectionKey="suitability"
        title="Site Suitability / Installation Details"
        icon={Eye}
        color="success"
        filled={countFilledKeys(formData, SUITABILITY_KEYS)}
        total={SUITABILITY_KEYS.length}
        open={!!openSections.suitability}
        onToggle={onToggleSection}
      >
        <YesNoRow
          name="siteVisibility"
          label="Highly visible opportunity?"
          value={formData.siteVisibility}
          onChange={(v) => f("siteVisibility", v as SiteSurveyFormData["siteVisibility"])}
          source={src.siteVisibility}
          detail={{ value: formData.siteVisibilityDescription, onChange: (v) => f("siteVisibilityDescription", v), source: src.siteVisibilityDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="premiumLocation"
          label="Is this a premium site?"
          value={formData.premiumLocation}
          onChange={(v) => f("premiumLocation", v as SiteSurveyFormData["premiumLocation"])}
          source={src.premiumLocation}
          detail={{ value: formData.premiumLocationDescription, onChange: (v) => f("premiumLocationDescription", v), source: src.premiumLocationDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="installationTimeFlexible"
          label="Is installation time flexible?"
          value={formData.installationTimeFlexible}
          onChange={(v) => f("installationTimeFlexible", v as SiteSurveyFormData["installationTimeFlexible"])}
          source={src.installationTimeFlexible}
          detail={{
            value: formData.installationTimeFlexibleDescription,
            onChange: (v) => f("installationTimeFlexibleDescription", v),
            source: src.installationTimeFlexibleDescription,
            placeholder: "Description",
          }}
        />
        <TextAreaRow label="Potential issues with location" value={formData.potentialIssues} onChange={(v) => f("potentialIssues", v)} source={src.potentialIssues} />
      </SurveyCard>

      <SurveyCard
        sectionKey="details"
        title="Site Details"
        icon={LayoutGrid}
        color="primary"
        filled={countFilledKeys(formData, SITE_DETAILS_KEYS)}
        total={SITE_DETAILS_KEYS.length}
        open={!!openSections.details}
        onToggle={onToggleSection}
      >
        <TextRow label="Maximum working space" value={formData.maxWorkingSpace} onChange={(v) => f("maxWorkingSpace", v)} source={src.maxWorkingSpace} />
        <YesNoRow
          name="accessEquipmentAvailable"
          label="Access equipment available on site?"
          value={formData.accessEquipmentAvailable}
          onChange={(v) => f("accessEquipmentAvailable", v as SiteSurveyFormData["accessEquipmentAvailable"])}
          source={src.accessEquipmentAvailable}
          detail={{ value: formData.accessEquipmentDescription, onChange: (v) => f("accessEquipmentDescription", v), source: src.accessEquipmentDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="poweredAccessUsed"
          label="Powered access to be used?"
          value={formData.poweredAccessUsed}
          onChange={(v) => f("poweredAccessUsed", v as SiteSurveyFormData["poweredAccessUsed"])}
          source={src.poweredAccessUsed}
          detail={{ value: formData.poweredAccessDescription, onChange: (v) => f("poweredAccessDescription", v), source: src.poweredAccessDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="accessIssues"
          label="Any access issues?"
          value={formData.accessIssues}
          onChange={(v) => f("accessIssues", v as SiteSurveyFormData["accessIssues"])}
          source={src.accessIssues}
          detail={{ value: formData.accessIssuesDescription, onChange: (v) => f("accessIssuesDescription", v), source: src.accessIssuesDescription, placeholder: "Description" }}
        />
        <SelectRow
          label="Permanent or temporary site?"
          value={formData.siteType}
          onChange={(v) => f("siteType", v as SiteSurveyFormData["siteType"])}
          source={src.siteType}
          options={[
            ["", "— Select —"],
            ["permanent", "Permanent"],
            ["temporary", "Temporary"],
          ]}
        />
        <TextRow label="If temporary, how long available?" value={formData.siteTypeDuration} onChange={(v) => f("siteTypeDuration", v)} source={src.siteTypeDuration} />
        <YesNoRow
          name="competitorAdvertising"
          label="Competitor advertising nearby?"
          value={formData.competitorAdvertising}
          onChange={(v) => f("competitorAdvertising", v as SiteSurveyFormData["competitorAdvertising"])}
          source={src.competitorAdvertising}
          detail={{
            value: formData.competitorAdvertisingDescription,
            onChange: (v) => f("competitorAdvertisingDescription", v),
            source: src.competitorAdvertisingDescription,
            placeholder: "Description",
          }}
        />
        <TextAreaRow label="General info for a successful install" value={formData.generalInstallInfo} onChange={(v) => f("generalInstallInfo", v)} source={src.generalInstallInfo} />
      </SurveyCard>

      <SurveyCard
        sectionKey="safety"
        title="Safety"
        icon={HardHat}
        color="danger"
        filled={countFilledKeys(formData, SAFETY_KEYS)}
        total={SAFETY_KEYS.length}
        open={!!openSections.safety}
        onToggle={onToggleSection}
      >
        <YesNoRow
          name="siteSafeForInstall"
          label="Is the site safe for installation?"
          value={formData.siteSafeForInstall}
          onChange={(v) => f("siteSafeForInstall", v as SiteSurveyFormData["siteSafeForInstall"])}
          source={src.siteSafeForInstall}
          detail={{ value: formData.siteSafeDescription, onChange: (v) => f("siteSafeDescription", v), source: src.siteSafeDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="safetyConcerns"
          label="Any specific safety concerns?"
          value={formData.safetyConcerns}
          onChange={(v) => f("safetyConcerns", v as SiteSurveyFormData["safetyConcerns"])}
          source={src.safetyConcerns}
          detail={{ value: formData.safetyConcernsDetails, onChange: (v) => f("safetyConcernsDetails", v), source: src.safetyConcernsDetails, placeholder: "Details" }}
        />
        <YesNoRow
          name="safetyEquipmentRequired"
          label="Specific safety equipment required?"
          value={formData.safetyEquipmentRequired}
          onChange={(v) => f("safetyEquipmentRequired", v as SiteSurveyFormData["safetyEquipmentRequired"])}
          source={src.safetyEquipmentRequired}
          detail={{ value: formData.safetyEquipmentDetails, onChange: (v) => f("safetyEquipmentDetails", v), source: src.safetyEquipmentDetails, placeholder: "Details" }}
        />
      </SurveyCard>

      <SurveyCard
        sectionKey="graphics"
        title="Graphics"
        icon={ImageIcon}
        color="ai"
        filled={countFilledKeys(formData, GRAPHICS_KEYS)}
        total={GRAPHICS_KEYS.length}
        open={!!openSections.graphics}
        onToggle={onToggleSection}
      >
        <YesNoRow
          name="graffitiRisk"
          label="At risk from graffiti?"
          value={formData.graffitiRisk}
          onChange={(v) => f("graffitiRisk", v as SiteSurveyFormData["graffitiRisk"])}
          source={src.graffitiRisk}
          detail={{ value: formData.graffitiRiskDescription, onChange: (v) => f("graffitiRiskDescription", v), source: src.graffitiRiskDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="extraLightingRequired"
          label="Extra lighting for night viewing?"
          value={formData.extraLightingRequired}
          onChange={(v) => f("extraLightingRequired", v as SiteSurveyFormData["extraLightingRequired"])}
          source={src.extraLightingRequired}
          detail={{ value: formData.extraLightingDescription, onChange: (v) => f("extraLightingDescription", v), source: src.extraLightingDescription, placeholder: "Description" }}
        />
        <YesNoRow
          name="graphicsCutoutRequired"
          label="Cutout required for the graphics?"
          value={formData.graphicsCutoutRequired}
          onChange={(v) => f("graphicsCutoutRequired", v as SiteSurveyFormData["graphicsCutoutRequired"])}
          source={src.graphicsCutoutRequired}
          detail={{ value: formData.graphicsCutoutDescription, onChange: (v) => f("graphicsCutoutDescription", v), source: src.graphicsCutoutDescription, placeholder: "Description" }}
        />
        <TextAreaRow label="Any other graphics information" value={formData.graphicsOtherInfo} onChange={(v) => f("graphicsOtherInfo", v)} source={src.graphicsOtherInfo} />
      </SurveyCard>

      <SurveyCard
        sectionKey="approvals"
        title="Approvals"
        icon={FileCheck2}
        color="warning"
        filled={countFilledKeys(formData, APPROVALS_KEYS)}
        total={APPROVALS_KEYS.length}
        open={!!openSections.approvals}
        onToggle={onToggleSection}
      >
        <YesNoRow
          name="specialApprovalsNeeded"
          label="Does the store need special approvals?"
          value={formData.specialApprovalsNeeded}
          onChange={(v) => f("specialApprovalsNeeded", v as SiteSurveyFormData["specialApprovalsNeeded"])}
          source={src.specialApprovalsNeeded}
          detail={{ value: formData.specialApprovalsDetails, onChange: (v) => f("specialApprovalsDetails", v), source: src.specialApprovalsDetails, placeholder: "If Yes, give details" }}
        />
        <YesNoRow
          name="chainCentralApprovalNeeded"
          label="Chain store — central team approval needed?"
          value={formData.chainCentralApprovalNeeded}
          onChange={(v) => f("chainCentralApprovalNeeded", v as SiteSurveyFormData["chainCentralApprovalNeeded"])}
          source={src.chainCentralApprovalNeeded}
          detail={{ value: formData.chainCentralApprovalReason, onChange: (v) => f("chainCentralApprovalReason", v), source: src.chainCentralApprovalReason, placeholder: "If No, give reason" }}
        />
        <TextAreaRow label="Any other helpful information" value={formData.approvalsOtherInfo} onChange={(v) => f("approvalsOtherInfo", v)} source={src.approvalsOtherInfo} />
      </SurveyCard>

      {/*
        Opportunity Information -- matches the reference PDF's own page
        order (right after Approvals, before the photo-survey pages).
        Filled ONCE here and shared across every site in this report (see
        SiteSurveyFormData's own header comment) rather than re-typed per
        site on the Measurement step -- MeasurementStep.tsx/SiteCard no
        longer has its own copy of these fields.
      */}
      <SurveyCard
        sectionKey="opportunity"
        title="Opportunity Information"
        icon={Tag}
        color="primary"
        filled={countFilledKeys(formData, OPPORTUNITY_KEYS)}
        total={OPPORTUNITY_KEYS.length}
        open={!!openSections.opportunity}
        onToggle={onToggleSection}
      >
        <TextRow label="Opportunity Name" value={formData.opportunityName} onChange={(v) => f("opportunityName", v)} source={src.opportunityName} />
        <SelectRow
          label="Opportunity Type"
          value={formData.opportunityType}
          onChange={(v) => f("opportunityType", v as SiteSurveyFormData["opportunityType"])}
          source={src.opportunityType}
          options={[
            ["", "— Select —"],
            ["individual_window", "Individual Window"],
            ["window_vinyl", "Window Vinyl"],
            ["banner", "Banner"],
            ["light_box", "Light Box"],
            ["glass_facade", "Glass Façade"],
            ["existing_graphic", "Existing Graphic"],
            ["other", "Other"],
          ]}
        />
        <TextRow label="Opportunity Type — if Other, please specify" value={formData.opportunityTypeOther} onChange={(v) => f("opportunityTypeOther", v)} source={src.opportunityTypeOther} />
        <TextRow label="Location" value={formData.opportunityLocation} onChange={(v) => f("opportunityLocation", v)} source={src.opportunityLocation} />
        <TextRow label="Store / Facade Area" value={formData.storeFacadeArea} onChange={(v) => f("storeFacadeArea", v)} source={src.storeFacadeArea} />
        <TextRow label="Apple Program Position" value={formData.appleProgramPosition} onChange={(v) => f("appleProgramPosition", v)} source={src.appleProgramPosition} />
        <TextAreaRow label="Description" value={formData.opportunityDescription} onChange={(v) => f("opportunityDescription", v)} source={src.opportunityDescription} />
        <TextRow
          label="Existing Material Type (if a banner/graphic already exists)"
          value={formData.existingMaterialType}
          onChange={(v) => f("existingMaterialType", v)}
          source={src.existingMaterialType}
        />
        <TextRow
          label="Existing Creative Condition"
          value={formData.existingCreativeConditionForOpportunity}
          onChange={(v) => f("existingCreativeConditionForOpportunity", v)}
          source={src.existingCreativeConditionForOpportunity}
        />
        <YesNoRow
          name="existingCreativeRemovableForOpportunity"
          label="Can existing creative be removed?"
          value={formData.existingCreativeRemovableForOpportunity}
          onChange={(v) => f("existingCreativeRemovableForOpportunity", v as SiteSurveyFormData["existingCreativeRemovableForOpportunity"])}
          source={src.existingCreativeRemovableForOpportunity}
        />
        <TextRow
          label="Which entrance has the main footfall? (if multiple entrances)"
          value={formData.mainFootfallEntranceNote}
          onChange={(v) => f("mainFootfallEntranceNote", v)}
          source={src.mainFootfallEntranceNote}
        />
        <TextAreaRow label="Additional Opportunity Notes" value={formData.additionalOpportunityNotes} onChange={(v) => f("additionalOpportunityNotes", v)} source={src.additionalOpportunityNotes} />
      </SurveyCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section field-key lists -- drive each SurveyCard's "X/Y filled" badge.
// ---------------------------------------------------------------------------

const PERSONNEL_KEYS: (keyof SiteSurveyFormData)[] = ["appleRepresentative", "retailerRepresentative", "storePersonContacted", "storeContactNumber", "printer"];
const STORE_DESCRIPTION_KEYS: (keyof SiteSurveyFormData)[] = [
  "storeLocationType",
  "storeLocationOther",
  "entrancesIntoMall",
  "entrancesIntoStore",
  "floorsWithinMall",
  "floorsWithinStore",
  "floorApplProgramOn",
  "storeOpenPlan",
  "openPlanLayoutDescription",
  "applProgramPositionEntrance",
  "siteStoreAddress",
  "storeContactDetails",
  "siliconJoinsCondition",
  "perspexCondition",
  "lightingDescription",
  "existingCreative",
  "creativeRemovable",
  "additionalStoreNotes",
];
const INSTALL_KEYS: (keyof SiteSurveyFormData)[] = [
  "openingTimeMon",
  "openingTimeTue",
  "openingTimeWed",
  "openingTimeThu",
  "openingTimeFri",
  "openingTimeSat",
  "openingTimeSun",
  "installOutsideHours",
  "installOutsideHoursDetails",
  "retailerPreferredInstallTime",
  "retailerPreferredInstallDetails",
  "installationDateTime",
  "permitRequired",
  "permitDetails",
];
const DELIVERY_KEYS: (keyof SiteSurveyFormData)[] = ["deliveryContactNameNumber", "deliveryAddressSameAsStore", "deliveryAddress", "deliveryTimes", "deliveryOtherComments"];
const GENERAL_KEYS: (keyof SiteSurveyFormData)[] = ["weatherAffectsInstall", "weatherAffectsInstallDetails", "allOpportunitiesSurveyed", "allOpportunitiesSurveyedReason", "generalNotes"];
const SUITABILITY_KEYS: (keyof SiteSurveyFormData)[] = [
  "siteVisibility",
  "siteVisibilityDescription",
  "premiumLocation",
  "premiumLocationDescription",
  "installationTimeFlexible",
  "installationTimeFlexibleDescription",
  "potentialIssues",
];
const SITE_DETAILS_KEYS: (keyof SiteSurveyFormData)[] = [
  "maxWorkingSpace",
  "accessEquipmentAvailable",
  "accessEquipmentDescription",
  "poweredAccessUsed",
  "poweredAccessDescription",
  "accessIssues",
  "accessIssuesDescription",
  "siteType",
  "siteTypeDuration",
  "competitorAdvertising",
  "competitorAdvertisingDescription",
  "generalInstallInfo",
];
const SAFETY_KEYS: (keyof SiteSurveyFormData)[] = ["siteSafeForInstall", "siteSafeDescription", "safetyConcerns", "safetyConcernsDetails", "safetyEquipmentRequired", "safetyEquipmentDetails"];
const GRAPHICS_KEYS: (keyof SiteSurveyFormData)[] = [
  "graffitiRisk",
  "graffitiRiskDescription",
  "extraLightingRequired",
  "extraLightingDescription",
  "graphicsCutoutRequired",
  "graphicsCutoutDescription",
  "graphicsOtherInfo",
];
const APPROVALS_KEYS: (keyof SiteSurveyFormData)[] = ["specialApprovalsNeeded", "specialApprovalsDetails", "chainCentralApprovalNeeded", "chainCentralApprovalReason", "approvalsOtherInfo"];
const OPPORTUNITY_KEYS: (keyof SiteSurveyFormData)[] = [
  "opportunityName",
  "opportunityType",
  "opportunityTypeOther",
  "opportunityLocation",
  "storeFacadeArea",
  "appleProgramPosition",
  "opportunityDescription",
  "existingMaterialType",
  "existingCreativeConditionForOpportunity",
  "existingCreativeRemovableForOpportunity",
  "mainFootfallEntranceNote",
  "additionalOpportunityNotes",
];

const SECTION_KEYS = ["site", "personnel", "store", "install", "delivery", "general", "suitability", "details", "safety", "graphics", "approvals", "opportunity"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFilled(v: string | null | undefined): boolean {
  return v !== "" && v != null;
}
function countFilled(values: (string | null | undefined)[]): number {
  return values.filter(isFilled).length;
}
function countFilledKeys(formData: SiteSurveyFormData, keys: (keyof SiteSurveyFormData)[]): number {
  return countFilled(keys.map((k) => formData[k] as string));
}

function set<K extends keyof SiteSurveyFormData>(
  onFormDataChange: (key: K, value: SiteSurveyFormData[K]) => void,
  onTouched: ((key: FieldSourceKey) => void) | undefined,
  key: K,
  value: SiteSurveyFormData[K]
) {
  onFormDataChange(key, value);
  onTouched?.(key);
}

type SectionColor = "primary" | "info" | "success" | "warning" | "danger" | "ai";

const SECTION_COLOR_CLASSES: Record<SectionColor, { chipBg: string; chipText: string }> = {
  primary: { chipBg: "bg-primary-tint", chipText: "text-primary" },
  info: { chipBg: "bg-info-tint", chipText: "text-info" },
  success: { chipBg: "bg-success-tint", chipText: "text-success" },
  warning: { chipBg: "bg-warning-tint", chipText: "text-warning" },
  danger: { chipBg: "bg-danger-tint", chipText: "text-danger" },
  ai: { chipBg: "bg-ai-tint", chipText: "text-ai" },
};

/**
 * A collapsible, rounded "card" per section -- LFG Connect's own card look
 * (see LfgSiteCardGrid.tsx: rounded-[20px] border shadow-2), not the flatter
 * bordered-accordion look this used before. The header row (colour chip +
 * icon, title, X/Y filled badge, chevron) is always visible even collapsed,
 * so the WHOLE form reads as a compact stack of card headers at a glance;
 * only the section actually being worked on expands and takes up vertical
 * space. Controlled (open/onToggle), not self-managed state, so a parent
 * "Expand all"/"Collapse all" control can drive every card at once. Direct
 * children are rendered as a stack of compact landscape ROWS (label-left,
 * control-right), not a wrapping grid -- see Row/TextRow/YesNoRow etc below.
 */
function SurveyCard({
  sectionKey,
  title,
  icon: Icon,
  color,
  filled,
  total,
  open,
  onToggle,
  children,
}: {
  sectionKey: string;
  title: string;
  icon: LucideIcon;
  color: SectionColor;
  filled: number;
  total: number;
  open: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
}) {
  const c = SECTION_COLOR_CLASSES[color];
  const complete = total > 0 && filled === total;
  return (
    <div className="overflow-hidden rounded-[20px] border border-line bg-surface shadow-1 transition-shadow hover:shadow-2">
      <button type="button" onClick={() => onToggle(sectionKey)} className="flex w-full items-center gap-2 bg-surface-sunken px-3.5 py-2.5 text-left">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${c.chipBg} ${c.chipText}`}>
          <Icon size={13} />
        </span>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{title}</span>
        <span className={`text-[10px] font-medium tabular-nums ${complete ? "text-success" : "text-ink-muted"}`}>
          {filled}/{total}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="flex flex-col gap-1.5 border-t border-line p-2.5">{children}</div>}
    </div>
  );
}

/** Shared landscape row shell: label column left, control(s) fill the rest. Wraps on narrow screens, one compact line on desktop. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-line bg-surface px-2.5 py-1.5 sm:flex-nowrap">{children}</div>;
}

function RowLabel({ label, source }: { label: string; source?: FieldSources[FieldSourceKey] }) {
  return (
    <span className="flex w-full shrink-0 items-center gap-1 text-[11px] font-medium leading-tight text-ink-secondary sm:w-[240px]">
      {label}
      <FieldIndicator source={source} />
    </span>
  );
}

function TextRow({
  label,
  value,
  onChange,
  source,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source?: FieldSources[FieldSourceKey];
  type?: string;
}) {
  return (
    <Row>
      <RowLabel label={label} source={source} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
    </Row>
  );
}

function TextAreaRow({
  label,
  value,
  onChange,
  source,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source?: FieldSources[FieldSourceKey];
}) {
  return (
    <Row>
      <RowLabel label={label} source={source} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="min-w-[10rem] flex-1 resize-y rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
    </Row>
  );
}

function SelectRow({
  label,
  value,
  onChange,
  source,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source?: FieldSources[FieldSourceKey];
  options: readonly (readonly [string, string])[];
}) {
  return (
    <Row>
      <RowLabel label={label} source={source} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </Row>
  );
}

/**
 * A Yes/No (or Yes/No/third-option) question rendered as real radio
 * buttons -- `accent-primary` tints the native control so the selected one
 * reads as a filled circle, the same visual the reference Apple PDF uses
 * for its own Yes/No boxes -- with an optional inline "give details" input
 * right alongside, replacing what used to be two separate fields (a Yes/No
 * select plus its own "If Yes, give details" text field below it).
 * `name` must be unique per field instance (radio groups share selection
 * state by `name`) -- pass the underlying formData key.
 */
function YesNoRow({
  name,
  label,
  value,
  onChange,
  source,
  options = [
    { value: "yes", label: "Yes" },
    { value: "no", label: "No" },
  ],
  detail,
}: {
  name: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  source?: FieldSources[FieldSourceKey];
  options?: { value: string; label: string }[];
  detail?: { value: string; onChange: (v: string) => void; source?: FieldSources[FieldSourceKey]; placeholder: string };
}) {
  return (
    <Row>
      <RowLabel label={label} source={source} />
      <div className="flex shrink-0 items-center gap-3">
        {options.map((opt) => (
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-[11px] text-ink">
            <input type="radio" name={name} checked={value === opt.value} onChange={() => onChange(opt.value)} className="h-3.5 w-3.5 accent-primary" />
            {opt.label}
          </label>
        ))}
      </div>
      {detail && (
        <>
          <input
            value={detail.value}
            onChange={(e) => detail.onChange(e.target.value)}
            placeholder={detail.placeholder}
            className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
          />
          <FieldIndicator source={detail.source} />
        </>
      )}
    </Row>
  );
}
