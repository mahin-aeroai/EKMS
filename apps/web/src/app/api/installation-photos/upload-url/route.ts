import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for installation report photos, uploaded to
// Cloudflare R2 like every other file in this app -- but every existing R2
// route (knowledge-files, lfg-surveys) only ever issues presigned GETs. This
// is the first presigned PUT: the mobile app captures a photo on-device and
// uploads it straight to R2 without the bytes passing through this server.
//
// POST /api/installation-photos/upload-url
// Body: { report_id: string, kind: string, site_entry_id?: string }
//
// kind must be one of the values installation_report_photos.kind's CHECK
// constraint allows (see supabase-installation-reports-schema.sql) -- the
// exact camelCase keys from StorePictures/SiteEntry in pdfBuild.ts, not a
// new taxonomy. site_entry_id is required for the 6 per-site kinds
// (mainSlide/closeUp/cornerTL/cornerTR/cornerBL/cornerBR) so multiple sites
// in one report don't collide; omit it for the 4 store-level kinds.
//
// Presigning does not validate anything on its own -- signing a PUT for a
// key under a report the caller doesn't own would let them (or anyone who
// later holds the URL) overwrite that report's photos. Unlike every table
// this app has, there is no ownership RLS to fall back on here (every
// sibling table -- and every table in this app -- uses uniform role-based
// RLS, not row ownership; see the schema file's own comment on this). This
// route is where "a supervisor only touches their own report" is actually
// enforced, the same way knowledge-files/signed-url and
// lfg-surveys/signed-url already do checks in route code that can't be
// expressed as a table policy. The own-or-admin shape mirrors
// profiles_select_own_or_admin in supabase-role-based-rls-migration.sql --
// the closest existing precedent for this kind of check.

const STORE_LEVEL_KINDS = new Set(["storeFullCover", "installationCloseUp", "streetView1", "streetView2"]);
const SITE_LEVEL_KINDS = new Set(["mainSlide", "closeUp", "cornerTL", "cornerTR", "cornerBL", "cornerBR"]);
const ALL_KINDS = new Set<string>([...STORE_LEVEL_KINDS, ...SITE_LEVEL_KINDS]);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(request: Request) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  let body: { report_id?: string; kind?: string; site_entry_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const reportId = body.report_id;
  const kind = body.kind;
  const siteEntryId = body.site_entry_id;

  if (!reportId || !kind) {
    return NextResponse.json({ error: "missing_fields", message: "report_id and kind are required" }, { status: 400 });
  }
  if (!ALL_KINDS.has(kind)) {
    return NextResponse.json({ error: "invalid_kind", message: `kind must be one of: ${[...ALL_KINDS].join(", ")}` }, { status: 400 });
  }
  if (SITE_LEVEL_KINDS.has(kind) && !siteEntryId) {
    return NextResponse.json({ error: "missing_site_entry_id", message: `kind "${kind}" is per-site and requires site_entry_id` }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: report, error: reportErr } = await supabase
    .from("installation_reports")
    .select("id, created_by")
    .eq("id", reportId)
    .maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isAdmin = profile?.role === "admin";
  if (report.created_by !== user.id && !isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // If a site_entry_id was given, confirm it actually belongs to this
  // report -- otherwise a client bug (or a tampered request) could record a
  // photo against a site entry that belongs to a different report entirely.
  if (siteEntryId) {
    const { data: siteEntry, error: siteEntryErr } = await supabase
      .from("installation_report_site_entries")
      .select("id")
      .eq("id", siteEntryId)
      .eq("report_id", reportId)
      .maybeSingle();
    if (siteEntryErr || !siteEntry) {
      return NextResponse.json({ error: "site_entry_not_found" }, { status: 404 });
    }
  }

  const relativePath = `installation-reports/${reportId}/${randomUUID()}.jpg`;

  try {
    // Photos are always resized to JPEG on-device before upload (see the
    // plan's expo-image-manipulator step) -- ContentType is fixed rather
    // than caller-supplied, which also means the PUT must send this exact
    // Content-Type header or the signature won't validate.
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: "image/jpeg" });
    // Same 60s window as every other presigned URL in this app.
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
