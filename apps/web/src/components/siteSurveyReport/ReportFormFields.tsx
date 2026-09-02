"use client";

import { useEffect, useRef, useState } from "react";
import {
  CalendarClock,
  ChevronDown,
  FileCheck2,
  HardHat,
  Info,
  LayoutGrid,
  MapPin,
  Sparkles,
  Store,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FieldIndicator } from "./FieldIndicator";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Notifications";
import { cn } from "@/lib/cn";
import { supabase } from "@/lib/supabase";
import { fetchAllRows } from "@/lib/dashboard-queries";
import type { DeliveryTiming, EntranceFloorLocation, FieldSourceKey, FieldSources, PositionMarker, SiteSurveyFormData } from "@/lib/siteSurveyReport/types";
import { APPLE_PROGRAM_OPTIONS, DELIVERY_TIMING_LABEL, emptyFormData } from "@/lib/siteSurveyReport/types";

// The inspection form -- shared by DetailsStep (manual entry), and the
// "Default Answers" settings page (SiteSurveyReportDefaultsClient.tsx, via
// the FormDataFields export below, header section omitted).
//
// Presented as a stack of rounded, shadowed "cards" (one per section --
// LFG Connect's own card look, see LfgSiteCardGrid.tsx: rounded-[20px]
// border shadow-2) -- every section still starts COLLAPSED except the
// first, so the whole form is "visible in one shot" as a stack of card
// headers with a filled-count badge. Inside an open card, every field is
// one compact, landscape (label-left, control-right) ROW rather than a
// multi-column grid. Rows themselves are borderless and simply share ONE
// line with their neighbour via the card body's own `divide-y` (per
// feedback that a full 4-sided box per row, stacked tightly, read as "too
// many lines") -- Row no longer draws its own border/rounded box, and the
// two field-group panels that used to (MiniFieldsRow, the Store Opening
// Times day-grid) dropped theirs too, so nothing nested inside the
// divide-y list doubles up a line against it. A Yes/No question and its
// "if Yes/No, give details" follow-up are ONE row: real radio buttons
// (native <input type="radio">, tinted via accent-color) plus the detail
// input inline. A single-choice "pick one of these" question (Entrances &
// Floors, the two position markers) is a ButtonGroupRow -- small pill
// buttons, single-select. Several small, short-answer fields that are
// genuinely independent (the Apple Representative's Name/Mobile/Email)
// are grouped into one MiniFieldsRow instead -- a single compact row
// holding 2-4 small labeled inputs side by side, matching this app's own
// "Store Opening Times" day-grid pattern. Field labels/inputs stay small
// (text-[12px]/text-[13px]) and tightly padded throughout, matching this
// app's own existing compact patterns
// (Comments.tsx, WorkflowTimeline.tsx, etc).

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
  /**
   * Where the "saved defaults" link points. Defaults to the staff-only
   * /workspaces/site-survey-report/defaults page. The LFG partner bridge
   * (LfgPartnerSiteSurveyReportBridge.tsx) passes undefined explicitly via
   * its own prop chain to hide the link entirely -- that page is an
   * MMDI-side configuration screen a partner account can't reach anyway
   * (middleware bounces any /workspaces/* request from a partner role
   * straight back to /lfg).
   */
  defaultsHref?: string;
}

export function ReportFormFields({ header, onHeaderChange, formData, onFormDataChange, fieldSources, onTouched, defaultsHref }: Props) {
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
        <p className="text-[12px] text-ink-secondary">
          Tap a card to open it — only what&apos;s still blank needs your input.
          {defaultsHref && (
            <>
              {" "}
              Set up your{" "}
              <a href={defaultsHref} target="_blank" rel="noreferrer" className="font-medium text-primary hover:underline">
                saved defaults
              </a>{" "}
              once and most of this fills itself in.
            </>
          )}
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
        <SelectRow
          label="Apple Program"
          value={header.program}
          onChange={(v) => {
            onHeaderChange("program", v);
            onTouched("program");
          }}
          source={fieldSources.program}
          options={[["", "— Select —"], ...APPLE_PROGRAM_OPTIONS.map((p) => [p, p] as [string, string])]}
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

// One distinct LFG Connect ASM (Apple team contact) -- name/mobile/email,
// deduped by that combination.
interface AsmContact {
  name: string;
  mobile: string;
  email: string;
}

/**
 * Every distinct ASM (name/mobile/email combination) already on file across
 * LFG Connect's own site records (lfg_sites.asm_name/asm_mobile/asm_email)
 * -- feeds the "Select ASM" picker below. Paginated via fetchAllRows (not a
 * plain `.select()`) for the same reason useLfgDistinctValues.ts is: a
 * plain client `.limit()`/no-limit select silently truncates past
 * PostgREST's 1000-row server-side cap, which would quietly drop rarer ASMs
 * from this list.
 */
function useAsmContacts(): AsmContact[] {
  const [contacts, setContacts] = useState<AsmContact[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchAllRows<{ asm_name: string | null; asm_mobile: string | null; asm_email: string | null }>((from, to) =>
      supabase.from("lfg_sites").select("asm_name, asm_mobile, asm_email").not("asm_name", "is", null).range(from, to)
    ).then((rows) => {
      if (cancelled) return;
      const map = new Map<string, AsmContact>();
      for (const row of rows) {
        const name = (row.asm_name ?? "").trim();
        if (!name) continue;
        const mobile = (row.asm_mobile ?? "").trim();
        const email = (row.asm_email ?? "").trim();
        map.set(`${name}|${mobile}|${email}`, { name, mobile, email });
      }
      setContacts(Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return contacts;
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
  const asmContacts = useAsmContacts();
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
        <Row>
          <RowLabel label="Select ASM (fills Apple Representative below)" />
          <select
            defaultValue=""
            onChange={(e) => {
              const idx = Number(e.target.value);
              const contact = asmContacts[idx];
              if (!contact) return;
              f("appleRepresentativeName", contact.name);
              f("appleRepresentativeMobile", contact.mobile);
              f("appleRepresentativeEmail", contact.email);
              e.target.value = "";
            }}
            className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink focus:border-primary focus:outline-none"
          >
            <option value="">{asmContacts.length ? "— Choose from LFG Connect —" : "No ASM records found yet"}</option>
            {asmContacts.map((c, i) => (
              <option key={`${c.name}-${c.mobile}-${c.email}-${i}`} value={i}>
                {c.name}
                {c.mobile ? ` — ${c.mobile}` : ""}
                {c.email ? ` — ${c.email}` : ""}
              </option>
            ))}
          </select>
        </Row>
        <MiniFieldsRow
          title="Apple Representative"
          fields={[
            { key: "appleRepresentativeName", label: "Name", value: formData.appleRepresentativeName, onChange: (v) => f("appleRepresentativeName", v), source: src.appleRepresentativeName },
            { key: "appleRepresentativeMobile", label: "Mobile", value: formData.appleRepresentativeMobile, onChange: (v) => f("appleRepresentativeMobile", v), source: src.appleRepresentativeMobile },
            { key: "appleRepresentativeEmail", label: "Email", value: formData.appleRepresentativeEmail, onChange: (v) => f("appleRepresentativeEmail", v), source: src.appleRepresentativeEmail },
          ]}
        />
        <TextRow label="Retailer Representative" value={formData.retailerRepresentative} onChange={(v) => f("retailerRepresentative", v)} source={src.retailerRepresentative} />
        <TextRow label="Store Person Contacted" value={formData.storePersonContacted} onChange={(v) => f("storePersonContacted", v)} source={src.storePersonContacted} />
        <TextRow label="Store Contact Number" value={formData.storeContactNumber} onChange={(v) => f("storeContactNumber", v)} source={src.storeContactNumber} />
        <SelectRow
          label="Survey Company"
          value={formData.surveyCompany}
          onChange={(v) => f("surveyCompany", v as SiteSurveyFormData["surveyCompany"])}
          source={src.surveyCompany}
          options={[
            ["", "— Select —"],
            ["mmdi", "MMDI"],
            ["i_and_s", "I&S"],
          ]}
        />
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
        <ButtonGroupRow
          label="Entrances & Floors"
          value={formData.entranceFloorLocation}
          onChange={(v) => f("entranceFloorLocation", v)}
          source={src.entranceFloorLocation}
          options={ENTRANCE_FLOOR_OPTIONS}
        />
        <TextRow label="Floor Apple Program Is On" value={formData.floorApplProgramOn} onChange={(v) => f("floorApplProgramOn", v)} source={src.floorApplProgramOn} />
        <YesNoRow
          name="storeOpenPlan"
          label="Is the store open plan?"
          value={formData.storeOpenPlan}
          onChange={(v) => f("storeOpenPlan", v as SiteSurveyFormData["storeOpenPlan"])}
          source={src.storeOpenPlan}
          detail={{ value: formData.openPlanLayoutDescription, onChange: (v) => f("openPlanLayoutDescription", v), source: src.openPlanLayoutDescription, placeholder: "If No, describe layout" }}
        />
        <TextRow label="Condition of silicon joins/edges" value={formData.siliconJoinsCondition} onChange={(v) => f("siliconJoinsCondition", v)} source={src.siliconJoinsCondition} />
        <TextRow label="Current artwork / store stickers" value={formData.existingCreative} onChange={(v) => f("existingCreative", v)} source={src.existingCreative} />
        <YesNoRow
          name="creativeRemovable"
          label="Can existing creative be removed?"
          value={formData.creativeRemovable}
          onChange={(v) => f("creativeRemovable", v as SiteSurveyFormData["creativeRemovable"])}
          source={src.creativeRemovable}
        />
        <PositionMarkerRow label="Mark the Store Location" value={formData.storeLocationMarker} onChange={(v) => f("storeLocationMarker", v)} source={src.storeLocationMarker} />
        <PositionMarkerRow
          label="Indicate Position of Apple Program Within the Store"
          value={formData.appleProgramPositionMarker}
          onChange={(v) => f("appleProgramPositionMarker", v)}
          source={src.appleProgramPositionMarker}
        />
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
        <div className="flex flex-col px-0.5 py-2.5">
          <span className="mb-1 text-[12px] font-medium text-ink-secondary">Store Opening Times</span>
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
                <span className="text-[11px] font-medium text-ink-muted">{day}</span>
                <input
                  value={formData[key]}
                  onChange={(e) => f(key, e.target.value)}
                  className="w-full rounded border border-line-strong bg-surface px-1.5 py-1 text-[12px] text-ink focus:border-primary focus:outline-none"
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
        <SelectRow
          label="Delivery timings"
          value={formData.deliveryTimes}
          onChange={(v) => f("deliveryTimes", v as DeliveryTiming)}
          source={src.deliveryTimes}
          options={[["", "— Select —"], ...Object.entries(DELIVERY_TIMING_LABEL)] as [string, string][]}
        />
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
          name="extraLightingRequired"
          label="Extra lighting for night view?"
          value={formData.extraLightingRequired}
          onChange={(v) => f("extraLightingRequired", v as SiteSurveyFormData["extraLightingRequired"])}
          source={src.extraLightingRequired}
          detail={{ value: formData.extraLightingDescription, onChange: (v) => f("extraLightingDescription", v), source: src.extraLightingDescription, placeholder: "Description" }}
        />
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
      </SurveyCard>
    </>
  );
}

// ---------------------------------------------------------------------------
// Section field-key lists -- drive each SurveyCard's "X/Y filled" badge.
// ---------------------------------------------------------------------------

const PERSONNEL_KEYS: (keyof SiteSurveyFormData)[] = [
  "appleRepresentativeName",
  "appleRepresentativeMobile",
  "appleRepresentativeEmail",
  "retailerRepresentative",
  "storePersonContacted",
  "storeContactNumber",
  "surveyCompany",
];
const STORE_DESCRIPTION_KEYS: (keyof SiteSurveyFormData)[] = [
  "storeLocationType",
  "entranceFloorLocation",
  "floorApplProgramOn",
  "storeOpenPlan",
  "openPlanLayoutDescription",
  "siliconJoinsCondition",
  "existingCreative",
  "creativeRemovable",
  "storeLocationMarker",
  "appleProgramPositionMarker",
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
const DELIVERY_KEYS: (keyof SiteSurveyFormData)[] = ["deliveryTimes"];
const GENERAL_KEYS: (keyof SiteSurveyFormData)[] = ["weatherAffectsInstall", "weatherAffectsInstallDetails", "extraLightingRequired", "extraLightingDescription"];
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
];
const SAFETY_KEYS: (keyof SiteSurveyFormData)[] = ["siteSafeForInstall", "siteSafeDescription", "safetyConcerns", "safetyConcernsDetails", "safetyEquipmentRequired", "safetyEquipmentDetails"];
const APPROVALS_KEYS: (keyof SiteSurveyFormData)[] = ["specialApprovalsNeeded", "specialApprovalsDetails", "chainCentralApprovalNeeded", "chainCentralApprovalReason"];

const SECTION_KEYS = ["site", "personnel", "store", "install", "delivery", "general", "details", "safety", "approvals"];

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

// Each section's header now carries its own colour (light tint background,
// a solid-colour icon chip for contrast against that tint) rather than a
// neutral bg-surface-sunken bar with only a small coloured icon square --
// per feedback wanting the screen to read as more thematically colourful.
// headerBorder tints the card's outer ring too, so a collapsed card still
// visibly carries its section's colour, not just its (now-hidden) header.
const SECTION_COLOR_CLASSES: Record<SectionColor, { chipBg: string; chipText: string; headerBg: string; headerBorder: string }> = {
  primary: { chipBg: "bg-primary", chipText: "text-on-brand", headerBg: "bg-primary-tint", headerBorder: "border-primary/25" },
  info: { chipBg: "bg-info", chipText: "text-on-brand", headerBg: "bg-info-tint", headerBorder: "border-info/25" },
  success: { chipBg: "bg-success", chipText: "text-on-brand", headerBg: "bg-success-tint", headerBorder: "border-success/25" },
  warning: { chipBg: "bg-warning", chipText: "text-on-brand", headerBg: "bg-warning-tint", headerBorder: "border-warning/25" },
  danger: { chipBg: "bg-danger", chipText: "text-on-brand", headerBg: "bg-danger-tint", headerBorder: "border-danger/25" },
  ai: { chipBg: "bg-ai", chipText: "text-on-brand", headerBg: "bg-ai-tint", headerBorder: "border-ai/25" },
};

/**
 * A collapsible, rounded "card" per section -- LFG Connect's own card look
 * (see LfgSiteCardGrid.tsx: rounded-[20px] border shadow-2), with the
 * radius pulled in a step (rounded-2xl, 16px) and each header tinted by
 * its own SECTION_COLOR_CLASSES entry -- both per feedback wanting a
 * tighter corner radius and a more colourful screen than the original
 * neutral-everywhere treatment. The header row (colour chip + icon, title,
 * X/Y filled badge, chevron) is always visible even collapsed, so the
 * WHOLE form reads as a compact stack of card headers at a glance; only
 * the section actually being worked on expands and takes up vertical
 * space. Controlled (open/onToggle), not self-managed state, so a parent
 * "Expand all"/"Collapse all" control can drive every card at once. Direct
 * children are rendered as a stack of compact landscape ROWS (label-left,
 * control-right), not a wrapping grid -- see
 * Row/TextRow/YesNoRow/MiniFieldsRow/PositionMarkerRow etc below.
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
    <div className={`overflow-hidden rounded-2xl border ${c.headerBorder} bg-surface shadow-1 transition-shadow hover:shadow-2`}>
      <button type="button" onClick={() => onToggle(sectionKey)} className={`flex w-full items-center gap-2 ${c.headerBg} px-3.5 py-2.5 text-left`}>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${c.chipBg} ${c.chipText}`}>
          <Icon size={13} />
        </span>
        <span className="flex-1 text-[12px] font-semibold uppercase tracking-wide text-ink-secondary">{title}</span>
        <span className={`text-[11px] font-medium tabular-nums ${complete ? "text-success" : "text-ink-muted"}`}>
          {filled}/{total}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="flex flex-col divide-y divide-line border-t border-line px-2.5">{children}</div>}
    </div>
  );
}

/**
 * Shared landscape row shell: label column left, control(s) fill the rest.
 * Wraps on narrow screens, one compact line on desktop. Borderless --
 * SurveyCard's own `divide-y` gives each row exactly one shared line
 * against its neighbour, rather than every row drawing its own 4-sided
 * box (the previous look, which read as a dense grid of lines once a
 * section had more than a couple of fields).
 */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-0.5 py-2.5 sm:flex-nowrap">{children}</div>;
}

function RowLabel({ label, source }: { label: string; source?: FieldSources[FieldSourceKey] }) {
  return (
    <span className="flex w-full shrink-0 items-center gap-1 text-[12px] font-medium leading-tight text-ink-secondary sm:w-[240px]">
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
        className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink focus:border-primary focus:outline-none"
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
        className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink focus:border-primary focus:outline-none"
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
 * right alongside. `name` must be unique per field instance (radio groups
 * share selection state by `name`) -- pass the underlying formData key.
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
          <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-[12px] text-ink">
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
            className="min-w-[10rem] flex-1 rounded border border-line-strong bg-surface px-2 py-1 text-[13px] text-ink focus:border-primary focus:outline-none"
          />
          <FieldIndicator source={detail.source} />
        </>
      )}
    </Row>
  );
}

/**
 * Several small, short-answer fields packed into ONE compact row (2-4
 * mini labeled inputs side by side) instead of a full Row each -- same
 * visual pattern as the pre-existing "Store Opening Times" day grid inside
 * Installing on Site, generalized here for any short-value field group
 * (the split Apple Representative Name/Mobile/Email, etc). For a
 * single-choice "pick one of these" question, use ButtonGroupRow instead.
 */
function MiniFieldsRow({
  title,
  fields,
}: {
  title: string;
  fields: { key: string; label: string; value: string; onChange: (v: string) => void; source?: FieldSources[FieldSourceKey] }[];
}) {
  return (
    <div className="flex flex-col px-0.5 py-2.5">
      <span className="mb-1 text-[12px] font-medium text-ink-secondary">{title}</span>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {fields.map((fld) => (
          <label key={fld.key} className="flex flex-col gap-0.5">
            <span className="flex items-center gap-1 text-[11px] font-medium text-ink-muted">
              {fld.label}
              <FieldIndicator source={fld.source} />
            </span>
            <input
              value={fld.value}
              onChange={(e) => fld.onChange(e.target.value)}
              className="w-full rounded border border-line-strong bg-surface px-1.5 py-1 text-[12px] text-ink focus:border-primary focus:outline-none"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

/**
 * A single-select row of small pill buttons -- "give buttons to select any
 * one of" a fixed set of options, rather than free text, a native radio
 * group, or a <select>. Clicking the already-selected button clears it
 * back to unanswered. Generic over the option-value type so both
 * PositionMarkerRow (Front/Back/Left/Right/Center) and the Entrances &
 * Floors picker below share one implementation.
 */
function ButtonGroupRow<T extends string>({
  label,
  value,
  onChange,
  source,
  options,
}: {
  label: string;
  value: T;
  onChange: (v: T) => void;
  source?: FieldSources[FieldSourceKey];
  options: { value: Exclude<T, "">; label: string }[];
}) {
  return (
    <Row>
      <RowLabel label={label} source={source} />
      <div className="flex flex-wrap items-center gap-1.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange((value === opt.value ? "" : opt.value) as T)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
              value === opt.value ? "border-primary bg-primary text-on-brand" : "border-line-strong bg-surface text-ink-secondary hover:bg-surface-sunken"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </Row>
  );
}

const POSITION_MARKER_OPTIONS: { value: Exclude<PositionMarker, "">; label: string }[] = [
  { value: "front", label: "Front" },
  { value: "back", label: "Back" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "center", label: "Center" },
];

/** Front/Back/Left/Right/Center, relative to the store's own entrance -- see ButtonGroupRow. */
function PositionMarkerRow({
  label,
  value,
  onChange,
  source,
}: {
  label: string;
  value: PositionMarker;
  onChange: (v: PositionMarker) => void;
  source?: FieldSources[FieldSourceKey];
}) {
  return <ButtonGroupRow label={label} value={value} onChange={onChange} source={source} options={POSITION_MARKER_OPTIONS} />;
}

const ENTRANCE_FLOOR_OPTIONS: { value: Exclude<EntranceFloorLocation, "">; label: string }[] = [
  { value: "entrances_into_mall", label: "Entrances — Into the Mall" },
  { value: "entrances_into_store", label: "Entrances — Into the Store" },
  { value: "floors_within_mall", label: "Floors — Within the Mall" },
  { value: "floors_within_store", label: "Floors — Within the Store" },
];
