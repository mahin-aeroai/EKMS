// Server-only Blue Dart / DHL eCommerce India tracking client. Never
// import this from a Client Component -- it reads bare (non-NEXT_PUBLIC_)
// process.env vars, same convention as apps/web/src/app/api/portal/orders/
// [orderId]/razorpay-order/route.ts. Used by
// apps/web/src/app/api/lfg/shipments/[shipmentId]/track/route.ts, the
// only caller.
//
// Blue Dart's tracking API (per their DHL eCommerce India developer
// portal, developer.dhl.com/api-reference/shipment-tracking-dhl-ecommerce
// -india-blue-dart, gathered 2 Sept 2026 -- NOT verified against a live
// call from this environment, which has no network path to a real Blue
// Dart account):
//   1. Auth: POST a login/auth endpoint with Consumer Key/Secret, get
//      back a short-lived JWT. Re-fetched per call rather than cached in
//      memory -- this route runs in a stateless serverless function, so
//      an in-memory cache would rarely hit anyway; if Blue Dart's actual
//      rate limits turn out to matter in practice, add a short-TTL cache
//      here later.
//   2. Track: GET the tracking endpoint with the JWT + loginid/lickey +
//      the AWB number, response is XML (format=xml).
// IMPORTANT: re-confirm the exact auth endpoint path and the exact
// tracking query parameter names/values (`handler`, `action`, `scan`,
// `verno`, etc.) against Blue Dart's live API reference before relying on
// this in production -- the shapes below are this plan's best gathered
// understanding, not something this sandbox could exercise against a
// real account.

import { XMLParser } from "fast-xml-parser";

const AUTH_URL = "https://apigateway.bluedart.com/in/transportation/token/v1/login";
const TRACK_URL = "https://apigateway.bluedart.com/in/transportation/tracking/v1";

export interface BlueDartEvent {
  status: string;
  location: string | null;
  time: string; // ISO 8601
  raw: unknown;
}

class BlueDartConfigError extends Error {}
class BlueDartApiError extends Error {}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new BlueDartConfigError(`${name} is not set`);
  return value;
}

/**
 * Authenticates against Blue Dart's gateway using the Consumer Key/Secret
 * and returns a JWT to use as a bearer token on the tracking call. Throws
 * BlueDartConfigError if the env vars are missing (caller should turn
 * that into a 503 "not_configured"), or BlueDartApiError on a non-2xx
 * response from Blue Dart itself.
 */
export async function getBlueDartToken(): Promise<string> {
  const consumerKey = requireEnv("BLUEDART_CONSUMER_KEY");
  const consumerSecret = requireEnv("BLUEDART_CONSUMER_SECRET");

  const res = await fetch(AUTH_URL, {
    method: "GET",
    headers: {
      ClientID: consumerKey,
      clientSecret: consumerSecret,
    },
  });
  if (!res.ok) {
    throw new BlueDartApiError(`Blue Dart auth failed: ${res.status} ${res.statusText}`);
  }
  const data = (await res.json()) as { JWTToken?: string; access_token?: string };
  const token = data.JWTToken ?? data.access_token;
  if (!token) {
    throw new BlueDartApiError("Blue Dart auth response had no token");
  }
  return token;
}

const xmlParser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

/**
 * Tracks one AWB and returns its scan history, oldest first. Throws
 * BlueDartConfigError / BlueDartApiError the same way getBlueDartToken()
 * does -- the route handler is responsible for turning those into the
 * right HTTP response.
 */
export async function trackAwb(awb: string): Promise<BlueDartEvent[]> {
  const loginId = requireEnv("BLUEDART_LOGIN_ID");
  const licenseKey = requireEnv("BLUEDART_LICENSE_KEY");
  const token = await getBlueDartToken();

  const url = new URL(TRACK_URL);
  url.searchParams.set("handler", "tnt");
  url.searchParams.set("loginid", loginId);
  url.searchParams.set("lickey", licenseKey);
  url.searchParams.set("awb", awb);
  url.searchParams.set("format", "xml");
  url.searchParams.set("verno", "1.3");
  url.searchParams.set("scan", "1");
  url.searchParams.set("action", "custawbquery");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new BlueDartApiError(`Blue Dart tracking call failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  // Defensive: Blue Dart's actual response shape can only be confirmed
  // against a real account. Walk a handful of plausible paths for a
  // shipment/scan list rather than assuming one exact structure, and
  // return [] (not throw) if none match -- an empty, still-successful
  // result is safer than crashing the whole tracking route on a response
  // shape mismatch.
  const root = parsed?.ShipmentData ?? parsed?.TrackingResponse ?? parsed;
  const shipment = root?.Shipment ?? root?.shipment ?? root;
  const rawScans = shipment?.Scans?.ScanDetail ?? shipment?.ScanDetails ?? shipment?.Scan ?? [];
  const scans = Array.isArray(rawScans) ? rawScans : rawScans ? [rawScans] : [];

  return scans.map((scan: Record<string, unknown>): BlueDartEvent => {
    const status = String(scan.Scan ?? scan.ScanCode ?? scan.status ?? "Unknown");
    const location = scan.ScannedLocation ?? scan.location ?? null;
    const dateStr = String(scan.ScanDate ?? scan.date ?? "");
    const timeStr = String(scan.ScanTime ?? scan.time ?? "");
    const time = parseBlueDartDateTime(dateStr, timeStr) ?? new Date().toISOString();
    return { status, location: location ? String(location) : null, time, raw: scan };
  });
}

/** Blue Dart dates are typically DD-MM-YYYY / DD/MM/YYYY with a separate HH:MM(:SS) time -- best-effort parse, falls back to null rather than throwing on an unexpected format. */
function parseBlueDartDateTime(dateStr: string, timeStr: string): string | null {
  const dateMatch = dateStr.match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  if (!dateMatch) return null;
  const [, d, m, y] = dateMatch;
  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(:(\d{2}))?/);
  const hh = timeMatch ? timeMatch[1].padStart(2, "0") : "00";
  const mm = timeMatch ? timeMatch[2] : "00";
  const ss = timeMatch?.[4] ?? "00";
  const iso = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T${hh}:${mm}:${ss}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Best-effort keyword mapping from a Blue Dart scan status string onto
 * this app's own SHIPMENT_STATUSES vocabulary
 * (apps/web/src/lib/lfgStatus.ts). Deliberately defensive: an unmatched
 * status falls through to "in_transit" (the safest "still moving, not
 * delivered, not an error" default) rather than silently no-op-ing or
 * throwing -- Blue Dart's exact scan-code vocabulary can only be nailed
 * down against a real response, so this needs to keep working (even if
 * imprecisely) on codes not seen yet.
 */
export function mapBlueDartStatusToLfg(rawStatus: string): (typeof import("./lfgStatus").SHIPMENT_STATUSES)[number] {
  const s = rawStatus.toLowerCase();
  if (s.includes("deliver") && !s.includes("undeliver") && !s.includes("out for")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("undeliver") || s.includes("rto") || s.includes("return")) return "undelivered";
  if (s.includes("exception") || s.includes("fail") || s.includes("damage")) return "delivery_exception";
  if (s.includes("delay") || s.includes("hold")) return "delayed";
  if (s.includes("hub") || s.includes("warehouse") || s.includes("facility")) return "at_hub";
  if (s.includes("pick") || s.includes("dispatch") || s.includes("manifest")) return "dispatched";
  if (s.includes("booked") || s.includes("created") || s.includes("shipment created")) return "shipment_created";
  return "in_transit";
}
