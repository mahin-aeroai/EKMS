import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for Site Survey Report photos, same Cloudflare R2
// pattern as /api/installation-photos/upload-url. site_survey_reports (like
// installation_reports) uses uniform role-based RLS with no row ownership
// -- admin/editor can INSERT/UPDATE ANY report, not just their own -- so
// the staff check here mirrors that exactly (admin-or-editor, not
// admin-or-creator-only): a colleague picking up someone else's draft
// report can still add photos to it, same as they could edit any other
// field on it. See supabase-site-survey-reports-schema.sql's RLS block.
//
// Widened (2 Sept 2026, see
// supabase-lfg-site-survey-reports-partner-migration.sql) for the LFG
// partner Site Survey flow: a non-staff caller is allowed when they
// created the report themselves (created_by = auth.uid(), the
// freestanding-draft case) OR the report is already attached to one of
// their own sites (site_id -> lfg_sites.partner_id) -- mirrors the new
// site_survey_reports_*_partner RLS policies exactly, just re-checked
// here since this route hands out a signed R2 URL, which RLS alone can't
// gate.
//
// POST /api/site-survey-reports/[reportId]/photos/upload-url
// Body: { category: PhotoCategory }

const CATEGORIES = new Set([
  "main_site",
  "orientation_right",
  "orientation_left",
  "orientation_opposite",
  "measurement",
  "viewpoint_a",
  "viewpoint_b",
  "viewpoint_c",
  "viewpoint_d",
  "other",
]);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(request: Request, { params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  let body: { category?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const category = body.category;
  if (!category || !CATEGORIES.has(category)) {
    return NextResponse.json({ error: "invalid_category", message: `category must be one of: ${[...CATEGORIES].join(", ")}` }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: report, error: reportErr } = await supabase
    .from("site_survey_reports")
    .select("id, created_by, site_id")
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  let canWrite = profile?.role === "admin" || profile?.role === "editor";

  if (!canWrite && report.created_by === user.id) {
    canWrite = true;
  }
  if (!canWrite && report.site_id) {
    const { data: site } = await supabase.from("lfg_sites").select("partner_id").eq("id", report.site_id).maybeSingle();
    const { data: partnerUser } = await supabase.from("lfg_partner_users").select("partner_id").eq("id", user.id).maybeSingle();
    if (site && partnerUser && site.partner_id === partnerUser.partner_id) {
      canWrite = true;
    }
  }
  if (!canWrite) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const relativePath = `site-survey-reports/${reportId}/${category}-${randomUUID()}.jpg`;

  try {
    // Photos are always converted to JPEG client-side before upload -- see
    // PhotosStep.tsx -- ContentType is fixed rather than caller-supplied,
    // which also means the PUT must send this exact Content-Type header or
    // the signature won't validate.
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: "image/jpeg" });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
