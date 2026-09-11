import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for a portal order's invoice PDF -- mirrors
// portal/files/[fileId]/download-url exactly: portal_order_invoices'
// own RLS (staff sees everything, a customer only their own company's
// orders) IS the authorization check here, so a foreign/unowned
// invoiceId simply resolves to no row and this 404s.
//
// GET /api/portal/order-invoices/[invoiceId]/download-url?mode=download
//
// Two client-facing affordances share this one route (task feedback: "i
// want invoice preview along with download"): the default (no `mode`, or
// any value other than "download") signs a plain GET with no
// Content-Disposition override, so the browser's own PDF viewer renders
// it inline when opened in a new tab -- a "Preview". `?mode=download`
// additionally sets ResponseContentDisposition to force a real Save-As
// with the invoice's real file name, even though R2 objects here were
// uploaded generically (no Content-Disposition set at upload time in
// invoices/upload-url/route.ts).

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ invoiceId: string }> }) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { invoiceId } = await params;
  const mode = new URL(request.url).searchParams.get("mode");

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: invoice, error: invoiceErr } = await supabase
    .from("portal_order_invoices")
    .select("relative_path, file_name")
    .eq("id", invoiceId)
    .maybeSingle();
  if (invoiceErr || !invoice) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: invoice.relative_path,
      ...(mode === "download" ? { ResponseContentDisposition: `attachment; filename="${invoice.file_name.replace(/"/g, "")}"` } : {}),
    });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, file_name: invoice.file_name });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
