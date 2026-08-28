import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for a report's SOURCE PDF (the existing filled-in
// Site Survey PDF a user uploads for AI extraction) -- same R2 pattern as
// site-survey-reports/[reportId]/photos/upload-url, but application/pdf
// instead of image/jpeg, and one PDF per report rather than many. Uploaded
// straight from the browser to R2 (not proxied through this server's
// request body) specifically because Vercel Route Handlers cap inbound
// bodies around 4.5MB, and a photo-heavy multi-page PDF can exceed that --
// see the plan's extraction-workflow section. The extract route then reads
// this same object server-side, where there's no such limit.
//
// POST /api/site-survey-reports/[reportId]/source-pdf/upload-url

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

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: report, error: reportErr } = await supabase.from("site_survey_reports").select("id").eq("id", reportId).maybeSingle();
  if (reportErr || !report) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const canWrite = profile?.role === "admin" || profile?.role === "editor";
  if (!canWrite) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const relativePath = `site-survey-source-pdfs/${reportId}/${randomUUID()}.pdf`;

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: "application/pdf" });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
