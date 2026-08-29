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
import type { FieldSourceKey, FieldSources, SiteSurveyFormData, YesNo } from "@/lib/siteSurveyReport/types";
import { emptyFormData } from "@/lib/siteSurveyReport/types";

// The full ~66-field inspection form -- shared by DetailsStep (manual entry
// / "fill in the rest" after extraction), ReviewStep (same fields, an
// extraction-progress banner instead of a plain heading), and the "Default
// Answers" settings page (SiteSurveyReportDefaultsClient.tsx, via the
// FormDataFields export below, header section omitted).
//
// Redesigned from one long list of full-width fields into collapsible,
// colour-coded, compact-font "cards" per section (feedback: the original
// layout was "hell of information", too much to fill in one sitting) --
// every section starts COLLAPSED except the first, so the whole form is
// "visible in one shot" as a stack of section headers with a filled-count
// badge, and only the section actually being worked on takes up space.
// Field labels/inputs use small (text-[11px]/text-xs) type and tight
// padding throughout, matching this app's own existing compact patterns
// (Comments.tsx, WorkflowTimeline.tsx, etc), not a new style.

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
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line bg-surface-sunken px-3 py-2">
        <p className="text-[11px] text-ink-secondary">
          Tap a section to open it — only what&apos;s still blank needs your input. Set up your{" "}
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

      <AccordionSection
        sectionKey="site"
        title="Site / Store Information"
        icon={MapPin}
        color="primary"
        filled={countFilled([header.store_name, header.address, header.sfo_id, header.program, header.survey_date, header.surveyor_name])}
        total={6}
        open={!!openSections.site}
        onToggle={toggleSection}
      >
        <FieldGrid>
          <TextField
            label="Site / Store Name"
            value={header.store_name}
            onChange={(v) => {
              onHeaderChange("store_name", v);
              onTouched("store_name");
            }}
            source={fieldSources.store_name}
            className={FULL}
          />
          <TextField
            label="Address"
            value={header.address}
            onChange={(v) => {
              onHeaderChange("address", v);
              onTouched("address");
            }}
            source={fieldSources.address}
            className={FULL}
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
            label="Surveyor's Details"
            value={header.surveyor_name}
            onChange={(v) => {
              onHeaderChange("surveyor_name", v);
              onTouched("surveyor_name");
            }}
            source={fieldSources.surveyor_name}
          />
        </FieldGrid>
      </AccordionSection>

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

  return (
    <>
      <AccordionSection
        sectionKey="personnel"
        title="On-site Personnel Details"
        icon={Users}
        color="info"
        filled={countFilledKeys(formData, PERSONNEL_KEYS)}
        total={PERSONNEL_KEYS.length}
        open={!!openSections.personnel}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <TextField label="Apple Representative" value={formData.appleRepresentative} onChange={(v) => set(onFormDataChange, onTouched, "appleRepresentative", v)} source={src.appleRepresentative} />
          <TextField label="Retailer Representative" value={formData.retailerRepresentative} onChange={(v) => set(onFormDataChange, onTouched, "retailerRepresentative", v)} source={src.retailerRepresentative} />
          <TextField label="Store Person Contacted" value={formData.storePersonContacted} onChange={(v) => set(onFormDataChange, onTouched, "storePersonContacted", v)} source={src.storePersonContacted} />
          <TextField label="Store Contact Number" value={formData.storeContactNumber} onChange={(v) => set(onFormDataChange, onTouched, "storeContactNumber", v)} source={src.storeContactNumber} />
          <TextField label="Printer / Survey Company" value={formData.printer} onChange={(v) => set(onFormDataChange, onTouched, "printer", v)} source={src.printer} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="store"
        title="Store Description"
        icon={Store}
        color="success"
        filled={countFilledKeys(formData, STORE_DESCRIPTION_KEYS)}
        total={STORE_DESCRIPTION_KEYS.length}
        open={!!openSections.store}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <SelectField
            label="Location of Store"
            value={formData.storeLocationType}
            onChange={(v) => set(onFormDataChange, onTouched, "storeLocationType", v as SiteSurveyFormData["storeLocationType"])}
            source={src.storeLocationType}
            options={[
              ["", "— Select —"],
              ["mall", "Mall"],
              ["retail_high_street", "Retail High Street"],
              ["retail_park", "Retail Park"],
              ["other", "Other"],
            ]}
          />
          <TextField label="If Other, please specify" value={formData.storeLocationOther} onChange={(v) => set(onFormDataChange, onTouched, "storeLocationOther", v)} source={src.storeLocationOther} />
          <TextField label="Entrances — Into the Mall" value={formData.entrancesIntoMall} onChange={(v) => set(onFormDataChange, onTouched, "entrancesIntoMall", v)} source={src.entrancesIntoMall} />
          <TextField label="Entrances — Into the Store" value={formData.entrancesIntoStore} onChange={(v) => set(onFormDataChange, onTouched, "entrancesIntoStore", v)} source={src.entrancesIntoStore} />
          <TextField label="Floors — Within the Mall" value={formData.floorsWithinMall} onChange={(v) => set(onFormDataChange, onTouched, "floorsWithinMall", v)} source={src.floorsWithinMall} />
          <TextField label="Floors — Within the Store" value={formData.floorsWithinStore} onChange={(v) => set(onFormDataChange, onTouched, "floorsWithinStore", v)} source={src.floorsWithinStore} />
          <TextField label="Floor Apple Program Is On" value={formData.floorApplProgramOn} onChange={(v) => set(onFormDataChange, onTouched, "floorApplProgramOn", v)} source={src.floorApplProgramOn} />
          <YesNoField label="Is the store open plan?" value={formData.storeOpenPlan} onChange={(v) => set(onFormDataChange, onTouched, "storeOpenPlan", v as YesNo)} source={src.storeOpenPlan} />
          <TextAreaField label="If No, describe layout" value={formData.openPlanLayoutDescription} onChange={(v) => set(onFormDataChange, onTouched, "openPlanLayoutDescription", v)} source={src.openPlanLayoutDescription} />
          <TextField
            label="Apple Program Position vs. Main Entrance"
            value={formData.applProgramPositionEntrance}
            onChange={(v) => set(onFormDataChange, onTouched, "applProgramPositionEntrance", v)}
            source={src.applProgramPositionEntrance}
            className={HALF}
          />
          <TextAreaField label="Store Address" value={formData.siteStoreAddress} onChange={(v) => set(onFormDataChange, onTouched, "siteStoreAddress", v)} source={src.siteStoreAddress} />
          <TextAreaField label="Store Contact Details" value={formData.storeContactDetails} onChange={(v) => set(onFormDataChange, onTouched, "storeContactDetails", v)} source={src.storeContactDetails} />
          <TextAreaField label="Condition of silicon joins/edges" value={formData.siliconJoinsCondition} onChange={(v) => set(onFormDataChange, onTouched, "siliconJoinsCondition", v)} source={src.siliconJoinsCondition} />
          <TextAreaField label="Condition of Perspex cover" value={formData.perspexCondition} onChange={(v) => set(onFormDataChange, onTouched, "perspexCondition", v)} source={src.perspexCondition} />
          <TextAreaField label="Lighting / backlit potential" value={formData.lightingDescription} onChange={(v) => set(onFormDataChange, onTouched, "lightingDescription", v)} source={src.lightingDescription} className={HALF} />
          <TextAreaField label="Current artwork / store stickers" value={formData.existingCreative} onChange={(v) => set(onFormDataChange, onTouched, "existingCreative", v)} source={src.existingCreative} />
          <YesNoField
            label="Can existing creative be removed?"
            options={["yes", "no", ""] as const}
            value={formData.creativeRemovable}
            onChange={(v) => set(onFormDataChange, onTouched, "creativeRemovable", v as YesNo)}
            source={src.creativeRemovable}
            thirdOption="Not Applicable"
          />
          <TextAreaField label="Additional store observations" value={formData.additionalStoreNotes} onChange={(v) => set(onFormDataChange, onTouched, "additionalStoreNotes", v)} source={src.additionalStoreNotes} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="install"
        title="Installing on Site"
        icon={CalendarClock}
        color="warning"
        filled={countFilledKeys(formData, INSTALL_KEYS)}
        total={INSTALL_KEYS.length}
        open={!!openSections.install}
        onToggle={onToggleSection}
      >
        <div className="flex flex-col gap-2.5">
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-[10.5px] font-medium text-ink-secondary">Store Opening Times</span>
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
                <TextField key={key} label={day} value={formData[key]} onChange={(v) => set(onFormDataChange, onTouched, key, v)} source={src[key]} />
              ))}
            </div>
          </div>
          <FieldGrid>
            <YesNoField label="Install outside store opening hours?" value={formData.installOutsideHours} onChange={(v) => set(onFormDataChange, onTouched, "installOutsideHours", v as YesNo)} source={src.installOutsideHours} />
            <TextAreaField label="If Yes, give details" value={formData.installOutsideHoursDetails} onChange={(v) => set(onFormDataChange, onTouched, "installOutsideHoursDetails", v)} source={src.installOutsideHoursDetails} />
            <YesNoField
              label="Retailer has preferred install days/time?"
              value={formData.retailerPreferredInstallTime}
              onChange={(v) => set(onFormDataChange, onTouched, "retailerPreferredInstallTime", v as YesNo)}
              source={src.retailerPreferredInstallTime}
            />
            <TextAreaField label="If Yes, give details" value={formData.retailerPreferredInstallDetails} onChange={(v) => set(onFormDataChange, onTouched, "retailerPreferredInstallDetails", v)} source={src.retailerPreferredInstallDetails} />
            <TextField label="Time and date of installation" value={formData.installationDateTime} onChange={(v) => set(onFormDataChange, onTouched, "installationDateTime", v)} source={src.installationDateTime} />
            <YesNoField
              label="Are work permits required?"
              options={["yes", "no", "unknown"] as const}
              value={formData.permitRequired}
              onChange={(v) => set(onFormDataChange, onTouched, "permitRequired", v as YesNo)}
              source={src.permitRequired}
              thirdOption="Unknown"
            />
            <TextAreaField label="Permit details (if Yes)" value={formData.permitDetails} onChange={(v) => set(onFormDataChange, onTouched, "permitDetails", v)} source={src.permitDetails} />
          </FieldGrid>
        </div>
      </AccordionSection>

      <AccordionSection
        sectionKey="delivery"
        title="Deliveries to Store"
        icon={Truck}
        color="ai"
        filled={countFilledKeys(formData, DELIVERY_KEYS)}
        total={DELIVERY_KEYS.length}
        open={!!openSections.delivery}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <TextField label="Store Contact Name and Number" value={formData.deliveryContactNameNumber} onChange={(v) => set(onFormDataChange, onTouched, "deliveryContactNameNumber", v)} source={src.deliveryContactNameNumber} className={HALF} />
          <YesNoField label="Delivery address same as store?" value={formData.deliveryAddressSameAsStore} onChange={(v) => set(onFormDataChange, onTouched, "deliveryAddressSameAsStore", v as YesNo)} source={src.deliveryAddressSameAsStore} />
          <TextAreaField label="If No, give address" value={formData.deliveryAddress} onChange={(v) => set(onFormDataChange, onTouched, "deliveryAddress", v)} source={src.deliveryAddress} />
          <TextField label="Day/time deliveries can be made" value={formData.deliveryTimes} onChange={(v) => set(onFormDataChange, onTouched, "deliveryTimes", v)} source={src.deliveryTimes} />
          <TextAreaField label="Other delivery comments" value={formData.deliveryOtherComments} onChange={(v) => set(onFormDataChange, onTouched, "deliveryOtherComments", v)} source={src.deliveryOtherComments} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="general"
        title="General Site Information"
        icon={Info}
        color="info"
        filled={countFilledKeys(formData, GENERAL_KEYS)}
        total={GENERAL_KEYS.length}
        open={!!openSections.general}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <YesNoField label="Will weather affect the install?" value={formData.weatherAffectsInstall} onChange={(v) => set(onFormDataChange, onTouched, "weatherAffectsInstall", v as YesNo)} source={src.weatherAffectsInstall} />
          <TextAreaField label="If Yes, give details" value={formData.weatherAffectsInstallDetails} onChange={(v) => set(onFormDataChange, onTouched, "weatherAffectsInstallDetails", v)} source={src.weatherAffectsInstallDetails} />
          <YesNoField label="All possible opportunities surveyed?" value={formData.allOpportunitiesSurveyed} onChange={(v) => set(onFormDataChange, onTouched, "allOpportunitiesSurveyed", v as YesNo)} source={src.allOpportunitiesSurveyed} />
          <TextAreaField label="If No, give reason" value={formData.allOpportunitiesSurveyedReason} onChange={(v) => set(onFormDataChange, onTouched, "allOpportunitiesSurveyedReason", v)} source={src.allOpportunitiesSurveyedReason} />
          <TextAreaField label="Any other helpful information" value={formData.generalNotes} onChange={(v) => set(onFormDataChange, onTouched, "generalNotes", v)} source={src.generalNotes} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="suitability"
        title="Site Suitability / Installation Details"
        icon={Eye}
        color="success"
        filled={countFilledKeys(formData, SUITABILITY_KEYS)}
        total={SUITABILITY_KEYS.length}
        open={!!openSections.suitability}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <YesNoField label="Highly visible opportunity?" value={formData.siteVisibility} onChange={(v) => set(onFormDataChange, onTouched, "siteVisibility", v as YesNo)} source={src.siteVisibility} />
          <TextAreaField label="Description" value={formData.siteVisibilityDescription} onChange={(v) => set(onFormDataChange, onTouched, "siteVisibilityDescription", v)} source={src.siteVisibilityDescription} />
          <YesNoField label="Is this a premium site?" value={formData.premiumLocation} onChange={(v) => set(onFormDataChange, onTouched, "premiumLocation", v as YesNo)} source={src.premiumLocation} />
          <TextAreaField label="Description" value={formData.premiumLocationDescription} onChange={(v) => set(onFormDataChange, onTouched, "premiumLocationDescription", v)} source={src.premiumLocationDescription} />
          <YesNoField label="Is installation time flexible?" value={formData.installationTimeFlexible} onChange={(v) => set(onFormDataChange, onTouched, "installationTimeFlexible", v as YesNo)} source={src.installationTimeFlexible} />
          <TextAreaField label="Description" value={formData.installationTimeFlexibleDescription} onChange={(v) => set(onFormDataChange, onTouched, "installationTimeFlexibleDescription", v)} source={src.installationTimeFlexibleDescription} />
          <TextAreaField label="Potential issues with location" value={formData.potentialIssues} onChange={(v) => set(onFormDataChange, onTouched, "potentialIssues", v)} source={src.potentialIssues} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="details"
        title="Site Details"
        icon={LayoutGrid}
        color="primary"
        filled={countFilledKeys(formData, SITE_DETAILS_KEYS)}
        total={SITE_DETAILS_KEYS.length}
        open={!!openSections.details}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <TextAreaField label="Maximum working space" value={formData.maxWorkingSpace} onChange={(v) => set(onFormDataChange, onTouched, "maxWorkingSpace", v)} source={src.maxWorkingSpace} className={HALF} />
          <YesNoField label="Access equipment available on site?" value={formData.accessEquipmentAvailable} onChange={(v) => set(onFormDataChange, onTouched, "accessEquipmentAvailable", v as YesNo)} source={src.accessEquipmentAvailable} />
          <TextAreaField label="Description" value={formData.accessEquipmentDescription} onChange={(v) => set(onFormDataChange, onTouched, "accessEquipmentDescription", v)} source={src.accessEquipmentDescription} />
          <YesNoField label="Powered access to be used?" value={formData.poweredAccessUsed} onChange={(v) => set(onFormDataChange, onTouched, "poweredAccessUsed", v as YesNo)} source={src.poweredAccessUsed} />
          <TextAreaField label="Description" value={formData.poweredAccessDescription} onChange={(v) => set(onFormDataChange, onTouched, "poweredAccessDescription", v)} source={src.poweredAccessDescription} />
          <YesNoField label="Any access issues?" value={formData.accessIssues} onChange={(v) => set(onFormDataChange, onTouched, "accessIssues", v as YesNo)} source={src.accessIssues} />
          <TextAreaField label="Description" value={formData.accessIssuesDescription} onChange={(v) => set(onFormDataChange, onTouched, "accessIssuesDescription", v)} source={src.accessIssuesDescription} />
          <SelectField
            label="Permanent or temporary site?"
            value={formData.siteType}
            onChange={(v) => set(onFormDataChange, onTouched, "siteType", v as SiteSurveyFormData["siteType"])}
            source={src.siteType}
            options={[
              ["", "— Select —"],
              ["permanent", "Permanent"],
              ["temporary", "Temporary"],
            ]}
          />
          <TextField label="If temporary, how long available?" value={formData.siteTypeDuration} onChange={(v) => set(onFormDataChange, onTouched, "siteTypeDuration", v)} source={src.siteTypeDuration} />
          <YesNoField label="Competitor advertising nearby?" value={formData.competitorAdvertising} onChange={(v) => set(onFormDataChange, onTouched, "competitorAdvertising", v as YesNo)} source={src.competitorAdvertising} />
          <TextAreaField label="Description" value={formData.competitorAdvertisingDescription} onChange={(v) => set(onFormDataChange, onTouched, "competitorAdvertisingDescription", v)} source={src.competitorAdvertisingDescription} />
          <TextAreaField label="General info for a successful install" value={formData.generalInstallInfo} onChange={(v) => set(onFormDataChange, onTouched, "generalInstallInfo", v)} source={src.generalInstallInfo} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="safety"
        title="Safety"
        icon={HardHat}
        color="danger"
        filled={countFilledKeys(formData, SAFETY_KEYS)}
        total={SAFETY_KEYS.length}
        open={!!openSections.safety}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <YesNoField label="Is the site safe for installation?" value={formData.siteSafeForInstall} onChange={(v) => set(onFormDataChange, onTouched, "siteSafeForInstall", v as YesNo)} source={src.siteSafeForInstall} />
          <TextAreaField label="Description" value={formData.siteSafeDescription} onChange={(v) => set(onFormDataChange, onTouched, "siteSafeDescription", v)} source={src.siteSafeDescription} />
          <YesNoField label="Any specific safety concerns?" value={formData.safetyConcerns} onChange={(v) => set(onFormDataChange, onTouched, "safetyConcerns", v as YesNo)} source={src.safetyConcerns} />
          <TextAreaField label="Details" value={formData.safetyConcernsDetails} onChange={(v) => set(onFormDataChange, onTouched, "safetyConcernsDetails", v)} source={src.safetyConcernsDetails} />
          <YesNoField label="Specific safety equipment required?" value={formData.safetyEquipmentRequired} onChange={(v) => set(onFormDataChange, onTouched, "safetyEquipmentRequired", v as YesNo)} source={src.safetyEquipmentRequired} />
          <TextAreaField label="Details" value={formData.safetyEquipmentDetails} onChange={(v) => set(onFormDataChange, onTouched, "safetyEquipmentDetails", v)} source={src.safetyEquipmentDetails} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="graphics"
        title="Graphics"
        icon={ImageIcon}
        color="ai"
        filled={countFilledKeys(formData, GRAPHICS_KEYS)}
        total={GRAPHICS_KEYS.length}
        open={!!openSections.graphics}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <YesNoField label="At risk from graffiti?" value={formData.graffitiRisk} onChange={(v) => set(onFormDataChange, onTouched, "graffitiRisk", v as YesNo)} source={src.graffitiRisk} />
          <TextAreaField label="Description" value={formData.graffitiRiskDescription} onChange={(v) => set(onFormDataChange, onTouched, "graffitiRiskDescription", v)} source={src.graffitiRiskDescription} />
          <YesNoField label="Extra lighting for night viewing?" value={formData.extraLightingRequired} onChange={(v) => set(onFormDataChange, onTouched, "extraLightingRequired", v as YesNo)} source={src.extraLightingRequired} />
          <TextAreaField label="Description" value={formData.extraLightingDescription} onChange={(v) => set(onFormDataChange, onTouched, "extraLightingDescription", v)} source={src.extraLightingDescription} />
          <YesNoField label="Cutout required for the graphics?" value={formData.graphicsCutoutRequired} onChange={(v) => set(onFormDataChange, onTouched, "graphicsCutoutRequired", v as YesNo)} source={src.graphicsCutoutRequired} />
          <TextAreaField label="Description" value={formData.graphicsCutoutDescription} onChange={(v) => set(onFormDataChange, onTouched, "graphicsCutoutDescription", v)} source={src.graphicsCutoutDescription} />
          <TextAreaField label="Any other graphics information" value={formData.graphicsOtherInfo} onChange={(v) => set(onFormDataChange, onTouched, "graphicsOtherInfo", v)} source={src.graphicsOtherInfo} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      <AccordionSection
        sectionKey="approvals"
        title="Approvals"
        icon={FileCheck2}
        color="warning"
        filled={countFilledKeys(formData, APPROVALS_KEYS)}
        total={APPROVALS_KEYS.length}
        open={!!openSections.approvals}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <YesNoField label="Does the store need special approvals?" value={formData.specialApprovalsNeeded} onChange={(v) => set(onFormDataChange, onTouched, "specialApprovalsNeeded", v as YesNo)} source={src.specialApprovalsNeeded} />
          <TextAreaField label="If Yes, give details" value={formData.specialApprovalsDetails} onChange={(v) => set(onFormDataChange, onTouched, "specialApprovalsDetails", v)} source={src.specialApprovalsDetails} />
          <YesNoField label="Chain store — central team approval needed?" value={formData.chainCentralApprovalNeeded} onChange={(v) => set(onFormDataChange, onTouched, "chainCentralApprovalNeeded", v as YesNo)} source={src.chainCentralApprovalNeeded} />
          <TextAreaField label="If No, give reason" value={formData.chainCentralApprovalReason} onChange={(v) => set(onFormDataChange, onTouched, "chainCentralApprovalReason", v)} source={src.chainCentralApprovalReason} />
          <TextAreaField label="Any other helpful information" value={formData.approvalsOtherInfo} onChange={(v) => set(onFormDataChange, onTouched, "approvalsOtherInfo", v)} source={src.approvalsOtherInfo} className={FULL} />
        </FieldGrid>
      </AccordionSection>

      {/*
        Opportunity Information -- matches the reference PDF's own page
        order (right after Approvals, before the photo-survey pages).
        Filled ONCE here and shared across every site in this report (see
        SiteSurveyFormData's own header comment) rather than re-typed per
        site on the Measurement step -- MeasurementStep.tsx/SiteCard no
        longer has its own copy of these fields.
      */}
      <AccordionSection
        sectionKey="opportunity"
        title="Opportunity Information"
        icon={Tag}
        color="primary"
        filled={countFilledKeys(formData, OPPORTUNITY_KEYS)}
        total={OPPORTUNITY_KEYS.length}
        open={!!openSections.opportunity}
        onToggle={onToggleSection}
      >
        <FieldGrid>
          <TextField label="Opportunity Name" value={formData.opportunityName} onChange={(v) => set(onFormDataChange, onTouched, "opportunityName", v)} source={src.opportunityName} />
          <SelectField
            label="Opportunity Type"
            value={formData.opportunityType}
            onChange={(v) => set(onFormDataChange, onTouched, "opportunityType", v as SiteSurveyFormData["opportunityType"])}
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
          <TextField label="Opportunity Type — if Other, please specify" value={formData.opportunityTypeOther} onChange={(v) => set(onFormDataChange, onTouched, "opportunityTypeOther", v)} source={src.opportunityTypeOther} />
          <TextField label="Location" value={formData.opportunityLocation} onChange={(v) => set(onFormDataChange, onTouched, "opportunityLocation", v)} source={src.opportunityLocation} />
          <TextField label="Store / Facade Area" value={formData.storeFacadeArea} onChange={(v) => set(onFormDataChange, onTouched, "storeFacadeArea", v)} source={src.storeFacadeArea} />
          <TextField label="Apple Program Position" value={formData.appleProgramPosition} onChange={(v) => set(onFormDataChange, onTouched, "appleProgramPosition", v)} source={src.appleProgramPosition} />
          <TextAreaField label="Description" value={formData.opportunityDescription} onChange={(v) => set(onFormDataChange, onTouched, "opportunityDescription", v)} source={src.opportunityDescription} className={HALF} />
          <TextField
            label="Existing Material Type (if a banner/graphic already exists)"
            value={formData.existingMaterialType}
            onChange={(v) => set(onFormDataChange, onTouched, "existingMaterialType", v)}
            source={src.existingMaterialType}
          />
          <TextField
            label="Existing Creative Condition"
            value={formData.existingCreativeConditionForOpportunity}
            onChange={(v) => set(onFormDataChange, onTouched, "existingCreativeConditionForOpportunity", v)}
            source={src.existingCreativeConditionForOpportunity}
          />
          <YesNoField
            label="Can existing creative be removed?"
            value={formData.existingCreativeRemovableForOpportunity}
            onChange={(v) => set(onFormDataChange, onTouched, "existingCreativeRemovableForOpportunity", v as YesNo)}
            source={src.existingCreativeRemovableForOpportunity}
          />
          <TextField
            label="Which entrance has the main footfall? (if multiple entrances)"
            value={formData.mainFootfallEntranceNote}
            onChange={(v) => set(onFormDataChange, onTouched, "mainFootfallEntranceNote", v)}
            source={src.mainFootfallEntranceNote}
          />
          <TextAreaField label="Additional Opportunity Notes" value={formData.additionalOpportunityNotes} onChange={(v) => set(onFormDataChange, onTouched, "additionalOpportunityNotes", v)} source={src.additionalOpportunityNotes} className={FULL} />
        </FieldGrid>
      </AccordionSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section field-key lists -- drive each AccordionSection's "X/Y filled" badge.
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

// A full-width cell in the 2/3/4-col FieldGrid below; HALF spans half the
// widest (lg) breakpoint's row.
const FULL = "col-span-2 sm:col-span-3 lg:col-span-4";
const HALF = "col-span-2 sm:col-span-2 lg:col-span-2";

type SectionColor = "primary" | "info" | "success" | "warning" | "danger" | "ai";

const SECTION_COLOR_CLASSES: Record<SectionColor, { border: string; chipBg: string; chipText: string }> = {
  primary: { border: "border-l-primary", chipBg: "bg-primary-tint", chipText: "text-primary" },
  info: { border: "border-l-info", chipBg: "bg-info-tint", chipText: "text-info" },
  success: { border: "border-l-success", chipBg: "bg-success-tint", chipText: "text-success" },
  warning: { border: "border-l-warning", chipBg: "bg-warning-tint", chipText: "text-warning" },
  danger: { border: "border-l-danger", chipBg: "bg-danger-tint", chipText: "text-danger" },
  ai: { border: "border-l-ai", chipBg: "bg-ai-tint", chipText: "text-ai" },
};

/**
 * A collapsible, colour-coded "card" section -- the header row (colour
 * chip + icon, title, X/Y filled badge, chevron) is always visible even
 * collapsed, so the WHOLE form reads as a compact stack of section
 * headers at a glance ("visible in one shot"); only the section actually
 * being worked on expands and takes up vertical space. Controlled (open/
 * onToggle), not self-managed state, so a parent "Expand all"/"Collapse
 * all" control can drive every section at once.
 */
function AccordionSection({
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
    <div className={`overflow-hidden rounded-lg border border-line border-l-[3px] ${c.border}`}>
      <button type="button" onClick={() => onToggle(sectionKey)} className="flex w-full items-center gap-2 bg-surface-sunken px-3 py-2 text-left">
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${c.chipBg} ${c.chipText}`}>
          <Icon size={13} />
        </span>
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-ink-secondary">{title}</span>
        <span className={`text-[10px] font-medium tabular-nums ${complete ? "text-success" : "text-ink-muted"}`}>
          {filled}/{total}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-line p-2.5">{children}</div>}
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">{children}</div>;
}

function FieldLabel({ label, source }: { label: string; source: FieldSources[FieldSourceKey] }) {
  return (
    <span className="mb-0.5 flex items-center gap-1 text-[10.5px] font-medium leading-tight text-ink-secondary">
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
  source?: FieldSources[FieldSourceKey];
  type?: string;
  className?: string;
}) {
  return (
    <label className={`flex flex-col ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
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
  source?: FieldSources[FieldSourceKey];
  className?: string;
}) {
  return (
    <label className={`flex flex-col ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full resize-y rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  source,
  options,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  source?: FieldSources[FieldSourceKey];
  options: readonly (readonly [string, string])[];
  className?: string;
}) {
  return (
    <label className={`flex flex-col ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
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
  source?: FieldSources[FieldSourceKey];
  options?: readonly string[];
  thirdOption?: string;
}) {
  return (
    <label className="flex flex-col">
      <FieldLabel label={label} source={source} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded border border-line-strong bg-surface px-2 py-1 text-xs text-ink focus:border-primary focus:outline-none"
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
