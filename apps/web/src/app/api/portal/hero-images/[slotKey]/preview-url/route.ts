import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { isPortalHeroSlotKey } from "@/lib/portalHeroSlots";

export const dynamic = "force-dynamic";

// Presigned-GET for one photo slot on the Customer Portal home page's
// hero banner. Given the same longer 900s expiry as
// portal/products/[id]/preview-url/route.ts (this mirrors that route
// closely) -- a read-many banner image shown on every home page visit,
// not a one-shot download. Authorization: any signed-in staff member or
// portal customer may view it (portal_hero_images_select's own RLS is
// the real gate; the 404-when-missing below is just "nothing uploaded to
// this slot yet", not an authorization decision).
//
// GET /api/portal/hero-images/[slotKey]/preview-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ slotKey: string }> }) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { slotKey } = await params;
  if (!isPortalHeroSlotKey(slotKey)) {
    return NextResponse.json({ error: "invalid_slot" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: image, error: imageErr } = await supabase
    .from("portal_hero_images")
    .select("relative_path")
    .eq("slot_key", slotKey)
    .maybeSingle();
  if (imageErr || !image) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: image.relative_path });
    const url = await getSignedUrl(r2, command, { expiresIn: 900 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
