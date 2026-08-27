import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for viewing an already-uploaded LFG installation
// photo. Unlike upload-url/route.ts (which has to hand-check the
// lfg_installation_photos_insert condition itself, since presigning happens
// before any row exists to run RLS against), this route can just query the
// specific photo row through the caller's own RLS-scoped Supabase client
// (createRouteSupabaseClient) instead of re-deriving the
// lfg_installation_photos_select condition in app code -- see
// knowledge-files/signed-url/route.ts for the alternative (hand-replicated
// logic) approach, deliberately not used here since it can drift out of
// sync with the real policy. If the row comes back, RLS already decided
// this caller is allowed to see it (staff, or the site's own partner); if
// it doesn't, they aren't, full stop -- 404 either way (not 403), same as
// every other RLS-backed lookup in this app, so a partner probing photo ids
// for other sites can't distinguish "wrong id" from "not yours".
//
// GET /api/lfg/sites/[siteId]/installation-photos/[photoId]/signed-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ siteId: string; photoId: string }> }) {
  const { siteId, photoId } = await params;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: photo } = await supabase
    .from("lfg_installation_photos")
    .select("id, relative_path")
    .eq("id", photoId)
    .eq("site_id", siteId)
    .maybeSingle();

  if (!photo) {
    return NextResponse.json({ error: "photo_not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: photo.relative_path });
    const url = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
