import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for a portal order's GST invoice PDF -- staff-only,
// same shape as orders/[orderId]/files/upload-url. The browser inserts the
// portal_order_invoices row itself afterward (see OrderDetailClient),
// carrying whatever CRN number / invoice number / date / amount staff
// typed in alongside it -- portal_order_invoices' own RLS (staff-insert-
// only) is the real authorization for that row, same layered approach as
// every other upload flow in this app.
//
// POST /api/portal/orders/[orderId]/invoices/upload-url
// Body: { file_name: string, content_type?: string }

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120);
}

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { orderId } = await params;

  let body: { file_name?: string; content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  if (!body.file_name) {
    return NextResponse.json({ error: "missing_file_name" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "editor") {
    return NextResponse.json({ error: "forbidden", message: "Only MMDI staff can upload an invoice." }, { status: 403 });
  }

  const { data: order } = await supabase.from("portal_orders").select("id").eq("id", orderId).maybeSingle();
  if (!order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const relativePath = `portal-orders/${orderId}/invoice/${randomUUID()}-${safeFileName(body.file_name)}`;
  const contentType = body.content_type || "application/pdf";

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: contentType });
    const url = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
