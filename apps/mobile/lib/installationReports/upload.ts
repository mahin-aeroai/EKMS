import { supabase } from "@/lib/supabase";
import type { PhotoKind } from "./types";

/**
 * Client for POST /api/installation-photos/upload-url -- see
 * apps/web/src/app/api/installation-photos/upload-url/route.ts. Same Bearer
 * auth pattern as lib/copilot.ts's authHeader.
 */

const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? "";

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");
  return { Authorization: `Bearer ${token}` };
}

export async function requestUploadUrl(
  reportId: string,
  kind: PhotoKind,
  siteEntryId?: string
): Promise<{ url: string; relativePath: string }> {
  const res = await fetch(`${API_BASE}/api/installation-photos/upload-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(await authHeader()) },
    body: JSON.stringify({ report_id: reportId, kind, site_entry_id: siteEntryId }),
  });

  if (res.status === 403) throw new Error("This report doesn't belong to you.");
  if (res.status === 404) throw new Error("Report not found -- it may not have been created yet.");
  if (!res.ok) throw new Error(`Couldn't get an upload URL (${res.status}).`);

  const json = await res.json();
  return { url: json.url, relativePath: json.relative_path };
}

/**
 * PUT the local photo's bytes to the presigned URL. `uri` is either a
 * file:// path (native) or a data: URI (web preview only -- see photo.ts).
 * fetch() reads both fine via .blob().
 */
export async function uploadPhotoBytes(uri: string, uploadUrl: string): Promise<void> {
  const fileRes = await fetch(uri);
  const blob = await fileRes.blob();
  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: blob,
  });
  if (!putRes.ok) throw new Error(`Photo upload failed (${putRes.status}).`);
}
