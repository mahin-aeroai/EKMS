// "DB List" export -- the store-wise call-off list (one row per real
// store x part number, spares pools excluded), matching the reference
// DB_List.xlsx's own columns exactly: Sl.No., SFO ID, Apple ID, Store Name,
// Programme, Shipping City, Part Number, Qty.

import ExcelJS from "exceljs";
import { isAgencySparesStore } from "./oversList";
import type { DistributionStoreWithItems } from "./types";

export async function buildDbListWorkbook(stores: DistributionStoreWithItems[]): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MMDI Distribution";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("DB List", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Sl.No.", key: "slNo", width: 8 },
    { header: "SFO ID", key: "sfoId", width: 12 },
    { header: "Apple ID", key: "appleId", width: 12 },
    { header: "Store Name", key: "storeName", width: 32 },
    { header: "Programme", key: "programme", width: 24 },
    { header: "Shipping City", key: "shippingCity", width: 16 },
    { header: "Part Number", key: "partNumber", width: 18 },
    { header: "Qty", key: "qty", width: 8 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 22;

  let slNo = 0;
  const sorted = [...stores].sort((a, b) => (a.sl_no ?? 0) - (b.sl_no ?? 0));
  for (const store of sorted) {
    if (isAgencySparesStore(store)) continue; // DB List = real store call-off only, not spares
    for (const item of store.items) {
      slNo++;
      sheet.addRow({
        slNo,
        sfoId: store.sfo_id,
        appleId: store.apple_id ?? "",
        storeName: store.store_name ?? "",
        programme: store.programme ?? "",
        shippingCity: store.shipping_city ?? "",
        partNumber: item.part_number ?? "",
        qty: item.quantity,
      });
    }
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
