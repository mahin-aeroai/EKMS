// Server-only Blue Dart / DHL eCommerce India tracking client. Never
// import this from a Client Component -- it reads bare (non-NEXT_PUBLIC_)
// process.env vars, same convention as apps/web/src/app/api/portal/orders/
// [orderId]/razorpay-order/route.ts. Used by
// apps/web/src/app/api/lfg/shipments/[shipmentId]/track/route.ts, the
// only caller.
//
// Verified 5 Sept 2026 against Blue Dart's own "APIGEE USER MANUAL 1.2.0"
// and "BLUEDART APIGATEWAY SPECIFICATIONS" documents (Srinivas forwarded
// both, received from Blue Dart's Chakra Pani) -- this replaces the
// earlier best-guess shape gathered from public docs. Still not exercised
// against a live call from this sandbox (no network path to Blue Dart's
// account), but every endpoint, header, query param and response field
// below is now taken directly from Blue Dart's own reference doc rather
// than inferred.
//
//   1. Auth ("Blue Dart Authentication API", GET /v2/login): send the
//      Consumer Key/Secret (from the App created on developer.dhl.com) as
//      the `ClientID` / `clientSecret` headers -- NOT query params, NOT a
//      request body. Response is JSON: { "JWTToken": "<jwt>" }. Token is
//      valid 24 hrs; re-fetched per call rather than cached in memory --
//      this route runs in a stateless serverless function, so an
//      in-memory cache would rarely hit anyway.
//   2. Track ("Blue Dart-Tracking Of Shipment", GET .../tracking/v1): the
//      JWT goes on the tracking call as `Authorization: Bearer <jwt>`
//      (standard JWT-bearer pattern; the manual's own examples only show
//      pasting the token into an "Authorize" dialog, so this is the one
//      piece inferred rather than lifted verbatim -- flagged in case a
//      live call ever needs a different header name). Response is XML
//      (format=xml), confirmed shape: <ShipmentData><Shipment RefNo=".."
//      WaybillNo="..">...<Status>/<StatusType>/<StatusDate>/<StatusTime>
//      (Blue Dart's own authoritative "current status", not just the
//      latest scan) ...<Scans><ScanDetail>(newest first)...
//
// Production API host is apigateway.bluedart.com (the sandbox/dev host is
// apigateway-dev.bluedart.com) -- Srinivas's Login ID (HYD00374) and
// license keys from Chakra Pani's email are Production-mode credentials,
// so this file targets the production host throughout.

import { XMLParser } from "fast-xml-parser";

const AUTH_URL = "https://apigateway.bluedart.com/v2/login";
const TRACK_URL = "https://apigateway.bluedart.com/in/transportation/tracking/v1";

export interface BlueDartEvent {
  status: string;
  location: string | null;
  time: string; // ISO 8601
  raw: unknown;
}

export interface BlueDartTrackResult {
  /** Scan history, oldest first (Blue Dart's own response returns newest first -- reversed here for a natural timeline). */
  events: BlueDartEvent[];
  /** Blue Dart's own top-level <Status> field (e.g. "SHIPMENT DELIVERED") -- more authoritative than inferring from the last scan. Null if the response had no Shipment block (e.g. AWB not found). */
  currentStatus: string | null;
  /** ISO 8601, parsed from <StatusDate>/<StatusTime>. Null if unparseable/absent. */
  currentStatusTime: string | null;
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
 * response from Blue Dart itself (401 "Invalid Client Id or Secret" per
 * the manual is the expected shape for bad credentials).
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
 * Tracks one AWB. Throws BlueDartConfigError / BlueDartApiError the same
 * way getBlueDartToken() does -- the route handler is responsible for
 * turning those into the right HTTP response.
 */
export async function trackAwb(awb: string): Promise<BlueDartTrackResult> {
  const loginId = requireEnv("BLUEDART_LOGIN_ID");
  const licenseKey = requireEnv("BLUEDART_LICENSE_KEY");
  const token = await getBlueDartToken();

  const url = new URL(TRACK_URL);
  url.searchParams.set("handler", "tnt");
  url.searchParams.set("action", "custawbquery");
  url.searchParams.set("loginid", loginId);
  // Per Blue Dart's own sample URL, `awb` is a literal query key naming
  // the query type ("awb" as opposed to e.g. a reference-number query),
  // and `numbers` carries the actual AWB number(s) being queried.
  url.searchParams.set("awb", "awb");
  url.searchParams.set("numbers", awb);
  url.searchParams.set("format", "xml");
  url.searchParams.set("lickey", licenseKey);
  url.searchParams.set("verno", "1");
  url.searchParams.set("scan", "1");

  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new BlueDartApiError(`Blue Dart tracking call failed: ${res.status} ${res.statusText}`);
  }

  const xml = await res.text();
  const parsed = xmlParser.parse(xml);

  // Confirmed shape: <ShipmentData><Shipment RefNo=".." WaybillNo="..">
  // ...<Scans><ScanDetail>...</Scans></Shipment></ShipmentData>. Still
  // walk a couple of defensive fallback paths (lowercase / unwrapped)
  // in case an edge case (e.g. AWB not found) shapes the response
  // differently -- returns [] rather than throwing on a shape mismatch.
  const root = parsed?.ShipmentData ?? parsed;
  const shipment = root?.Shipment ?? root?.shipment ?? root;
  const rawScans = shipment?.Scans?.ScanDetail ?? shipment?.ScanDetails ?? shipment?.Scan ?? [];
  const scansNewestFirst = Array.isArray(rawScans) ? rawScans : rawScans ? [rawScans] : [];

  const events: BlueDartEvent[] = scansNewestFirst
    .map((scan: Record<string, unknown>): BlueDartEvent => {
      const status = String(scan.Scan ?? scan.ScanCode ?? scan.status ?? "Unknown").trim();
      const location = scan.ScannedLocation ?? scan.location ?? null;
      const dateStr = String(scan.ScanDate ?? scan.date ?? "");
      const timeStr = String(scan.ScanTime ?? scan.time ?? "");
      const time = parseBlueDartDateTime(dateStr, timeStr) ?? new Date().toISOString();
      return { status, location: location ? String(location) : null, time, raw: scan };
    })
    .reverse(); // Blue Dart returns newest-first; a timeline reads better oldest-first.

  const currentStatus = shipment?.Status ? String(shipment.Status).trim() : null;
  const currentStatusTime = parseBlueDartDateTime(String(shipment?.StatusDate ?? ""), String(shipment?.StatusTime ?? ""));

  return { events, currentStatus, currentStatusTime };
}

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * Blue Dart mixes date formats across fields confirmed in the API spec:
 * ScanDate is "DD-Mon-YYYY" (e.g. "30-Jan-2023"), while StatusDate/
 * PickUpDate/ExpectedDeliveryDate are "DD Month YYYY" (e.g.
 * "30 January 2023"). Handles both, plus a plain numeric DD-MM-YYYY /
 * DD/MM/YYYY as a fallback. Time is a separate HH:MM(:SS) string.
 * Best-effort: returns null rather than throwing on an unexpected format.
 */
function parseBlueDartDateTime(dateStr: string, timeStr: string): string | null {
  const match = dateStr.match(/(\d{1,2})[\s\-/]([A-Za-z]+|\d{1,2})[\s\-/](\d{4})/);
  if (!match) return null;
  const [, d, monthToken, y] = match;
  let month: number | undefined;
  if (/^\d+$/.test(monthToken)) {
    month = parseInt(monthToken, 10);
  } else {
    month = MONTH_NAMES[monthToken.slice(0, 3).toLowerCase()];
  }
  if (!month) return null;

  const timeMatch = timeStr.match(/(\d{1,2}):(\d{2})(:(\d{2}))?/);
  const hh = timeMatch ? timeMatch[1].padStart(2, "0") : "00";
  const mm = timeMatch ? timeMatch[2] : "00";
  const ss = timeMatch?.[4] ?? "00";
  const iso = `${y}-${String(month).padStart(2, "0")}-${d.padStart(2, "0")}T${hh}:${mm}:${ss}`;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Best-effort keyword mapping from a Blue Dart status string (either the
 * top-level <Status>, e.g. "SHIPMENT DELIVERED", or an individual scan's
 * <Scan> text) onto this app's own SHIPMENT_STATUSES vocabulary
 * (apps/web/src/lib/lfgStatus.ts). Deliberately defensive: an unmatched
 * status falls through to "in_transit" (the safest "still moving, not
 * delivered, not an error" default) rather than silently no-op-ing or
 * throwing -- Blue Dart's full scan-code vocabulary (StatusType/ScanType
 * two-letter codes like DL/UD/PU are confirmed but not exhaustively
 * enumerated in the spec) can only be nailed down against more real
 * responses over time, so this needs to keep working, even if
 * imprecisely, on codes not seen yet.
 */
export function mapBlueDartStatusToLfg(rawStatus: string): (typeof import("./lfgStatus").SHIPMENT_STATUSES)[number] {
  const s = rawStatus.toLowerCase();
  if (s.includes("deliver") && !s.includes("undeliver") && !s.includes("out for")) return "delivered";
  if (s.includes("out for delivery")) return "out_for_delivery";
  if (s.includes("undeliver") || s.includes("rto") || s.includes("return")) return "undelivered";
  if (s.includes("exception") || s.includes("fail") || s.includes("damage")) return "delivery_exception";
  if (s.includes("delay") || s.includes("hold")) return "delayed";
  if (s.includes("hub") || s.includes("warehouse") || s.includes("facility")) return "at_hub";
  if (s.includes("pick") || s.includes("dispatch") || s.includes("manifest") || s.includes("connected")) return "dispatched";
  if (s.includes("booked") || s.includes("created") || s.includes("shipment created")) return "shipment_created";
  return "in_transit";
}
