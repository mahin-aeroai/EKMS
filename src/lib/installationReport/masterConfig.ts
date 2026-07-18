// Config-driven schema for the Installation Report tool's 6 master-data
// tables — mirrors src/app/workspaces/sign-estimator/masterConfig.ts's
// pattern (one generic CRUD panel driven by a per-type config, instead of 6
// near-duplicate screens). See MastersTab.tsx for the panel that reads
// this, and supabase-installation-report-master-migration.sql for the
// underlying tables.

export type FieldType = "text" | "number" | "select" | "checkbox";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
}

export interface MasterConfig {
  id: string;
  table: string;
  label: string;
  singular: string;
  orderBy: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

export const MASTER_CONFIGS: MasterConfig[] = [
  {
    // no_of_sites + the three default_* fields drive the "auto-create sites
    // when a multi-site store is picked" behavior in
    // InstallationReportClient.tsx: picking a store with no_of_sites > 1
    // auto-creates that many site blocks, each pre-filled with these
    // defaults (still fully editable per site afterwards).
    id: "stores",
    table: "installation_report_stores",
    label: "Store Master",
    singular: "Store",
    orderBy: "store_name",
    columns: [
      { key: "store_name", label: "Store Name" },
      { key: "address", label: "Address" },
      { key: "sfo_id", label: "SFO ID" },
      { key: "program", label: "Program" },
      { key: "campaign", label: "Campaign" },
      { key: "no_of_sites", label: "No of Sites" },
    ],
    fields: [
      { key: "store_name", label: "Store Name", type: "text", required: true },
      { key: "address", label: "Address", type: "text" },
      { key: "sfo_id", label: "SFO ID", type: "text" },
      { key: "program", label: "Program", type: "text", placeholder: "e.g. APR" },
      { key: "campaign", label: "Campaign", type: "text" },
      {
        key: "no_of_sites",
        label: "No of Sites",
        type: "number",
        placeholder: "1",
      },
      { key: "default_fixture_type", label: "Default Fixture Type", type: "text" },
      { key: "default_material", label: "Default Material", type: "text" },
      { key: "default_sign_type", label: "Default Sign Type", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true, no_of_sites: 1 },
  },
  {
    id: "creatives",
    table: "installation_report_creatives",
    label: "Creative Master",
    singular: "Creative",
    orderBy: "creative_name",
    columns: [
      { key: "creative_name", label: "Creative Name" },
      { key: "program", label: "Program" },
      { key: "campaign", label: "Campaign" },
      { key: "creative_version", label: "Version" },
    ],
    fields: [
      { key: "creative_name", label: "Creative Name / Artwork", type: "text", required: true },
      { key: "program", label: "Program", type: "text" },
      { key: "campaign", label: "Campaign", type: "text" },
      { key: "creative_version", label: "Creative Version", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "fixtureTypes",
    table: "installation_report_fixture_types",
    label: "Fixture Types",
    singular: "Fixture Type",
    orderBy: "name",
    columns: [{ key: "name", label: "Name" }],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "materials",
    table: "installation_report_materials",
    label: "Materials",
    singular: "Material",
    orderBy: "name",
    columns: [{ key: "name", label: "Name" }],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "signTypes",
    table: "installation_report_sign_types",
    label: "Sign Types",
    singular: "Sign Type",
    orderBy: "name",
    columns: [{ key: "name", label: "Name" }],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "teams",
    table: "installation_report_teams",
    label: "Installation Teams",
    singular: "Team",
    orderBy: "name",
    columns: [
      { key: "name", label: "Team Name" },
      { key: "lead_name", label: "Lead" },
    ],
    fields: [
      { key: "name", label: "Team Name", type: "text", required: true },
      { key: "lead_name", label: "Lead Name", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
];

export function configForId(id: string): MasterConfig | undefined {
  return MASTER_CONFIGS.find((c) => c.id === id);
}
