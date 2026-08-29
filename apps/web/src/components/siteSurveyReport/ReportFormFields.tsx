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

      <Section title="On-site Personnel Details">
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
            label="Surveyor's Details"
            value={header.surveyor_name}
            onChange={(v) => {
              onHeaderChange("surveyor_name", v);
              onTouched("surveyor_name");
            }}
            source={fieldSources.surveyor_name}
          />
          <TextField
            label="Apple Representative"
            value={formData.appleRepresentative}
            onChange={(v) => set(onFormDataChange, onTouched, "appleRepresentative", v)}
            source={fieldSources.appleRepresentative}
          />
          <TextField
            label="Retailer Representative"
            value={formData.retailerRepresentative}
            onChange={(v) => set(onFormDataChange, onTouched, "retailerRepresentative", v)}
            source={fieldSources.retailerRepresentative}
          />
          <TextField
            label="Store Person Contacted"
            value={formData.storePersonContacted}
            onChange={(v) => set(onFormDataChange, onTouched, "storePersonContacted", v)}
            source={fieldSources.storePersonContacted}
          />
          <TextField
            label="Store Contact Number"
            value={formData.storeContactNumber}
            onChange={(v) => set(onFormDataChange, onTouched, "storeContactNumber", v)}
            source={fieldSources.storeContactNumber}
          />
          <TextField
            label="Printer / Survey Company"
            value={formData.printer}
            onChange={(v) => set(onFormDataChange, onTouched, "printer", v)}
            source={fieldSources.printer}
          />
        </Grid>
      </Section>

      <Section title="Store Description">
        <Grid>
          <SelectField
            label="Location of Store"
            value={formData.storeLocationType}
            onChange={(v) => set(onFormDataChange, onTouched, "storeLocationType", v as SiteSurveyFormData["storeLocationType"])}
            source={fieldSources.storeLocationType}
            options={[
              ["", "— Select —"],
              ["mall", "Mall"],
              ["retail_high_street", "Retail High Street"],
              ["retail_park", "Retail Park"],
              ["other", "Other"],
            ]}
          />
          <TextField
            label="Location of Store — if Other, please specify"
            value={formData.storeLocationOther}
            onChange={(v) => set(onFormDataChange, onTouched, "storeLocationOther", v)}
            source={fieldSources.storeLocationOther}
          />
          <TextField
            label="Number of Store Entrances — Into the Mall"
            value={formData.entrancesIntoMall}
            onChange={(v) => set(onFormDataChange, onTouched, "entrancesIntoMall", v)}
            source={fieldSources.entrancesIntoMall}
          />
          <TextField
            label="Number of Store Entrances — Into the Store"
            value={formData.entrancesIntoStore}
            onChange={(v) => set(onFormDataChange, onTouched, "entrancesIntoStore", v)}
            source={fieldSources.entrancesIntoStore}
          />
          <TextField
            label="Number of Floors — Within the Mall"
            value={formData.floorsWithinMall}
            onChange={(v) => set(onFormDataChange, onTouched, "floorsWithinMall", v)}
            source={fieldSources.floorsWithinMall}
          />
          <TextField
            label="Number of Floors — Within the Store"
            value={formData.floorsWithinStore}
            onChange={(v) => set(onFormDataChange, onTouched, "floorsWithinStore", v)}
            source={fieldSources.floorsWithinStore}
          />
          <TextField
            label="Floor Apple Program Is Situated On"
            value={formData.floorApplProgramOn}
            onChange={(v) => set(onFormDataChange, onTouched, "floorApplProgramOn", v)}
            source={fieldSources.floorApplProgramOn}
          />
          <YesNoField
            label="Is the store open plan?"
            value={formData.storeOpenPlan}
            onChange={(v) => set(onFormDataChange, onTouched, "storeOpenPlan", v as YesNo)}
            source={fieldSources.storeOpenPlan}
          />
          <TextAreaField
            label="If No, describe layout"
            value={formData.openPlanLayoutDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "openPlanLayoutDescription", v)}
            source={fieldSources.openPlanLayoutDescription}
          />
          <TextField
            label="Position of Apple Program Relative to Main Entrance"
            value={formData.applProgramPositionEntrance}
            onChange={(v) => set(onFormDataChange, onTouched, "applProgramPositionEntrance", v)}
            source={fieldSources.applProgramPositionEntrance}
            className="sm:col-span-2"
          />
          <TextAreaField
            label="Store Address"
            value={formData.siteStoreAddress}
            onChange={(v) => set(onFormDataChange, onTouched, "siteStoreAddress", v)}
            source={fieldSources.siteStoreAddress}
          />
          <TextAreaField
            label="Store Contact Details"
            value={formData.storeContactDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "storeContactDetails", v)}
            source={fieldSources.storeContactDetails}
          />
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

      <Section title="Installing on Site">
        <div className="flex flex-col gap-4">
          <div>
            <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-ink-secondary">Store Opening Times</span>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
                <TextField
                  key={key}
                  label={day}
                  value={formData[key]}
                  onChange={(v) => set(onFormDataChange, onTouched, key, v)}
                  source={fieldSources[key]}
                />
              ))}
            </div>
          </div>
          <Grid>
            <YesNoField
              label="Does the install need to happen outside store opening hours?"
              value={formData.installOutsideHours}
              onChange={(v) => set(onFormDataChange, onTouched, "installOutsideHours", v as YesNo)}
              source={fieldSources.installOutsideHours}
            />
            <TextAreaField
              label="If Yes, give details"
              value={formData.installOutsideHoursDetails}
              onChange={(v) => set(onFormDataChange, onTouched, "installOutsideHoursDetails", v)}
              source={fieldSources.installOutsideHoursDetails}
            />
            <YesNoField
              label="Does the retailer have preferred install days/time?"
              value={formData.retailerPreferredInstallTime}
              onChange={(v) => set(onFormDataChange, onTouched, "retailerPreferredInstallTime", v as YesNo)}
              source={fieldSources.retailerPreferredInstallTime}
            />
            <TextAreaField
              label="If Yes, give details"
              value={formData.retailerPreferredInstallDetails}
              onChange={(v) => set(onFormDataChange, onTouched, "retailerPreferredInstallDetails", v)}
              source={fieldSources.retailerPreferredInstallDetails}
            />
            <TextField
              label="Time and date of installation"
              value={formData.installationDateTime}
              onChange={(v) => set(onFormDataChange, onTouched, "installationDateTime", v)}
              source={fieldSources.installationDateTime}
            />
            <YesNoField
              label="Are work permits required?"
              options={["yes", "no", "unknown"] as const}
              value={formData.permitRequired}
              onChange={(v) => set(onFormDataChange, onTouched, "permitRequired", v as YesNo)}
              source={fieldSources.permitRequired}
              thirdOption="Unknown"
            />
            <TextAreaField
              label="Permit details (if Yes)"
              value={formData.permitDetails}
              onChange={(v) => set(onFormDataChange, onTouched, "permitDetails", v)}
              source={fieldSources.permitDetails}
            />
          </Grid>
        </div>
      </Section>

      <Section title="Deliveries to Store">
        <Grid>
          <TextField
            label="Store Contact Name and Number"
            value={formData.deliveryContactNameNumber}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryContactNameNumber", v)}
            source={fieldSources.deliveryContactNameNumber}
            className="sm:col-span-2"
          />
          <YesNoField
            label="Is the delivery address the same as the store?"
            value={formData.deliveryAddressSameAsStore}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryAddressSameAsStore", v as YesNo)}
            source={fieldSources.deliveryAddressSameAsStore}
          />
          <TextAreaField
            label="If No, give address"
            value={formData.deliveryAddress}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryAddress", v)}
            source={fieldSources.deliveryAddress}
          />
          <TextField
            label="Day/time deliveries can be made"
            value={formData.deliveryTimes}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryTimes", v)}
            source={fieldSources.deliveryTimes}
          />
          <TextAreaField
            label="Other delivery comments"
            value={formData.deliveryOtherComments}
            onChange={(v) => set(onFormDataChange, onTouched, "deliveryOtherComments", v)}
            source={fieldSources.deliveryOtherComments}
          />
        </Grid>
      </Section>

      <Section title="General Site Information">
        <Grid>
          <YesNoField
            label="Will weather conditions affect the install at this site?"
            value={formData.weatherAffectsInstall}
            onChange={(v) => set(onFormDataChange, onTouched, "weatherAffectsInstall", v as YesNo)}
            source={fieldSources.weatherAffectsInstall}
          />
          <TextAreaField
            label="If Yes, give details"
            value={formData.weatherAffectsInstallDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "weatherAffectsInstallDetails", v)}
            source={fieldSources.weatherAffectsInstallDetails}
          />
          <YesNoField
            label="Confirm all possible opportunities have been surveyed"
            value={formData.allOpportunitiesSurveyed}
            onChange={(v) => set(onFormDataChange, onTouched, "allOpportunitiesSurveyed", v as YesNo)}
            source={fieldSources.allOpportunitiesSurveyed}
          />
          <TextAreaField
            label="If No, give reason"
            value={formData.allOpportunitiesSurveyedReason}
            onChange={(v) => set(onFormDataChange, onTouched, "allOpportunitiesSurveyedReason", v)}
            source={fieldSources.allOpportunitiesSurveyedReason}
          />
          <TextAreaField
            label="Detail any other information that may be helpful"
            value={formData.generalNotes}
            onChange={(v) => set(onFormDataChange, onTouched, "generalNotes", v)}
            source={fieldSources.generalNotes}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Site Suitability / Installation Details">
        <Grid>
          <YesNoField
            label="Is the proposed install opportunity highly visible?"
            value={formData.siteVisibility}
            onChange={(v) => set(onFormDataChange, onTouched, "siteVisibility", v as YesNo)}
            source={fieldSources.siteVisibility}
          />
          <TextAreaField
            label="Description"
            value={formData.siteVisibilityDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "siteVisibilityDescription", v)}
            source={fieldSources.siteVisibilityDescription}
          />
          <YesNoField
            label="Is this a premium site?"
            value={formData.premiumLocation}
            onChange={(v) => set(onFormDataChange, onTouched, "premiumLocation", v as YesNo)}
            source={fieldSources.premiumLocation}
          />
          <TextAreaField
            label="Description"
            value={formData.premiumLocationDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "premiumLocationDescription", v)}
            source={fieldSources.premiumLocationDescription}
          />
          <YesNoField
            label="Is the installation time flexible?"
            value={formData.installationTimeFlexible}
            onChange={(v) => set(onFormDataChange, onTouched, "installationTimeFlexible", v as YesNo)}
            source={fieldSources.installationTimeFlexible}
          />
          <TextAreaField
            label="Description"
            value={formData.installationTimeFlexibleDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "installationTimeFlexibleDescription", v)}
            source={fieldSources.installationTimeFlexibleDescription}
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

      <Section title="Site Details">
        <Grid>
          <TextAreaField
            label="What is the maximum working space?"
            value={formData.maxWorkingSpace}
            onChange={(v) => set(onFormDataChange, onTouched, "maxWorkingSpace", v)}
            source={fieldSources.maxWorkingSpace}
            className="sm:col-span-2"
          />
          <YesNoField
            label="Is access equipment available on site?"
            value={formData.accessEquipmentAvailable}
            onChange={(v) => set(onFormDataChange, onTouched, "accessEquipmentAvailable", v as YesNo)}
            source={fieldSources.accessEquipmentAvailable}
          />
          <TextAreaField
            label="Description"
            value={formData.accessEquipmentDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "accessEquipmentDescription", v)}
            source={fieldSources.accessEquipmentDescription}
          />
          <YesNoField
            label="Is powered access to be used?"
            value={formData.poweredAccessUsed}
            onChange={(v) => set(onFormDataChange, onTouched, "poweredAccessUsed", v as YesNo)}
            source={fieldSources.poweredAccessUsed}
          />
          <TextAreaField
            label="Description"
            value={formData.poweredAccessDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "poweredAccessDescription", v)}
            source={fieldSources.poweredAccessDescription}
          />
          <YesNoField
            label="Are there any access issues?"
            value={formData.accessIssues}
            onChange={(v) => set(onFormDataChange, onTouched, "accessIssues", v as YesNo)}
            source={fieldSources.accessIssues}
          />
          <TextAreaField
            label="Description"
            value={formData.accessIssuesDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "accessIssuesDescription", v)}
            source={fieldSources.accessIssuesDescription}
          />
          <SelectField
            label="Is the site permanent or temporary?"
            value={formData.siteType}
            onChange={(v) => set(onFormDataChange, onTouched, "siteType", v as SiteSurveyFormData["siteType"])}
            source={fieldSources.siteType}
            options={[
              ["", "— Select —"],
              ["permanent", "Permanent"],
              ["temporary", "Temporary"],
            ]}
          />
          <TextField
            label="If temporary, how long is the site available?"
            value={formData.siteTypeDuration}
            onChange={(v) => set(onFormDataChange, onTouched, "siteTypeDuration", v)}
            source={fieldSources.siteTypeDuration}
          />
          <YesNoField
            label="Is there any competitor advertising close to the proposed install?"
            value={formData.competitorAdvertising}
            onChange={(v) => set(onFormDataChange, onTouched, "competitorAdvertising", v as YesNo)}
            source={fieldSources.competitorAdvertising}
          />
          <TextAreaField
            label="Description"
            value={formData.competitorAdvertisingDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "competitorAdvertisingDescription", v)}
            source={fieldSources.competitorAdvertisingDescription}
          />
          <TextAreaField
            label="Detail any general information to ensure a successful install"
            value={formData.generalInstallInfo}
            onChange={(v) => set(onFormDataChange, onTouched, "generalInstallInfo", v)}
            source={fieldSources.generalInstallInfo}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Safety">
        <Grid>
          <YesNoField
            label="Is the site safe enough to do the installation?"
            value={formData.siteSafeForInstall}
            onChange={(v) => set(onFormDataChange, onTouched, "siteSafeForInstall", v as YesNo)}
            source={fieldSources.siteSafeForInstall}
          />
          <TextAreaField
            label="Description"
            value={formData.siteSafeDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "siteSafeDescription", v)}
            source={fieldSources.siteSafeDescription}
          />
          <YesNoField
            label="Any specific safety concerns?"
            value={formData.safetyConcerns}
            onChange={(v) => set(onFormDataChange, onTouched, "safetyConcerns", v as YesNo)}
            source={fieldSources.safetyConcerns}
          />
          <TextAreaField
            label="Details"
            value={formData.safetyConcernsDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "safetyConcernsDetails", v)}
            source={fieldSources.safetyConcernsDetails}
          />
          <YesNoField
            label="Any specific safety equipment or device required during installation?"
            value={formData.safetyEquipmentRequired}
            onChange={(v) => set(onFormDataChange, onTouched, "safetyEquipmentRequired", v as YesNo)}
            source={fieldSources.safetyEquipmentRequired}
          />
          <TextAreaField
            label="Details"
            value={formData.safetyEquipmentDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "safetyEquipmentDetails", v)}
            source={fieldSources.safetyEquipmentDetails}
          />
        </Grid>
      </Section>

      <Section title="Graphics">
        <Grid>
          <YesNoField
            label="Does the store regard the site as being at risk from graffiti?"
            value={formData.graffitiRisk}
            onChange={(v) => set(onFormDataChange, onTouched, "graffitiRisk", v as YesNo)}
            source={fieldSources.graffitiRisk}
          />
          <TextAreaField
            label="Description"
            value={formData.graffitiRiskDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "graffitiRiskDescription", v)}
            source={fieldSources.graffitiRiskDescription}
          />
          <YesNoField
            label="Is extra lighting required for better viewing at night?"
            value={formData.extraLightingRequired}
            onChange={(v) => set(onFormDataChange, onTouched, "extraLightingRequired", v as YesNo)}
            source={fieldSources.extraLightingRequired}
          />
          <TextAreaField
            label="Description"
            value={formData.extraLightingDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "extraLightingDescription", v)}
            source={fieldSources.extraLightingDescription}
          />
          <YesNoField
            label="Is a cutout required for the graphics?"
            value={formData.graphicsCutoutRequired}
            onChange={(v) => set(onFormDataChange, onTouched, "graphicsCutoutRequired", v as YesNo)}
            source={fieldSources.graphicsCutoutRequired}
          />
          <TextAreaField
            label="Description"
            value={formData.graphicsCutoutDescription}
            onChange={(v) => set(onFormDataChange, onTouched, "graphicsCutoutDescription", v)}
            source={fieldSources.graphicsCutoutDescription}
          />
          <TextAreaField
            label="Any other graphics information"
            value={formData.graphicsOtherInfo}
            onChange={(v) => set(onFormDataChange, onTouched, "graphicsOtherInfo", v)}
            source={fieldSources.graphicsOtherInfo}
            className="sm:col-span-2"
          />
        </Grid>
      </Section>

      <Section title="Approvals">
        <Grid>
          <YesNoField
            label="Does the store need any special approvals?"
            value={formData.specialApprovalsNeeded}
            onChange={(v) => set(onFormDataChange, onTouched, "specialApprovalsNeeded", v as YesNo)}
            source={fieldSources.specialApprovalsNeeded}
          />
          <TextAreaField
            label="If Yes, give details"
            value={formData.specialApprovalsDetails}
            onChange={(v) => set(onFormDataChange, onTouched, "specialApprovalsDetails", v)}
            source={fieldSources.specialApprovalsDetails}
          />
          <YesNoField
            label="If chain store, does it need approval from central team?"
            value={formData.chainCentralApprovalNeeded}
            onChange={(v) => set(onFormDataChange, onTouched, "chainCentralApprovalNeeded", v as YesNo)}
            source={fieldSources.chainCentralApprovalNeeded}
          />
          <TextAreaField
            label="If No, give reason"
            value={formData.chainCentralApprovalReason}
            onChange={(v) => set(onFormDataChange, onTouched, "chainCentralApprovalReason", v)}
            source={fieldSources.chainCentralApprovalReason}
          />
          <TextAreaField
            label="Detail any other information that may be helpful"
            value={formData.approvalsOtherInfo}
            onChange={(v) => set(onFormDataChange, onTouched, "approvalsOtherInfo", v)}
            source={fieldSources.approvalsOtherInfo}
            className="sm:col-span-2"
          />
        </Grid>
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
  source: Props["fieldSources"][FieldSourceKey];
  options: readonly (readonly [string, string])[];
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <FieldLabel label={label} source={source} />
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
