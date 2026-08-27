import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for a site's single reference picture
// (lfg_sites.site_reference_picture_path) -- same Cloudflare R2 pattern as
// installation-photos/upload-url, just against lfg_sites directly instead
// of a child photos table, since there's only ever one picture per site
// (a fresh upload overwrites the column, same as swapping a profile photo).
//
// lfg_sites_update RLS (staff full; partner scoped to their own sites) does
// NOT restrict site_reference_picture_path -- see
// lfg_sites_guard_partner_update() in the schema, which only blocks
// partner_id/outlet_name/format/sfo_id -- so a partner may set their own
// site's picture too. This route replicates that same condition before
// presigning, for the same reason installation-photos/upload-url does:
// presigning first and letting the later `update` silently no-op under RLS
// would leave an orphaned object in R2 with no DB row pointing at it.
//
// POST /api/lfg/sites/[siteId]/reference-picture/upload-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(request: Request, { params }: { params: Promise<{ siteId: string }> }) {
  const { siteId } = await params;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = profile?.role === "admin" || profile?.role === "editor" || profile?.role === "viewer";

  if (!isStaff) {
    // Mirrors lfg_sites_update's own-partner-only condition for anyone
    // who isn't staff -- see this file's header comment.
    const { data: site } = await supabase.from("lfg_sites").select("partner_id").eq("id", siteId).maybeSingle();
    const { data: partnerUser } = await supabase.from("lfg_partner_users").select("partner_id").eq("id", user.id).maybeSingle();
    if (!site || !partnerUser || site.partner_id !== partnerUser.partner_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  } else {
    const { data: site } = await supabase.from("lfg_sites").select("id").eq("id", siteId).maybeSingle();
    if (!site) {
      return NextResponse.json({ error: "site_not_found" }, { status: 404 });
    }
  }

  const relativePath = `lfg-site-pictures/${siteId}/${randomUUID()}.jpg`;

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: "image/jpeg" });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
