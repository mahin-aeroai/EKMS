// Shared row/domain types for the Distribution Tool -- Apple's seasonal
// distribution job (import their Distribution Brief sheet, generate
// store-wise packing labels, track pack/ship status, log the manual KNN
// hub handoff). See supabase-distribution-schema.sql for the DB shape
// these mirror.

export type DistributionSeasonStatus = "draft" | "imported" | "packing" | "dispatched" | "completed";
export type DistributionPackStatus = "pending" | "packed" | "shipped" | "delivered";
export type DistributionShipmentStatus = "pending" | "dispatched" | "handed_to_knn";

export interface DistributionSeasonRow {
  id: string;
  name: string;
  dispatch_wave: string | null;
  source_file_name: string | null;
  status: DistributionSeasonStatus;
  imported_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DistributionStoreRow {
  id: string;
  season_id: string;
  sl_no: number | null;
  sfo_id: string;
  apple_id: string | null;
  fixture_id: string | null;
  store_name: string | null;
  reseller_name: string | null;
  programme: string | null;
  shipping_city: string | null;
  shipping_address_line1: string | null;
  shipping_address_line2: string | null;
  shipping_address_line3: string | null;
  shipping_state: string | null;
  shipping_postal_code: string | null;
  shipping_country: string | null;
  pos_address_line1: string | null;
  pos_address_line2: string | null;
  pos_address_line3: string | null;
  pos_city: string | null;
  pos_zip: string | null;
  total_units: number;
  pack_status: DistributionPackStatus;
  packed_at: string | null;
  packed_by: string | null;
  remarks: string | null;
}

export interface DistributionItemRow {
  id: string;
  store_id: string;
  part_number: string | null;
  master_part_number: string | null;
  loc: string | null;
  item_type: string | null;
  item_type_costs: string | null;
  deliverable_description: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number | null;
}

export interface DistributionShipmentRow {
  id: string;
  season_id: string;
  shipping_city: string;
  courier: string;
  awb_or_manifest_number: string | null;
  dispatch_date: string | null;
  box_count: number | null;
  total_units: number | null;
  status: DistributionShipmentStatus;
  internal_remarks: string | null;
  created_by: string | null;
  created_at: string;
}

/** Display name shown for a season's "Agency Spares" pseudo-store rows. */
export function agencySparesDisplayName(shippingCity: string | null): string {
  const city = (shippingCity ?? "").trim();
  return city ? `AGENCY SPARES — ${city.toUpperCase()}` : "AGENCY SPARES";
}

/** True store name to show -- substitutes blank/placeholder names for the
 * pseudo "Agency Spares" store rows Apple's brief bakes in per hub city. */
export function displayStoreName(storeName: string | null, shippingCity: string | null): string {
  const name = (storeName ?? "").trim();
  if (!name || /^xxxx/i.test(name)) return agencySparesDisplayName(shippingCity);
  return name;
}
