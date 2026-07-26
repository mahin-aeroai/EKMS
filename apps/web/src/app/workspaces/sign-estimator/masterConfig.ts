// src/app/workspaces/sign-estimator/masterConfig.ts
//
// Config-driven schema for the 7 master-data tables, mirroring the original
// SignERP_v2.html's MOD_CFG object (one generic modal + one generic table
// renderer driven by a per-type config, instead of 7 hand-written CRUD
// screens). Each entry describes: which Supabase table it maps to, which
// columns show in the list table, and which fields appear in the add/edit
// form (with type + validation), so MastersTab.tsx and MasterEditorDialog.tsx
// can stay generic.

export type FieldType = "text" | "number" | "select" | "checkbox" | "tags";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  step?: number;
}

export interface ColumnDef {
  key: string;
  label: string;
  render?: (row: Record<string, unknown>) => string;
}

export interface MasterConfig {
  id: string;
  table: string;
  label: string;
  singular: string;
  columns: ColumnDef[];
  fields: FieldDef[];
  defaults: Record<string, unknown>;
}

const CATEGORY_OPTIONS = [
  { value: "nonlit", label: "Non-Lit" },
  { value: "seg-indoor", label: "SEG Indoor" },
  { value: "seg-outdoor", label: "SEG Outdoor" },
];

const USAGE_OPTIONS = [
  { value: "Indoor", label: "Indoor" },
  { value: "Outdoor", label: "Outdoor" },
  { value: "Both", label: "Both" },
];

const IP_OPTIONS = [
  { value: "IP20", label: "IP20 (Indoor)" },
  { value: "IP65", label: "IP65 (Outdoor)" },
  { value: "IP67", label: "IP67 (Heavy Outdoor)" },
];

export const MASTER_CONFIGS: MasterConfig[] = [
  {
    id: "profiles",
    table: "sign_profiles",
    label: "Aluminium Profiles",
    singular: "Profile",
    columns: [
      { key: "name", label: "Name" },
      { key: "category", label: "Category" },
      { key: "stock_len", label: "Stock Len (mm)" },
      { key: "cost", label: "Cost/bar (₹)" },
      { key: "sku", label: "SKU" },
      { key: "supplier", label: "Supplier" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "category", label: "Category", type: "select", required: true, options: CATEGORY_OPTIONS },
      { key: "width", label: "Cross-section Width (mm)", type: "number" },
      { key: "depth", label: "Cross-section Depth (mm)", type: "number" },
      { key: "stock_len", label: "Stock Bar Length (mm)", type: "number", required: true },
      { key: "usage", label: "Usage", type: "select", options: USAGE_OPTIONS },
      { key: "cost", label: "Cost per Bar (₹)", type: "number", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { category: "nonlit", stock_len: 4000, usage: "Indoor", active: true },
  },
  {
    id: "ledMods",
    table: "sign_led_modules",
    label: "LED Modules",
    singular: "LED Module",
    columns: [
      { key: "name", label: "Name" },
      { key: "mod_w", label: "W (mm)" },
      { key: "mod_h", label: "H (mm)" },
      { key: "watt", label: "Watt" },
      { key: "ip", label: "IP Rating" },
      { key: "cost", label: "Cost (₹)" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "mod_w", label: "Module Width (mm)", type: "number", required: true },
      { key: "mod_h", label: "Module Height (mm)", type: "number", required: true },
      { key: "h_gap", label: "Default H-Gap (mm)", type: "number" },
      { key: "v_gap", label: "Default V-Gap (mm)", type: "number" },
      { key: "watt", label: "Wattage (W)", type: "number", required: true },
      { key: "ip", label: "IP Rating", type: "select", options: IP_OPTIONS },
      { key: "usage", label: "Usage", type: "select", options: USAGE_OPTIONS },
      { key: "cost", label: "Cost per Module (₹)", type: "number", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { h_gap: 50, v_gap: 50, ip: "IP20", usage: "Indoor", active: true },
  },
  {
    id: "ledBars",
    table: "sign_led_bars",
    label: "LED Bars",
    singular: "LED Bar",
    columns: [
      { key: "name", label: "Name" },
      { key: "bar_len", label: "Length (mm)" },
      { key: "bar_width", label: "Width (mm)" },
      { key: "watt", label: "Watt" },
      { key: "cost", label: "Cost (₹)" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "bar_len", label: "Stock Bar Length (mm)", type: "number", required: true },
      { key: "bar_width", label: "Bar Width (mm)", type: "number", required: true },
      { key: "watt", label: "Wattage (W)", type: "number", required: true },
      { key: "ip", label: "IP Rating", type: "select", options: IP_OPTIONS },
      { key: "usage", label: "Usage", type: "select", options: USAGE_OPTIONS },
      { key: "cost", label: "Cost per Piece (₹)", type: "number", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { ip: "IP65", usage: "Both", active: true },
  },
  {
    id: "drivers",
    table: "sign_led_drivers",
    label: "LED Drivers",
    singular: "Driver",
    columns: [
      { key: "watt", label: "Watt" },
      { key: "brand", label: "Brand" },
      { key: "volt", label: "Volt" },
      { key: "cost", label: "Cost (₹)" },
    ],
    fields: [
      { key: "watt", label: "Wattage (W)", type: "number", required: true },
      { key: "brand", label: "Brand / Model", type: "text" },
      { key: "volt", label: "Output Voltage (V)", type: "number" },
      { key: "cost", label: "Cost (₹)", type: "number", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { volt: 24, active: true },
  },
  {
    id: "sheets",
    table: "sign_sheets",
    label: "Sheet Materials",
    singular: "Sheet Material",
    columns: [
      { key: "name", label: "Name" },
      { key: "width", label: "W (mm)" },
      { key: "height", label: "H (mm)" },
      { key: "cost_per_sheet", label: "Cost/Sheet (₹)" },
      { key: "wastage", label: "Wastage %" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "width", label: "Sheet Width (mm)", type: "number", required: true },
      { key: "height", label: "Sheet Height (mm)", type: "number", required: true },
      { key: "thickness", label: "Thickness (mm)", type: "number" },
      { key: "cost_per_sheet", label: "Cost per Full Sheet (₹)", type: "number", required: true },
      { key: "wastage", label: "Default Wastage %", type: "number" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { width: 1220, height: 2440, wastage: 15, active: true },
  },
  {
    id: "printing",
    table: "sign_printing_media",
    label: "Printing Media",
    singular: "Print Media",
    columns: [
      { key: "name", label: "Name" },
      { key: "print_types", label: "Print Types" },
      { key: "cost_per_sqft", label: "Cost/sq.ft (₹)" },
      { key: "wastage", label: "Wastage %" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "print_types", label: "Print Types (comma-separated)", type: "tags" },
      { key: "cost_per_sqft", label: "Cost per sq.ft (₹)", type: "number", required: true },
      { key: "wastage", label: "Default Wastage %", type: "number" },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { wastage: 8, active: true },
  },
  {
    id: "accMaster",
    table: "sign_accessories",
    label: "Accessories",
    singular: "Accessory",
    columns: [
      { key: "name", label: "Name" },
      { key: "unit", label: "Unit" },
      { key: "mandatory", label: "Mandatory" },
      { key: "unit_cost", label: "Unit Cost (₹)" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "unit", label: "Unit", type: "select", options: [{ value: "pcs", label: "pcs" }, { value: "m", label: "m" }] },
      { key: "mandatory", label: "Mandatory (auto-added)", type: "checkbox" },
      { key: "unit_cost", label: "Unit Cost (₹)", type: "number", required: true },
      { key: "sku", label: "SKU", type: "text" },
      { key: "supplier", label: "Supplier", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { unit: "pcs", mandatory: false, active: true },
  },
];

export function configForId(id: string): MasterConfig | undefined {
  return MASTER_CONFIGS.find((c) => c.id === id);
}
