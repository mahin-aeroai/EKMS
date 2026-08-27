import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for LFG installation photos -- same Cloudflare R2
// pattern as /api/installation-photos/upload-url, but for
// lfg_installation_photos.kind's simpler 3-value taxonomy (before/after/
// completion, per supabase-lfg-site-management-schema.sql -- NOT the
// legacy installation_report_photos' 10-value storeFullCover/mainSlide/
// etc. taxonomy, a different table for a different program).
//
// Unlike installation-photos/upload-url (which has to hand-check
// ownership in app code because installation_reports uses uniform
// role-based RLS with no row ownership), lfg_installation_photos_insert
// already has real row-level RLS: admin/editor for any site, or the
// site's own partner. This route replicates that exact condition before
// presigning -- not because RLS won't also enforce it (it will, on the
// eventual INSERT), but because presigning first and letting the INSERT
// fail after the PUT already happened would leave an orphaned object in
// R2 with no DB row pointing at it. Checking first just avoids doing that
// pointless upload at all; it grants no privilege the RLS policy doesn't
// already grant on its own.
//
// POST /api/lfg/sites/[siteId]/installation-photos/upload-url
// Body: { kind: "before" | "after" | "completion" }

const KINDS = new Set(["before", "after", "completion"]);

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

  let body: { kind?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = body.kind;
  if (!kind || !KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid_kind", message: 'kind must be one of: "before", "after", "completion"' }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = profile?.role === "admin" || profile?.role === "editor" || profile?.role === "viewer";

  if (!isStaff) {
    // Mirrors lfg_installation_photos_insert's own-partner-only condition
    // for anyone who isn't staff -- see this file's header comment.
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

  const relativePath = `lfg-installation-photos/${siteId}/${kind}-${randomUUID()}.jpg`;

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: "image/jpeg" });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
