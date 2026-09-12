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
  // Tracking Detail report -- single value for the whole season ("Project
  // code : single entry", per Mahin's spec). Nullable since it predates
  // this column (supabase-distribution-tracking-detail-schema.sql).
  project_code: string | null;
}

/** Tracking Detail report -- reusable Item Type (Costs) -> Group -> Rate
 * Card SKU mapping, imported once from Frankie Head Report and extended by
 * staff as new Item Type (Costs) values show up in later seasons' Tracking
 * Master files. NOT season-scoped -- same shape/reasoning as
 * distribution_item_type_rate_map, just keyed on a different field
 * (item_type_costs, not item_type) since the two don't share a join key. */
export interface DistributionDeliverableGroupRow {
  item_type_costs: string;
  group_name: string;
  split_note: string | null;
  rate_card_sku_id: string | null;
  mapped_by: string | null;
  mapped_at: string;
}

/** Tracking Detail report -- one Group x Shipping City's worth of manually
 * entered tracking facts for a season. Estimate Number is conceptually
 * per-Group only but stored redundantly on every City row under that
 * Group; TrackingDetailClient.tsx keeps it in sync across a Group's City
 * rows when edited. */
export interface DistributionTrackingEntryRow {
  id: string;
  season_id: string;
  group_name: string;
  shipping_city: string;
  estimate_number: string | null;
  delivery_note: string | null;
  courier: string | null;
  tracking_number: string | null;
  dispatch_date: string | null; // ISO date (yyyy-mm-dd)
  eta: string | null;
  pod_date: string | null;
  pod_name: string | null;
  updated_by: string | null;
  updated_at: string;
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

/** A store row with its line items attached -- the shape every export
 * (labels, DB List, Overs List, ERP Input List) actually consumes. */
export interface DistributionStoreWithItems extends DistributionStoreRow {
  items: DistributionItemRow[];
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

export interface DistributionRateCardRow {
  id: string;
  sku_id: string;
  sku_description: string | null;
  category: string | null;
  program: string | null;
  substrate: string | null;
  unit: string | null;
  width_mm: number | null;
  height_mm: number | null;
  bill_rate_2023: number | null;
  revised_rate_2026: number | null;
  gsm_approval_name: string | null;
  remarks: string | null;
  imported_at: string;
}

export interface DistributionItemTypeRateMapRow {
  item_type: string;
  rate_card_sku_id: string | null;
  mapped_by: string | null;
  mapped_at: string;
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
