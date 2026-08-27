import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for lfg_site_documents (task #34's real Documents
// tab -- reference/survey/installation/other files per site). Same shape
// as installation-photos/upload-url, but lfg_site_documents_insert's
// staff-side condition is admin/editor only (NOT viewer, unlike the
// installation photos and reference-picture tables) -- this route
// replicates that exact condition, not the broader "any staff" check used
// elsewhere, so a viewer never gets a presigned URL for an insert RLS
// would reject anyway.
//
// POST /api/lfg/sites/[siteId]/documents/upload-url
// Body: { category: "reference"|"survey"|"installation"|"other", file_name: string, file_type?: string }

const CATEGORIES = new Set(["reference", "survey", "installation", "other"]);

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

  let body: { category?: string; file_name?: string; file_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const category = body.category;
  if (!category || !CATEGORIES.has(category)) {
    return NextResponse.json(
      { error: "invalid_category", message: 'category must be one of: "reference", "survey", "installation", "other"' },
      { status: 400 }
    );
  }
  const fileName = (body.file_name || "").trim();
  if (!fileName) {
    return NextResponse.json({ error: "invalid_file_name" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaffWriter = profile?.role === "admin" || profile?.role === "editor";
  let uploadedByRole: "staff" | "partner" = "staff";

  if (!isStaffWriter) {
    // Mirrors lfg_site_documents_insert's own-partner-only condition for
    // anyone who isn't admin/editor -- see this file's header comment.
    const { data: site } = await supabase.from("lfg_sites").select("partner_id").eq("id", siteId).maybeSingle();
    const { data: partnerUser } = await supabase.from("lfg_partner_users").select("partner_id").eq("id", user.id).maybeSingle();
    if (!site || !partnerUser || site.partner_id !== partnerUser.partner_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    uploadedByRole = "partner";
  } else {
    const { data: site } = await supabase.from("lfg_sites").select("id").eq("id", siteId).maybeSingle();
    if (!site) {
      return NextResponse.json({ error: "site_not_found" }, { status: 404 });
    }
  }

  const relativePath = `lfg-site-documents/${siteId}/${category}/${randomUUID()}-${fileName.replace(/[^a-zA-Z0-9_.-]/g, "_")}`;
  const contentType = body.file_type || "application/octet-stream";

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: contentType });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath, uploaded_by_role: uploadedByRole });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
