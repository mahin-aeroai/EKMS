import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for viewing a shipment's already-uploaded POD file.
// Same "trust RLS" approach as the installation-photos signed-url route:
// query the shipment row through the caller's own RLS-scoped Supabase
// client rather than re-deriving lfg_shipments_select's condition here --
// if the row (and its pod_path) comes back, RLS already decided this
// caller is allowed to see it.
//
// GET /api/lfg/shipments/[shipmentId]/pod/signed-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ shipmentId: string }> }) {
  const { shipmentId } = await params;

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: shipment } = await supabase.from("lfg_shipments").select("id, pod_path").eq("id", shipmentId).maybeSingle();

  if (!shipment || !shipment.pod_path) {
    return NextResponse.json({ error: "pod_not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: shipment.pod_path });
    const url = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
