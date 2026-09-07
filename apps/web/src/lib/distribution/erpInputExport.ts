// "ERP Input List" export -- matches the reference ERP_Input_Data.xlsx's
// own columns: Shipping City, Sort by, Program, Substrate, SKU3, SKU2,
// PartNumber, Store Qty, Overs, Total_Qty, Width/Height (mm and inches),
// Rate, Amount. Grouped by (hub city x part number) -- MMDI's 3 real
// shipping-city values in the Distribution Brief already ARE the KNN hub
// assignment (Bangalore/Mumbai/Delhi), not each store's own city, since
// every store's package ships consolidated via one of those 3 hubs.
//
// Program/Substrate/Rate/Width/Height come from the Rate Card, joined via
// each part's Item Type -> distribution_item_type_rate_map -> Rate Card SKU
// (Srinivas's own confirmed process -- "Rate mapping key" answer, Sept
// 2026). Uses the 2026 Revised Rate, not the 2023 Bill Rate the existing
// manual ERP Input sheets were still priced off (per his explicit
// instruction to use the revised price going forward).

import ExcelJS from "exceljs";
import { buildOversList, classifyHub, isAgencySparesStore, type HubKey } from "./oversList";
import { masterPartSku2, masterPartSku3 } from "./skuCodes";
import type { DistributionRateCardRow, DistributionStoreWithItems } from "./types";

const HUB_DISPLAY: Record<HubKey, string> = { Ban: "Bangalore", Mum: "Mumbai", Del: "Delhi" };
const HUB_ORDER: HubKey[] = ["Ban", "Mum", "Del"];
const HUB_OVERS_FIELD: Record<HubKey, "ban" | "mum" | "del"> = { Ban: "ban", Mum: "mum", Del: "del" };

export interface PartRateInfo {
  program: string | null;
  substrate: string | null;
  widthMm: number | null;
  heightMm: number | null;
  rate: number | null;
}

const MM_PER_INCH = 25.4;

export async function buildErpInputWorkbook(
  stores: DistributionStoreWithItems[],
  partRateByMasterPartNumber: Map<string, PartRateInfo>,
  masterPartNumberByPart: Map<string, string | null>
): Promise<Blob> {
  // Store Qty (real stores) per (hub, part number). Overs/spares are NOT
  // computed here anymore -- they come from buildOversList() below, the
  // same function the Overs List export itself calls, so the two exports
  // can never disagree on which parts have spares or how they're split
  // across Ban/Mum/Del again (this divergence was Finding #2).
  const storeQty: Record<HubKey, Map<string, number>> = { Ban: new Map(), Mum: new Map(), Del: new Map() };

  function add(map: Map<string, number>, key: string, qty: number) {
    map.set(key, (map.get(key) ?? 0) + qty);
  }

  for (const store of stores) {
    if (isAgencySparesStore(store)) continue; // spares are handled by buildOversList below
    const hub = classifyHub(store.shipping_city);
    // Every real store's shipping city in today's data is one of the 3 KNN
    // hub cities themselves, so this always classifies -- skip rather than
    // guess if a future season ever ships from elsewhere.
    if (!hub) continue;
    for (const item of store.items) {
      const part = item.part_number ?? "—";
      add(storeQty[hub], part, item.quantity);
    }
  }

  const oversRows = buildOversList(stores);
  const oversByPart = new Map(oversRows.map((r) => [r.partNumber, r]));

  const allParts = new Set<string>();
  for (const hub of HUB_ORDER) for (const p of storeQty[hub].keys()) allParts.add(p);
  for (const p of oversByPart.keys()) allParts.add(p);
  const sortedParts = [...allParts].sort((a, b) => a.localeCompare(b));

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "MMDI Distribution";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("ERP Input Data", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = [
    { header: "Shipping City", key: "shippingCity", width: 14 },
    { header: "Sort by", key: "sortBy", width: 9 },
    { header: "Program", key: "program", width: 16 },
    { header: "Substrate", key: "substrate", width: 22 },
    { header: "SKU3", key: "sku3", width: 8 },
    { header: "SKU2", key: "sku2", width: 8 },
    { header: "PartNumber", key: "partNumber", width: 18 },
    { header: "Store Qty", key: "storeQty", width: 10 },
    { header: "Overs", key: "overs", width: 8 },
    { header: "Total_Qty", key: "totalQty", width: 10 },
    { header: "Width (mm)", key: "widthMm", width: 11 },
    { header: "Height (mm)", key: "heightMm", width: 11 },
    { header: "Width (in)", key: "widthIn", width: 11 },
    { header: "Height (in)", key: "heightIn", width: 11 },
    { header: "Rate", key: "rate", width: 10 },
    { header: "Amount", key: "amount", width: 12 },
  ];
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.height = 22;

  let sortBy = 0;
  let lastPrefix: string | null = null;
  for (const hub of HUB_ORDER) {
    for (const part of sortedParts) {
      const sq = storeQty[hub].get(part) ?? 0;
      const oversRow = oversByPart.get(part);
      const ov = oversRow ? oversRow[HUB_OVERS_FIELD[hub]] : 0;
      if (sq === 0 && ov === 0) continue;

      const masterPart = masterPartNumberByPart.get(part) ?? null;
      const rateInfo = masterPart ? partRateByMasterPartNumber.get(masterPart) : undefined;

      const prefix = /^[A-Za-z]{2}/.exec(part)?.[0]?.toUpperCase() ?? part;
      if (prefix !== lastPrefix) {
        sortBy++;
        lastPrefix = prefix;
      }

      const totalQty = sq + ov;
      const rate = rateInfo?.rate ?? null;
      sheet.addRow({
        shippingCity: HUB_DISPLAY[hub],
        sortBy,
        program: rateInfo?.program ?? "",
        substrate: rateInfo?.substrate ?? "",
        sku3: masterPartSku3(masterPart),
        sku2: masterPartSku2(masterPart),
        partNumber: part,
        storeQty: sq || "",
        overs: ov || "",
        totalQty,
        widthMm: rateInfo?.widthMm ?? "",
        heightMm: rateInfo?.heightMm ?? "",
        widthIn: rateInfo?.widthMm ? Math.round((rateInfo.widthMm / MM_PER_INCH) * 100) / 100 : "",
        heightIn: rateInfo?.heightMm ? Math.round((rateInfo.heightMm / MM_PER_INCH) * 100) / 100 : "",
        rate: rate ?? "",
        amount: rate !== null ? Math.round(rate * totalQty * 100) / 100 : "",
      });
    }
  }

  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: 16 } };

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return new Blob([arrayBuffer as unknown as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

/** Resolves each part's rate/program/substrate via its representative Item
 * Type (the first one seen for that part in the season) -> the manual
 * item-type-to-Rate-Card mapping -> the Rate Card row itself. */
export function resolvePartRates(
  stores: DistributionStoreWithItems[],
  itemTypeToSkuId: Map<string, string>,
  rateCardBySkuId: Map<string, DistributionRateCardRow>
): { partRateByMasterPartNumber: Map<string, PartRateInfo>; masterPartNumberByPart: Map<string, string | null>; unmappedItemTypes: Set<string> } {
  const masterPartNumberByPart = new Map<string, string | null>();
  const itemTypeByMasterPart = new Map<string, string>();
  const unmappedItemTypes = new Set<string>();

  for (const store of stores) {
    for (const item of store.items) {
      const part = item.part_number ?? "—";
      if (!masterPartNumberByPart.has(part)) masterPartNumberByPart.set(part, item.master_part_number);
      const masterPart = item.master_part_number;
      if (masterPart && item.item_type && !itemTypeByMasterPart.has(masterPart)) {
        itemTypeByMasterPart.set(masterPart, item.item_type);
      }
      if (item.item_type && !itemTypeToSkuId.has(item.item_type)) unmappedItemTypes.add(item.item_type);
    }
  }

  const partRateByMasterPartNumber = new Map<string, PartRateInfo>();
  for (const [masterPart, itemType] of itemTypeByMasterPart) {
    const skuId = itemTypeToSkuId.get(itemType);
    const rateCard = skuId ? rateCardBySkuId.get(skuId) : undefined;
    if (!rateCard) continue;
    partRateByMasterPartNumber.set(masterPart, {
      program: rateCard.program,
      substrate: rateCard.substrate,
      widthMm: rateCard.width_mm,
      heightMm: rateCard.height_mm,
      rate: rateCard.revised_rate_2026 ?? rateCard.bill_rate_2023,
    });
  }

  return { partRateByMasterPartNumber, masterPartNumberByPart, unmappedItemTypes };
}
