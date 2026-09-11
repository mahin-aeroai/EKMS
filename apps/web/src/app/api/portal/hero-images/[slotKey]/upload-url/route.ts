import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";
import { isPortalHeroSlotKey } from "@/lib/portalHeroSlots";

export const dynamic = "force-dynamic";

// Presigned-PUT for one photo slot on the Customer Portal home page's
// hero banner (Customer Portal workspace → Hero Banner tab, task
// feedback: "give images upload tool so that i can place them nicely").
// Staff-only -- portal_hero_images' own RLS already restricts
// insert/update to admin/editor, but as with every R2 route in this app,
// signing itself has no RLS backing it, so the check is repeated
// explicitly here (same pattern as portal/products/[id]/preview-upload-
// url/route.ts, which this mirrors almost exactly).
//
// POST /api/portal/hero-images/[slotKey]/upload-url
// Body: { content_type: "image/png" | "image/jpeg" | "image/webp" }

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(request: Request, { params }: { params: Promise<{ slotKey: string }> }) {
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

  let body: { content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const contentType = body.content_type;
  if (!contentType || !ALLOWED_TYPES.has(contentType)) {
    return NextResponse.json({ error: "invalid_content_type", message: "content_type must be image/png, image/jpeg, or image/webp" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const relativePath = `portal-hero-images/${slotKey}/${randomUUID()}.${contentType.split("/")[1]}`;

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: contentType });
    const url = await getSignedUrl(r2, command, { expiresIn: 120 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
