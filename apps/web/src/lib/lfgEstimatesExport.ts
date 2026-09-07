// LFG Connect — Estimates: "Download Costing Excel" export.
//
// First deliverable of the estimates feature (Srinivas: "first give an
// excel sheet with all costing details for download so that we can mark
// all details and share"). One row per site, covering everything
// lfg_site_financials (printing/packing/shipping/GST) and
// lfg_installation_costs (installation/scaffolding/GST, plus the new
// install-execution/vendor/PO fields — see
// supabase-lfg-estimates-schema.sql) already carry. Client-side, same
// pattern as the Distribution tool's exports (dbListExport.ts et al.) and
// styled the same way as the LFG Connect program report
// (lfgProgramReport.ts's dark header row + zebra stripes) — admin/editor
// RLS already permits reading lfg_site_financials/lfg_installation_costs
// straight from the browser client, so no server route is needed for this
// export the way lfgProgramReport.ts needs one for its service-role/email
// use case.

import ExcelJS from "exceljs";

export type LfgInstallExecution = "mmdi_direct" | "outsourced_vendor";

export const INSTALL_EXECUTION_LABEL: Record<LfgInstallExecution, string> = {
  mmdi_direct: "MMDI (Direct)",
  outsourced_vendor: "Outsourced Vendor",
};

export interface LfgEstimateSiteRow {
  id: string; // lfg_sites.id -- primary key for table row keys, not exported as its own column
  siteId: string;
  sfoId: string | null;
  outletName: string;
  format: string | null;
  programName: string | null;
  city: string | null;
  state: string | null;
  region: string | null;
  material: string | null;
  sqft: number | null;
  siteStatus: string;
  installedByPartnerName: string | null;

  // Printing / commercial -- lfg_site_financials
  rate: number | null;
  amount: number | null;
  packingForwarding: number | null;
  shippingAmount: number | null;
  otherCharges: number | null;
  gstAmount: number | null;
  totalPrintingAmount: number | null;
  materialCost: number | null;
  productionCost: number | null;
  totalCommercialValue: number | null;

  // Installation -- lfg_installation_costs
  installationRate: number | null;
  installationAmount: number | null;
  scaffoldingAmount: number | null;
  installationTravelling: number | null;
  installationGstAmount: number | null;
  labourOtherExpenses: number | null;
  totalInstallationCost: number | null;

  // Totals -- lfg_site_financials
  totalProjectCost: number | null;
  margin: number | null;

  // Install execution / vendor / PO -- new, lfg_installation_costs
  installExecution: LfgInstallExecution | null;
  outsourcedVendorName: string | null;
  poNumber: string | null;
  poDate: string | null;
  poAmount: number | null;
  poNotes: string | null;
}

const CURRENCY_FMT = "#,##0.00";

const COLUMNS: { header: string; key: keyof LfgEstimateSiteRow; width: number; currency?: boolean }[] = [
  { header: "Site ID", key: "siteId", width: 14 },
  { header: "SFO ID", key: "sfoId", width: 12 },
  { header: "Outlet / Store", key: "outletName", width: 28 },
  { header: "Format", key: "format", width: 16 },
  { header: "Program", key: "programName", width: 18 },
  { header: "City", key: "city", width: 14 },
  { header: "State", key: "state", width: 14 },
  { header: "Region", key: "region", width: 12 },
  { header: "Material", key: "material", width: 16 },
  { header: "Sqft", key: "sqft", width: 10 },
  { header: "Site Status", key: "siteStatus", width: 16 },
  { header: "Installed By (Partner)", key: "installedByPartnerName", width: 18 },
  { header: "Rate", key: "rate", width: 12, currency: true },
  { header: "Amount", key: "amount", width: 14, currency: true },
  { header: "Packing & Forwarding", key: "packingForwarding", width: 16, currency: true },
  { header: "Shipping", key: "shippingAmount", width: 14, currency: true },
  { header: "Other Charges", key: "otherCharges", width: 14, currency: true },
  { header: "GST Amount", key: "gstAmount", width: 14, currency: true },
  { header: "Total Printing Amount", key: "totalPrintingAmount", width: 18, currency: true },
  { header: "Material Cost", key: "materialCost", width: 14, currency: true },
  { header: "Production Cost", key: "productionCost", width: 14, currency: true },
  { header: "Total Commercial Value", key: "totalCommercialValue", width: 18, currency: true },
  { header: "Installation Rate", key: "installationRate", width: 14, currency: true },
  { header: "Installation Amount", key: "installationAmount", width: 16, currency: true },
  { header: "Scaffolding Amount", key: "scaffoldingAmount", width: 16, currency: true },
  { header: "Installation Travelling", key: "installationTravelling", width: 18, currency: true },
  { header: "Installation GST", key: "installationGstAmount", width: 14, currency: true },
  { header: "Labour / Other Expenses", key: "labourOtherExpenses", width: 18, currency: true },
  { header: "Total Installation Cost", key: "totalInstallationCost", width: 18, currency: true },
  { header: "Total Project Cost", key: "totalProjectCost", width: 16, currency: true },
  { header: "Margin", key: "margin", width: 12, currency: true },
  { header: "Install Execution", key: "installExecution", width: 16 },
  { header: "Outsourced Vendor", key: "outsourcedVendorName", width: 18 },
  { header: "PO Number", key: "poNumber", width: 14 },
  { header: "PO Date", key: "poDate", width: 12 },
  { header: "PO Amount", key: "poAmount", width: 12, currency: true },
  { header: "PO Notes", key: "poNotes", width: 24 },
];

export async function buildLfgEstimatesWorkbook(rows: LfgEstimateSiteRow[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MMDI LFG Connect";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Costing", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 24;

  for (const row of rows) {
    sheet.addRow({
      ...row,
      installExecution: row.installExecution ? INSTALL_EXECUTION_LABEL[row.installExecution] : "",
    });
  }

  for (const c of COLUMNS.filter((c) => c.currency)) {
    sheet.getColumn(c.key).numFmt = CURRENCY_FMT;
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  for (let i = 0; i < rows.length; i++) {
    const excelRow = sheet.getRow(i + 2);
    if (i % 2 === 1) {
      excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    }
    excelRow.alignment = { vertical: "middle" };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
