// The Overs List's core business rule -- confirmed against Srinivas's real
// reference Overs_List.xlsx, and confirmed with him directly (see the
// "Overs source" question, Sept 2026): a season's Distribution Brief brief
// USUALLY already bakes Agency Spares into per-hub pseudo-store rows (one
// per KNN hub city), and when it does, that per-hub breakdown is trusted
// as-is -- the Bangalore>Mumbai>Delhi priority-remainder split (verified
// against the reference file's real numbers, e.g. 5 spares -> Ban 2 / Mum 2
// / Del 1) is only applied to fill in a part number whose spares come as a
// single lump figure with no hub already assigned.

import type { DistributionItemRow, DistributionStoreWithItems } from "./types";

export type HubKey = "Ban" | "Mum" | "Del";
const HUB_PRIORITY: HubKey[] = ["Ban", "Mum", "Del"];

export function classifyHub(shippingCity: string | null): HubKey | null {
  const c = (shippingCity ?? "").toUpperCase();
  if (!c) return null;
  if (c.includes("BANG") || c.includes("BENGALURU")) return "Ban";
  if (c.includes("MUMBAI") || c.includes("BIWANDI") || c.includes("BHIWANDI")) return "Mum";
  if (c.includes("DELHI")) return "Del";
  return null;
}

export function isAgencySparesStore(store: { sfo_id: string; programme: string | null }): boolean {
  return /^xxxx/i.test(store.sfo_id) || /agency\s*spares/i.test(store.programme ?? "");
}

/** Bangalore -> Mumbai -> Delhi priority-remainder split. Verified against
 * Srinivas's own Overs_List.xlsx: 4->(2,1,1), 2->(1,1,0), 5->(2,2,1),
 * 1->(1,0,0), 7->(3,2,2), 3->(1,1,1) all match exactly. */
export function splitOversAcrossHubs(total: number): Record<HubKey, number> {
  const base = Math.floor(total / 3);
  const remainder = total - base * 3;
  const split: Record<HubKey, number> = { Ban: base, Mum: base, Del: base };
  for (let i = 0; i < remainder; i++) split[HUB_PRIORITY[i]] += 1;
  return split;
}

export interface OversListRow {
  partNumber: string;
  dbQty: number;
  overs: number;
  ban: number;
  mum: number;
  del: number;
}

export function buildOversList(stores: DistributionStoreWithItems[]): OversListRow[] {
  const dbQtyByPart = new Map<string, number>();
  const sparesByHubAndPart: Record<HubKey, Map<string, number>> = { Ban: new Map(), Mum: new Map(), Del: new Map() };
  const lumpByPart = new Map<string, number>();
  const distinctSparesHubs = new Set<HubKey>();

  function addQty(map: Map<string, number>, part: string, qty: number) {
    map.set(part, (map.get(part) ?? 0) + qty);
  }

  for (const store of stores) {
    const spares = isAgencySparesStore(store);
    const hub = classifyHub(store.shipping_city);
    for (const item of store.items as DistributionItemRow[]) {
      const part = item.part_number ?? "—";
      if (!spares) {
        addQty(dbQtyByPart, part, item.quantity);
        continue;
      }
      if (hub) {
        distinctSparesHubs.add(hub);
        addQty(sparesByHubAndPart[hub], part, item.quantity);
      } else {
        addQty(lumpByPart, part, item.quantity);
      }
    }
  }

  // Trust the sheet's own per-hub breakdown whenever more than one hub is
  // distinguishable among this season's spares rows -- only the remaining
  // lump (no hub assigned at all) gets the computed split.
  const hasHubBreakdown = distinctSparesHubs.size > 1;

  const allParts = new Set<string>([...dbQtyByPart.keys(), ...lumpByPart.keys()]);
  for (const hub of HUB_PRIORITY) for (const part of sparesByHubAndPart[hub].keys()) allParts.add(part);

  const rows: OversListRow[] = [];
  for (const part of allParts) {
    const dbQty = dbQtyByPart.get(part) ?? 0;
    let ban = 0;
    let mum = 0;
    let del = 0;
    if (hasHubBreakdown) {
      ban = sparesByHubAndPart.Ban.get(part) ?? 0;
      mum = sparesByHubAndPart.Mum.get(part) ?? 0;
      del = sparesByHubAndPart.Del.get(part) ?? 0;
    }
    const lump = lumpByPart.get(part) ?? 0;
    if (lump > 0) {
      const split = splitOversAcrossHubs(lump);
      ban += split.Ban;
      mum += split.Mum;
      del += split.Del;
    }
    const overs = ban + mum + del;
    if (dbQty === 0 && overs === 0) continue;
    rows.push({ partNumber: part, dbQty, overs, ban, mum, del });
  }

  return rows.sort((a, b) => a.partNumber.localeCompare(b.partNumber));
}
