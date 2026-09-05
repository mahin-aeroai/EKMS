import { NextResponse } from "next/server";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { checkPincodeServiceability } from "@/lib/blueDart";

export const dynamic = "force-dynamic";

// Blue Dart Location Finder bridge -- POST /api/lfg/bluedart/pincode-check
//
// Unlike the shipment tracking route, this doesn't reference any
// shipment/site -- it's a plain "does Blue Dart deliver here" lookup a
// staff member or partner runs before a shipment exists (e.g. while
// filling out the New Shipment form). No RLS/ownership check beyond
// "is a real logged-in app user" is needed since no site-specific data
// goes in or out.
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
  const pincode = typeof body?.pincode === "string" ? body.pincode.trim() : "";
  if (!/^\d{6}$/.test(pincode)) {
    return NextResponse.json({ error: "invalid_pincode", message: "pincode must be a 6-digit string." }, { status: 400 });
  }

  try {
    const result = await checkPincodeServiceability(pincode);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "bluedart_error", message }, { status: 502 });
  }
}
