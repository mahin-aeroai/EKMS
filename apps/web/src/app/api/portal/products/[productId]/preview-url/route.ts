import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET for a product's preview thumbnail. Given a longer expiry
// than order files (900s vs 60s) — this is a read-many small image shown
// while someone browses the Products page, not a one-shot download, and
// re-signing on every render would be wasteful. Authorization: any
// authenticated portal user or staff member may view any ACTIVE product's
// preview (the catalog itself isn't company-scoped — see
// portal_products_select in supabase-customer-portal-schema.sql); staff
// may also preview an inactive/retired product while editing it.
//
// GET /api/portal/products/[productId]/preview-url

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

export async function GET(request: Request, { params }: { params: Promise<{ productId: string }> }) {
  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  const { productId } = await params;

  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  const { data: product, error: productErr } = await supabase
    .from("portal_products")
    .select("preview_image_path")
    .eq("id", productId)
    .maybeSingle();
  if (productErr || !product || !product.preview_image_path) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: product.preview_image_path });
    const url = await getSignedUrl(r2, command, { expiresIn: 900 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 404 });
  }
}
