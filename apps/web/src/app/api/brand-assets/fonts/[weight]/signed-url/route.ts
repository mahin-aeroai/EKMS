import { NextResponse } from "next/server";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createRouteSupabaseClient, requireVerifiedUser } from "@/lib/supabase-route";

export const dynamic = "force-dynamic";

// Presigned-GET bridge for Apple's SF Pro Text font -- used client-side by
// pdfFonts.ts (shared by both Site Survey Report's and Installation
// Report's pdfBuild.ts) so the generated PDFs use Apple's own typeface
// instead of Helvetica, per the partner's request.
//
// The font files themselves are NEVER committed to this repo: Apple's Font
// License Agreement licenses partners to use SF Pro in their own designs
// and communications, but doesn't grant redistribution rights over the
// font software itself -- checking the raw files into git (and so onto
// GitHub, and into every clone/CI runner) would cross from "using the
// licensed font" into "redistributing it", which the license doesn't
// cover. R2 -- already this app's only file-storage mechanism, see the
// other signed-url routes -- keeps them out of git entirely, exactly like
// every photo and source PDF in this app; the object just needs uploading
// once, by hand, to the keys this route expects (see WEIGHT_KEYS below),
// by someone with Cloudflare R2 access.
//
// Keys sit at the bucket root (sf-pro-text-*.otf, no shared-assets/fonts/
// prefix) rather than nested under a folder like every other object in
// this bucket -- that's simply where they landed on first upload, and
// there's no functional reason to prefer a prefix for 3 fixed,
// never-per-report files, so the keys were left where they are instead of
// making someone re-upload into a folder for tidiness alone.
//
// GET /api/brand-assets/fonts/[weight]/signed-url, weight one of
// "regular" | "semibold" | "italic" -- see pdfFonts.ts's FontWeight type.

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
// Uploaded, at the bucket root:
//   sf-pro-text-regular.otf
//   sf-pro-text-semibold.otf
//   sf-pro-text-italic.otf
const WEIGHT_KEYS: Record<string, string> = {
  regular: "sf-pro-text-regular.otf",
  semibold: "sf-pro-text-semibold.otf",
  italic: "sf-pro-text-italic.otf",
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

  // Any signed-in user, same as every other read this portal serves --
  // this is a shared brand asset (not report data), not something to gate
  // by role.
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
