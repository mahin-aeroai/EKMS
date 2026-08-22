import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for customer-portal order files (design proofs from
// MMDI, reference/other files from the customer) — same shape as
// installation-photos/upload-url: the file's bytes go straight from the
// browser to R2, never through this server. That matters even more here
// than for a device photo — a customer's reference artwork or an MMDI
// design proof can be a heavy PSD/AI/TIFF file, exactly the case a Vercel
// function's request-body limit and execution time would choke on.
//
// POST /api/portal/orders/[orderId]/files/upload-url
// Body: { kind: "reference" | "proof" | "other", file_name: string, content_type?: string }
//
// After the browser PUTs the bytes to the returned `url`, it inserts the
// portal_order_files row itself via the normal browser Supabase client —
// unlike installation-photos (whose table has no ownership RLS to lean
// on), portal_order_files' own RLS policies already encode exactly who
// may insert which `kind` for which order (see
// supabase-customer-portal-schema.sql STEP 14), so there's no need for a
// second "confirm" server route here. This route's own job is narrower:
// R2 itself has no RLS, so it still has to independently confirm the
// caller may act on this order before signing anything — otherwise
// presigning succeeds for any orderId the caller can guess, since R2
// doesn't check existence/ownership at signing time (see
// lfg-surveys/signed-url's comment on the same trap for GETs).

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

  let body: { kind?: string; file_name?: string; content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const kind = body.kind;
  const fileName = body.file_name;
  if (!kind || !["reference", "proof", "other"].includes(kind)) {
    return NextResponse.json({ error: "invalid_kind", message: 'kind must be "reference", "proof", or "other"' }, { status: 400 });
  }
  if (!fileName) {
    return NextResponse.json({ error: "missing_file_name" }, { status: 400 });
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  // A "proof" is MMDI's own design upload — only staff may request one of
  // those signing URLs. Ownership of the order itself (for either role) is
  // enforced by RLS on the select below: a portal customer's session only
  // ever sees orders where portal_orders.company_id = their own company,
  // so a non-owned orderId simply resolves to no row -> 404. Staff
  // (admin/editor) can see every order, matching portal_orders' own policy.
  if (kind === "proof") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (profile?.role !== "admin" && profile?.role !== "editor") {
      return NextResponse.json({ error: "forbidden", message: "Only MMDI staff can upload a design proof." }, { status: 403 });
    }
  }

  const { data: order, error: orderErr } = await supabase.from("portal_orders").select("id").eq("id", orderId).maybeSingle();
  if (orderErr || !order) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const relativePath = `portal-orders/${orderId}/${kind}/${randomUUID()}-${safeFileName(fileName)}`;
  const contentType = body.content_type || "application/octet-stream";

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: contentType });
    // Design/reference files can be large — 5 minutes to actually push the
    // bytes, well beyond the 60s window used for small device photos
    // elsewhere in this app.
    const url = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
