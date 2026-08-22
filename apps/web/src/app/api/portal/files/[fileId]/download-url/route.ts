import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for customer-portal order files. Unlike
// lfg-surveys/signed-url (which has to hand-roll a role/group check
// because that table predates per-row RLS for this use case),
// portal_order_files already has real ownership RLS — see
// supabase-customer-portal-schema.sql — so the select below IS the
// authorization check: a portal customer's session only ever sees rows for
// their own company's orders, staff sees everything, anyone else (or a
// wrong/foreign fileId) gets zero rows back and this 404s. No manual
// role/group replication needed here.
//
// GET /api/portal/files/[fileId]/download-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { fileId } = await params;

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: file, error: fileErr } = await supabase
    .from("portal_order_files")
    .select("relative_path, file_name")
    .eq("id", fileId)
    .maybeSingle();
  if (fileErr || !file) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: file.relative_path });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, file_name: file.file_name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
