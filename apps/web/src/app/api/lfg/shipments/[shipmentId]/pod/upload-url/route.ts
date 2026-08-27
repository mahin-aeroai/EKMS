import { NextResponse } from "next/server";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "crypto";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-PUT bridge for a shipment's proof-of-delivery file
// (lfg_shipments.pod_path -- one file per shipment, not a gallery like
// lfg_installation_photos). Same reasoning as
// lfg/sites/[siteId]/installation-photos/upload-url/route.ts for checking
// authorization before presigning rather than after: this replicates
// lfg_shipments_write's exact condition (admin/editor for any shipment, or
// the shipment's own site's partner) so a presigned-but-then-rejected
// upload never happens -- the actual pod_path UPDATE afterward is a plain
// client-side supabase.from("lfg_shipments").update(...), RLS-enforced the
// normal way, same as every other LFG field edit in this app.
//
// POST /api/lfg/shipments/[shipmentId]/pod/upload-url
// Body: { content_type: "application/pdf" | "image/jpeg" | "image/png" }
// (a POD is either a scanned/signed delivery slip PDF or a courier photo)

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
};

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function POST(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  let body: { content_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const extension = body.content_type ? EXTENSION_BY_CONTENT_TYPE[body.content_type] : undefined;
  if (!body.content_type || !extension) {
    return NextResponse.json(
      { error: "invalid_content_type", message: 'content_type must be one of: "application/pdf", "image/jpeg", "image/png"' },
      { status: 400 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { user, response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaffWriter = profile?.role === "admin" || profile?.role === "editor";

  const { data: shipment } = await supabase.from("lfg_shipments").select("id, site_id").eq("id", shipmentId).maybeSingle();
  if (!shipment) {
    return NextResponse.json({ error: "shipment_not_found" }, { status: 404 });
  }

  if (!isStaffWriter) {
    // Mirrors lfg_shipments_write's own-partner-only condition for anyone
    // who isn't staff -- see this file's header comment.
    const { data: site } = await supabase.from("lfg_sites").select("partner_id").eq("id", shipment.site_id).maybeSingle();
    const { data: partnerUser } = await supabase.from("lfg_partner_users").select("partner_id").eq("id", user.id).maybeSingle();
    if (!site || !partnerUser || site.partner_id !== partnerUser.partner_id) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
  }

  const relativePath = `lfg-shipment-pod/${shipmentId}/pod-${randomUUID()}.${extension}`;

  try {
    const command = new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: relativePath, ContentType: body.content_type });
    const url = await getSignedUrl(r2, command, { expiresIn: 60 });
    return NextResponse.json({ url, relative_path: relativePath });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
