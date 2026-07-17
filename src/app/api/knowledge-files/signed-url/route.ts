import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Presigned-URL bridge for real Knowledge-module files (Documents, Drawings,
// SOPs) -- same Cloudflare R2 pattern as /api/lfg-surveys/signed-url, but
// generalized across all 3 tables instead of one dedicated route each, since
// they share an identical access pattern (see
// supabase-knowledge-files-migration.sql for the shared columns and
// upload-knowledge-files.mjs for how files land in R2 in the first place).
//
// R2 has no equivalent of Postgres RLS, so the role/group check has to be
// done explicitly here -- it manually replicates public.user_role() +
// public.user_has_group_access() from supabase-module-access-migration.sql
// (admin bypasses everything; otherwise role must be admin/editor/viewer AND
// allowed_groups is null or includes 'knowledge'). If that migration's logic
// ever changes, this needs to change with it -- it is NOT automatically kept
// in sync the way a real RLS policy would be.
//
// GET /api/knowledge-files/signed-url?table=documents|drawings|sops&path=<relative_path>
// relative_path must exactly match the row's relative_path column, which is
// also the object's key in the R2 bucket (kept identical on purpose so the
// two never drift apart).

const ALLOWED_TABLES = new Set(["documents", "drawings", "sops"]);
const ALLOWED_GROUPS = ["knowledge"];

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table");
  const path = searchParams.get("path");

  if (!table || !ALLOWED_TABLES.has(table)) {
    return NextResponse.json({ error: "invalid_table", message: "table must be one of: documents, drawings, sops" }, { status: 400 });
  }
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // Manual role/group check -- see header comment for why this can't just be
  // a Postgres RLS policy like the rest of the app.
  const { data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("role, allowed_groups")
    .eq("id", user.id)
    .maybeSingle();
  if (profileErr || !profile) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const role = profile.role as string;
  const allowedGroups = profile.allowed_groups as string[] | null;
  const roleOk = role === "admin" || role === "editor" || role === "viewer";
  const groupOk = role === "admin" || allowedGroups === null || allowedGroups.some((g) => ALLOWED_GROUPS.includes(g));
  if (!roleOk || !groupOk) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Also confirm the row actually exists in the requested table with this
  // exact relative_path, rather than trusting the client's path blindly --
  // R2 keys are namespaced by table (see upload-knowledge-files.mjs), so a
  // path valid for "documents" should not be openable by guessing the table
  // param, even though R2 itself has no row-level concept.
  const { data: row, error: rowErr } = await supabase
    .from(table)
    .select("id")
    .eq("relative_path", path)
    .maybeSingle();
  if (rowErr || !row) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: path });
    // 60 seconds is plenty for the client to receive this response and
    // immediately open the URL -- short-lived on purpose since anyone
    // holding the URL (not just the app) could use it while it's valid.
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
