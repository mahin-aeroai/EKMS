// src/app/workspaces/masters/masterConfig.ts
//
// Config-driven schema for the 5 new business-master tables (Company,
// Branch, Sales Office, Sales Person, Product — see
// supabase-masters-schema.sql). Same MOD_CFG-style pattern as
// workspaces/sign-estimator/masterConfig.ts (one generic panel + one
// generic form driven by a per-type config instead of 5 near-duplicate
// screens), extended with a "reference" field type: a dropdown whose
// options are loaded at runtime from another master table (company ->
// branch -> sales office -> sales person, plus sales person -> employee),
// rather than a fixed, hand-typed options list.

export type FieldType = "text" | "number" | "select" | "checkbox" | "reference";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[]; // "select" only
  refTable?: string; // "reference" only -- Supabase table to load options from
  refLabelKey?: string; // "reference" only -- column to display, default "name"
  placeholder?: string;
}

export interface ColumnDef {
  key: string;
  label: string;
  // Set for a column that mirrors a "reference" field, so the generic
  // panel can resolve the stored id to a friendly label instead of
  // showing a raw uuid. Matches that field's refTable/refLabelKey.
  refTable?: string;
  refLabelKey?: string;
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

export const MASTER_CONFIGS: MasterConfig[] = [
  {
    id: "companies",
    table: "companies",
    label: "Companies",
    singular: "Company",
    columns: [
      { key: "name", label: "Company" },
      { key: "code", label: "Code" },
      { key: "city", label: "City" },
      { key: "state", label: "State" },
      { key: "phone", label: "Phone" },
    ],
    fields: [
      { key: "name", label: "Company Name", type: "text", required: true, placeholder: "e.g. KG Signs" },
      { key: "code", label: "Code", type: "text", placeholder: "e.g. KGS" },
      { key: "gstin", label: "GSTIN", type: "text" },
      { key: "pan", label: "PAN", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "website", label: "Website", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "pincode", label: "Pincode", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "branches",
    table: "branches",
    label: "Branches",
    singular: "Branch",
    columns: [
      { key: "name", label: "Branch" },
      { key: "code", label: "Code" },
      { key: "company_id", label: "Company", refTable: "companies", refLabelKey: "name" },
      { key: "city", label: "City" },
      { key: "phone", label: "Phone" },
    ],
    fields: [
      { key: "name", label: "Branch Name", type: "text", required: true, placeholder: "e.g. Hyderabad" },
      { key: "code", label: "Code", type: "text" },
      { key: "company_id", label: "Company", type: "reference", required: true, refTable: "companies", refLabelKey: "name" },
      { key: "address", label: "Address", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "pincode", label: "Pincode", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "sales_offices",
    table: "sales_offices",
    label: "Sales Offices",
    singular: "Sales Office",
    columns: [
      { key: "name", label: "Sales Office" },
      { key: "code", label: "Code" },
      { key: "company_id", label: "Company", refTable: "companies", refLabelKey: "name" },
      { key: "branch_id", label: "Branch", refTable: "branches", refLabelKey: "name" },
      { key: "region", label: "Region" },
    ],
    fields: [
      { key: "name", label: "Sales Office Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "company_id", label: "Company", type: "reference", required: true, refTable: "companies", refLabelKey: "name" },
      { key: "branch_id", label: "Branch", type: "reference", refTable: "branches", refLabelKey: "name" },
      { key: "region", label: "Region", type: "text" },
      { key: "address", label: "Address", type: "text" },
      { key: "city", label: "City", type: "text" },
      { key: "state", label: "State", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "sales_persons",
    table: "sales_persons",
    label: "Sales Persons",
    singular: "Sales Person",
    columns: [
      { key: "name", label: "Sales Person" },
      { key: "code", label: "Code" },
      { key: "sales_office_id", label: "Sales Office", refTable: "sales_offices", refLabelKey: "name" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
    ],
    fields: [
      { key: "name", label: "Name", type: "text", required: true },
      { key: "code", label: "Code", type: "text" },
      { key: "sales_office_id", label: "Sales Office", type: "reference", refTable: "sales_offices", refLabelKey: "name" },
      {
        key: "employee_id",
        label: "Linked Employee (optional)",
        type: "reference",
        refTable: "employees",
        refLabelKey: "name",
      },
      { key: "designation", label: "Designation", type: "text" },
      { key: "email", label: "Email", type: "text" },
      { key: "phone", label: "Phone", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
  {
    id: "products",
    table: "products",
    label: "Products",
    singular: "Product",
    columns: [
      { key: "name", label: "Product" },
      { key: "code", label: "Code" },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit" },
      { key: "hsn_code", label: "HSN Code" },
    ],
    fields: [
      { key: "name", label: "Product Name", type: "text", required: true },
      { key: "code", label: "Code / SKU", type: "text" },
      { key: "category", label: "Category", type: "text" },
      { key: "unit", label: "Unit", type: "text", placeholder: "e.g. sqft, pcs, nos" },
      { key: "hsn_code", label: "HSN Code", type: "text" },
      { key: "description", label: "Description", type: "text" },
      { key: "active", label: "Active", type: "checkbox" },
    ],
    defaults: { active: true },
  },
];
