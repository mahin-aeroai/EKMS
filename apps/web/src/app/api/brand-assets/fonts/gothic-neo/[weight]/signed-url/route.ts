import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for Apple SD Gothic Neo -- used client-side by
// pdfFonts.ts's fetchAppleSdGothicNeoFontBytes, so far only by Site Survey
// Report's pdfBuild.ts (the Inspection Details page and its continuation
// pages ask for this typeface by name, per the partner's own exact type
// spec). Mirrors ../../[weight]/signed-url/route.ts (the SF Pro Text
// route) exactly -- see that file's header comment for the full rationale
// on why a font's raw bytes are never committed to this repo; the same
// reasoning applies here (Apple's system font, the partner's own licensed
// copy, R2 keeps it out of git).
//
// Two weights only (not three, unlike SF Pro's regular/semibold/italic) --
// Regular and true Bold, per the partner's own spec for the pages that use
// this font ("Bold", not this app's usual Semibold-as-bold).
//
// GET /api/brand-assets/fonts/gothic-neo/[weight]/signed-url, weight one
// of "regular" | "bold" -- see pdfFonts.ts's GothicWeight type.

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

// Fixed object keys (this route never accepts an arbitrary key -- weight is
// validated against this map, not interpolated into the R2 key directly).
// Uploaded, at the bucket root -- same convention as the SF Pro keys:
//   apple-sd-gothic-neo-regular.otf
//   apple-sd-gothic-neo-bold.otf
const WEIGHT_KEYS: Record<string, string> = {
  regular: "apple-sd-gothic-neo-regular.otf",
  bold: "apple-sd-gothic-neo-bold.otf",
};

export async function GET(request: Request, { params }: { params: Promise<{ weight: string }> }) {
  const { weight } = await params;
  const key = WEIGHT_KEYS[weight];
  if (!key) {
    return NextResponse.json({ error: "unknown_weight", message: `weight must be one of: ${Object.keys(WEIGHT_KEYS).join(", ")}` }, { status: 400 });
  }

  if (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET_NAME) {
    return NextResponse.json(
      { error: "not_configured", message: "R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME must be set as Vercel environment variables." },
      { status: 503 }
    );
  }

  // Any signed-in user, same as the SF Pro route -- this is a shared brand
  // asset (not report data), not something to gate by role.
  const supabase = await createRouteSupabaseClient(request);
  const { response: authError } = await requireVerifiedUser(supabase);
  if (authError) return authError;

  try {
    const command = new GetObjectCommand({ Bucket: process.env.R2_BUCKET_NAME, Key: key });
    const url = await getSignedUrl(r2, command, { expiresIn: 300 });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "signing_failed", message }, { status: 500 });
  }
}
