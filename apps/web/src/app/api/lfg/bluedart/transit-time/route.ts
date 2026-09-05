import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { getTransitTime, BLUEDART_PRODUCT_CODES } from "@/lib/blueDart";

export const dynamic = "force-dynamic";

// Blue Dart Transit Time bridge -- POST /api/lfg/bluedart/transit-time
//
// Same "no site/shipment ownership to check" reasoning as
// pincode-check/route.ts -- this estimates a delivery date for a
// product/pincode pair before any shipment record exists.
export async function POST(request: Request) {
  if (!process.env.BLUEDART_CONSUMER_KEY || !process.env.BLUEDART_CONSUMER_SECRET || !process.env.BLUEDART_LOGIN_ID || !process.env.BLUEDART_LICENSE_KEY) {
    return NextResponse.json(
      {
        error: "not_configured",
        message: "BLUEDART_CONSUMER_KEY / BLUEDART_CONSUMER_SECRET / BLUEDART_LOGIN_ID / BLUEDART_LICENSE_KEY must be set as Vercel environment variables.",
      },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const body = await request.json().catch(() => null);
  const originPincode = typeof body?.originPincode === "string" ? body.originPincode.trim() : "";
  const destPincode = typeof body?.destPincode === "string" ? body.destPincode.trim() : "";
  const productCode = typeof body?.productCode === "string" ? body.productCode.trim().toUpperCase() : "";
  const subProductCode = typeof body?.subProductCode === "string" ? body.subProductCode.trim() : undefined;
  const pickupDate = typeof body?.pickupDate === "string" ? body.pickupDate.trim() : "";
  const pickupTime = typeof body?.pickupTime === "string" ? body.pickupTime.trim() : "";

  if (!/^\d{6}$/.test(originPincode) || !/^\d{6}$/.test(destPincode)) {
    return NextResponse.json({ error: "invalid_pincode", message: "originPincode and destPincode must each be a 6-digit string." }, { status: 400 });
  }
  if (!BLUEDART_PRODUCT_CODES.some((p) => p.code === productCode)) {
    return NextResponse.json({ error: "invalid_product_code", message: `productCode must be one of: ${BLUEDART_PRODUCT_CODES.map((p) => p.code).join(", ")}.` }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(pickupDate)) {
    return NextResponse.json({ error: "invalid_pickup_date", message: "pickupDate must be YYYY-MM-DD." }, { status: 400 });
  }
  if (!/^\d{1,2}:\d{2}$/.test(pickupTime)) {
    return NextResponse.json({ error: "invalid_pickup_time", message: "pickupTime must be HH:MM (24-hour)." }, { status: 400 });
  }

  try {
    const result = await getTransitTime({ originPincode, destPincode, productCode, subProductCode, pickupDate, pickupTime });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "bluedart_error", message }, { status: 502 });
  }
}
