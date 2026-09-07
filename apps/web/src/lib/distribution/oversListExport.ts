// "Overs List" export -- matches the reference Overs_List.xlsx's own
// columns: Sl. No., programsort, Part Number, DB Qty, Overs, Ban, Mum, Del.
// The Ban/Mum/Del split itself comes from buildOversList (oversList.ts);
// "programsort" is a coarse family-grouping aid (increments whenever the
// part number's 2-letter prefix changes) reproducing the reference file's
// own grouping pattern -- purely a sort/visual aid, not used elsewhere.

import ExcelJS from "exceljs";
import { buildOversList } from "./oversList";
import type { DistributionStoreWithItems } from "./types";

export async function buildOversListWorkbook(stores: DistributionStoreWithItems[]): Promise<Blob> {
  const rows = buildOversList(stores);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MMDI Distribution";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Overs List", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Sl. No.", key: "slNo", width: 8 },
    { header: "programsort", key: "programsort", width: 12 },
    { header: "Part Number", key: "partNumber", width: 18 },
    { header: "DB Qty", key: "dbQty", width: 10 },
    { header: "Overs", key: "overs", width: 10 },
    { header: "Ban", key: "ban", width: 8 },
    { header: "Mum", key: "mum", width: 8 },
    { header: "Del", key: "del", width: 8 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 22;

  let programsort = 0;
  let lastPrefix: string | null = null;
  rows.forEach((row, i) => {
    const prefix = /^[A-Za-z]{2}/.exec(row.partNumber)?.[0]?.toUpperCase() ?? row.partNumber;
    if (prefix !== lastPrefix) {
      programsort++;
      lastPrefix = prefix;
    }
    sheet.addRow({
      slNo: i + 1,
      programsort,
      partNumber: row.partNumber,
      dbQty: row.dbQty,
      overs: row.overs || "",
      ban: row.ban || "",
      mum: row.mum || "",
      del: row.del || "",
    });
  });

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 8 } };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
