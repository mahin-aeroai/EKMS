// Parses the two short grouping codes MMDI's own ERP Input sheet derives
// from a part's Master Part Number -- "SKU2" (its 2-letter product-family
// prefix + 2-digit variant, e.g. "GA21") and "SKU3" (just the 2-digit
// variant as a number, e.g. 21). Confirmed against the reference
// ERP_Input_Data.xlsx: row for "GA21603A-WWUN" carries SKU2 "GA21" / SKU3
// 21 -- these are cosmetic grouping/sort aids, not a Rate Card foreign key
// (that mapping goes through distribution_item_type_rate_map instead, keyed
// on the Distribution Brief's "Item type" field per Srinivas's own
// process).
export function masterPartSku2(masterPartNumber: string | null): string | null {
  if (!masterPartNumber) return null;
  const m = /^[A-Za-z]{2}\d{2}/.exec(masterPartNumber.trim());
  return m ? m[0].toUpperCase() : null;
}

export function masterPartSku3(masterPartNumber: string | null): number | null {
  const sku2 = masterPartSku2(masterPartNumber);
  if (!sku2) return null;
  const digits = sku2.slice(2);
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
