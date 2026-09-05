import ExcelJS from "exceljs";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "LFG Connect Updates" daily/on-demand report -- one Excel workbook per
 * lfg_programs row, one row per SITE (not per store: the user's own
 * words were "need by store not by site... so you can plan
 * accommodating the sites within store," meaning a store's info repeats
 * across its sites' rows, not that sites get collapsed away -- confirmed
 * via AskUserQuestion: "One row per site, store info repeated").
 *
 * Called by both the manual "Send Report Now" route and the daily cron
 * route, always with a service-role client (see supabase-admin.ts) --
 * this deliberately reads across every site in the program regardless
 * of partner_id, since the report itself is an internal/HQ-partner
 * artifact, not a partner-scoped view.
 */

const INSTALLATION_STATUS_LABEL: Record<string, string> = {
  pending: "Not Started",
  planned: "Scheduled",
  in_progress: "In Progress",
  completed: "Completed",
  issue: "Issue",
};

const PRODUCTION_STATUS_LABEL: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Production",
  completed: "Printed",
};

const SHIPMENT_STATUS_LABEL: Record<string, string> = {
  shipment_created: "Shipment Created",
  dispatched: "Dispatched",
  in_transit: "In Transit",
  at_hub: "At Hub",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  delayed: "Delayed",
  delivery_exception: "Delivery Exception",
  undelivered: "Undelivered",
};

export interface LfgProgramReportRow {
  program: string;
  sfoId: string;
  storeName: string;
  hqPartner: string;
  city: string;
  state: string;
  region: string;
  sizeInMm: string;
  material: string;
  installationTeam: string;
  creativeReceipt: string;
  printStatus: string;
  shippingDate: string;
  carrier: string;
  awb: string;
  deliveryStatus: string;
  installationSchedule: string;
  installationStatus: string;
  remarks: string;
}

export interface LfgProgramReportResult {
  program: { id: string; name: string };
  rows: LfgProgramReportRow[];
  buffer: Buffer;
}

function fmtDate(value: string | null | undefined): string {
  if (!value) return "";
  // date/timestamptz columns come back as "YYYY-MM-DD" or a full ISO
  // string -- slice to the date part either way, no timezone math needed
  // for a plain calendar date.
  return value.slice(0, 10);
}

/**
 * Builds the report's row data (no Excel yet) for one program. Returns
 * null if the program itself doesn't exist. An empty `rows` array is a
 * valid, non-error result (a program with no sites yet).
 */
export async function buildLfgProgramReportRows(
  admin: SupabaseClient,
  programId: string
): Promise<{ program: { id: string; name: string }; rows: LfgProgramReportRow[] } | null> {
  const { data: program } = await admin.from("lfg_programs").select("id, name").eq("id", programId).maybeSingle();
  if (!program) return null;

  const { data: sites, error: sitesError } = await admin
    .from("lfg_sites")
    .select(
      "id, outlet_name, sfo_id, city, state, region, width, height, material, partner_id, store_id, remarks, creative_received_at"
    )
    .eq("program_id", programId)
    .order("sfo_id", { ascending: true, nullsFirst: false });

  if (sitesError) throw new Error(`Failed to load sites: ${sitesError.message}`);
  if (!sites || sites.length === 0) return { program, rows: [] };

  const siteIds = sites.map((s) => s.id);
  const storeIds = Array.from(new Set(sites.map((s) => s.store_id).filter((id): id is string => !!id)));
  const partnerIds = Array.from(new Set(sites.map((s) => s.partner_id).filter((id): id is string => !!id)));

  const [storesRes, partnersRes, productionRes, installationsRes, shipmentsRes] = await Promise.all([
    storeIds.length
      ? admin.from("lfg_stores").select("id, store_name").in("id", storeIds)
      : Promise.resolve({ data: [] as { id: string; store_name: string }[] }),
    partnerIds.length
      ? admin.from("lfg_partners").select("id, name").in("id", partnerIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    admin.from("lfg_production").select("site_id, status").in("site_id", siteIds),
    admin.from("lfg_installations").select("site_id, installation_date, installation_status, installation_team").in("site_id", siteIds),
    admin
      .from("lfg_shipments")
      .select("site_id, courier, awb_number, dispatch_date, current_status, created_at")
      .in("site_id", siteIds)
      .order("dispatch_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const storeById = new Map((storesRes.data ?? []).map((s) => [s.id, s]));
  const partnerById = new Map((partnersRes.data ?? []).map((p) => [p.id, p]));
  const productionBySite = new Map((productionRes.data ?? []).map((p) => [p.site_id, p]));
  const installationBySite = new Map((installationsRes.data ?? []).map((i) => [i.site_id, i]));

  // Shipments come back ordered newest-first (per the query above); keep
  // only the first (= most recent) row seen for each site.
  type ShipmentRow = NonNullable<typeof shipmentsRes.data>[number];
  const latestShipmentBySite = new Map<string, ShipmentRow>();
  for (const shipment of shipmentsRes.data ?? []) {
    if (!latestShipmentBySite.has(shipment.site_id)) {
      latestShipmentBySite.set(shipment.site_id, shipment);
    }
  }

  const rows: LfgProgramReportRow[] = sites.map((site) => {
    const store = site.store_id ? storeById.get(site.store_id) : undefined;
    const partner = site.partner_id ? partnerById.get(site.partner_id) : undefined;
    const production = productionBySite.get(site.id);
    const installation = installationBySite.get(site.id);
    const shipment = latestShipmentBySite.get(site.id);

    const sizeInMm = site.width != null && site.height != null ? `${site.width} x ${site.height}` : "";

    return {
      program: program.name,
      sfoId: site.sfo_id ?? "",
      storeName: store?.store_name ?? site.outlet_name ?? "",
      hqPartner: partner?.name ?? "",
      city: site.city ?? "",
      state: site.state ?? "",
      region: site.region ?? "",
      sizeInMm,
      material: site.material ?? "",
      installationTeam: installation?.installation_team ?? "",
      creativeReceipt: site.creative_received_at ? fmtDate(site.creative_received_at) : "Pending",
      printStatus: production ? PRODUCTION_STATUS_LABEL[production.status] ?? production.status : "Pending",
      shippingDate: fmtDate(shipment?.dispatch_date),
      carrier: shipment?.courier ?? "",
      awb: shipment?.awb_number ?? "",
      deliveryStatus: shipment ? SHIPMENT_STATUS_LABEL[shipment.current_status] ?? shipment.current_status : "",
      installationSchedule: fmtDate(installation?.installation_date),
      installationStatus: installation ? INSTALLATION_STATUS_LABEL[installation.installation_status] ?? installation.installation_status : "Not Started",
      remarks: site.remarks ?? "",
    };
  });

  return { program, rows };
}

const COLUMNS: { header: string; key: keyof LfgProgramReportRow; width: number }[] = [
  { header: "Program", key: "program", width: 22 },
  { header: "SFO ID", key: "sfoId", width: 12 },
  { header: "Store Name", key: "storeName", width: 28 },
  { header: "HQ Partner", key: "hqPartner", width: 18 },
  { header: "City", key: "city", width: 16 },
  { header: "State", key: "state", width: 16 },
  { header: "Region", key: "region", width: 12 },
  { header: "Size in MM (W x H)", key: "sizeInMm", width: 18 },
  { header: "Material", key: "material", width: 18 },
  { header: "Installation Team", key: "installationTeam", width: 20 },
  { header: "Creative Receipt", key: "creativeReceipt", width: 16 },
  { header: "Print Status", key: "printStatus", width: 14 },
  { header: "Shipping Date", key: "shippingDate", width: 14 },
  { header: "Carrier", key: "carrier", width: 14 },
  { header: "Docket Number (AWB)", key: "awb", width: 18 },
  { header: "Delivery Status", key: "deliveryStatus", width: 16 },
  { header: "Installation Schedule", key: "installationSchedule", width: 18 },
  { header: "Installation Status", key: "installationStatus", width: 16 },
  { header: "Remarks", key: "remarks", width: 30 },
];

/** Renders row data into a styled .xlsx workbook buffer. */
export async function renderLfgProgramReportXlsx(rows: LfgProgramReportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MMDI LFG Connect";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("LFG Connect Updates", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 24;

  for (const row of rows) {
    sheet.addRow(row);
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };

  // Zebra-stripe alternate data rows for readability -- purely cosmetic.
  for (let i = 0; i < rows.length; i++) {
    const excelRow = sheet.getRow(i + 2);
    if (i % 2 === 1) {
      excelRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } };
    }
    excelRow.alignment = { vertical: "middle" };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

/** Convenience wrapper: builds row data + renders the workbook in one call. */
export async function buildLfgProgramReport(admin: SupabaseClient, programId: string): Promise<LfgProgramReportResult | null> {
  const built = await buildLfgProgramReportRows(admin, programId);
  if (!built) return null;
  const buffer = await renderLfgProgramReportXlsx(built.rows);
  return { program: built.program, rows: built.rows, buffer };
}
