import { supabase } from "@/lib/supabase";
import { deleteDraft, saveDraft } from "./draftStore";
import { deletePhotoFile } from "./photo";
import { requestUploadUrl, uploadPhotoBytes } from "./upload";
import { STORE_LEVEL_KINDS, type DraftPhoto, type DraftReport, type DraftSite } from "./types";

/**
 * Idempotent submit (plan section 3 + user's explicit requirement): if this
 * fails partway through twenty photos, retrying must not re-upload the
 * fifteen that already succeeded, and the local draft must stay on disk
 * until every photo is confirmed and every row is inserted.
 *
 * Ordering, and why: installation_report_photos has FK columns
 * (report_id, site_entry_id) that installation-photos/upload-url validates
 * against real rows before it will sign anything (see that route's
 * not_found/forbidden checks) -- so the report row and every site_entry row
 * must exist in the DB *before* any photo can be uploaded, not after.
 *
 *   1. Upsert the report row (status: "draft") and every site_entry row --
 *      upsert on id, so re-running this after a crash doesn't duplicate or
 *      error on rows already inserted by a previous attempt.
 *   2. For each photo not yet "done": request an upload URL, PUT the bytes,
 *      then upsert its installation_report_photos row -- and persist the
 *      draft's updated per-photo status to disk after EVERY photo, not once
 *      at the end. That per-photo checkpoint is what makes retry-after-
 *      partial-failure skip the ones that already succeeded.
 *   3. Once every photo is "done": flip the report row to "submitted".
 *   4. Only now delete the local draft (and its photo files) -- deleting it
 *      any earlier and then failing would strand the report with no local
 *      copy and no way to resume.
 */

export interface SubmitProgress {
  phase: "rows" | "photos" | "finalizing" | "done";
  photosTotal: number;
  photosDone: number;
}

/** Exported for reports.tsx -- computing "expected" photo count for a stuck report's progress display. */
export function allPhotos(draft: DraftReport): { photo: DraftPhoto; siteEntryId: string | null }[] {
  const out: { photo: DraftPhoto; siteEntryId: string | null }[] = [];
  for (const kind of STORE_LEVEL_KINDS) {
    const p = draft.storePhotos[kind];
    if (p) out.push({ photo: p, siteEntryId: null });
  }
  for (const site of draft.sites) {
    for (const p of Object.values(site.photos)) {
      if (p) out.push({ photo: p, siteEntryId: site.id });
    }
  }
  return out;
}

function setPhotoStatus(draft: DraftReport, photoId: string, patch: Partial<DraftPhoto>): DraftReport {
  const next: DraftReport = {
    ...draft,
    storePhotos: { ...draft.storePhotos },
    sites: draft.sites.map((s) => ({ ...s, photos: { ...s.photos } })),
  };
  for (const kind of STORE_LEVEL_KINDS) {
    const p = next.storePhotos[kind];
    if (p?.id === photoId) next.storePhotos[kind] = { ...p, ...patch };
  }
  for (const site of next.sites) {
    for (const kind of Object.keys(site.photos) as (keyof DraftSite["photos"])[]) {
      const p = site.photos[kind];
      if (p?.id === photoId) site.photos[kind] = { ...p, ...patch };
    }
  }
  return next;
}

export async function submitReport(
  draftIn: DraftReport,
  onProgress?: (p: SubmitProgress) => void
): Promise<void> {
  let draft = draftIn;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id ?? null;

  draft = { ...draft, submitState: "submitting" };
  await saveDraft(draft);

  // Resuming after a crash that happened *after* the server-side submit
  // already finished, but *before* the local draft was deleted, must not
  // re-upsert status back to "draft" -- that would silently un-submit an
  // already-submitted report. If the row is already submitted, the only
  // remaining work is local cleanup.
  const { data: existing } = await supabase.from("installation_reports").select("status").eq("id", draft.id).maybeSingle();
  if (existing?.status === "submitted") {
    for (const { photo } of allPhotos(draft)) deletePhotoFile(photo.uri);
    await deleteDraft(draft.id);
    onProgress?.({ phase: "done", photosTotal: allPhotos(draft).length, photosDone: allPhotos(draft).length });
    return;
  }

  onProgress?.({ phase: "rows", photosTotal: allPhotos(draft).length, photosDone: 0 });

  const { error: reportError } = await supabase.from("installation_reports").upsert(
    {
      id: draft.id,
      store_id: draft.storeId,
      store_name: draft.storeName,
      address: draft.address || null,
      sfo_id: draft.sfoId || null,
      program: draft.program || null,
      asm_name: draft.asmName || null,
      asm_contact: draft.asmContact || null,
      season_program: draft.seasonProgram || null,
      installation_date: draft.installationDate || null,
      team_id: draft.teamId,
      team_name: draft.teamName || null,
      status: "draft",
      created_by: userId,
    },
    { onConflict: "id" }
  );
  if (reportError) throw new Error(`Couldn't save the report: ${reportError.message}`);

  for (const site of draft.sites) {
    const { error: siteError } = await supabase.from("installation_report_site_entries").upsert(
      {
        id: site.id,
        report_id: draft.id,
        site_index: site.siteIndex,
        fixture_type: site.fixtureType || null,
        material: site.material || null,
        sign_type: site.signType || null,
        width_mm: site.widthMm,
        height_mm: site.heightMm,
        remarks: site.remarks || null,
      },
      { onConflict: "id" }
    );
    if (siteError) throw new Error(`Couldn't save site ${site.siteIndex}: ${siteError.message}`);
  }

  const photos = allPhotos(draft);
  let done = photos.filter((p) => p.photo.status === "done").length;
  onProgress?.({ phase: "photos", photosTotal: photos.length, photosDone: done });

  for (const { photo, siteEntryId } of photos) {
    if (photo.status === "done") continue;

    if (photo.status === "local") {
      const { url, relativePath } = await requestUploadUrl(draft.id, photo.kind, siteEntryId ?? undefined);
      await uploadPhotoBytes(photo.uri, url);
      draft = setPhotoStatus(draft, photo.id, { status: "uploaded", relativePath });
      await saveDraft(draft);
    }

    const current = allPhotos(draft).find((p) => p.photo.id === photo.id)!.photo;
    const { error: photoError } = await supabase.from("installation_report_photos").upsert(
      {
        id: current.id,
        report_id: draft.id,
        site_entry_id: siteEntryId,
        kind: current.kind,
        relative_path: current.relativePath,
        captured_at: current.capturedAt,
      },
      { onConflict: "id" }
    );
    if (photoError) throw new Error(`Couldn't save photo row (${current.kind}): ${photoError.message}`);

    draft = setPhotoStatus(draft, photo.id, { status: "done" });
    await saveDraft(draft);
    done += 1;
    onProgress?.({ phase: "photos", photosTotal: photos.length, photosDone: done });
  }

  onProgress?.({ phase: "finalizing", photosTotal: photos.length, photosDone: done });
  const { error: finalizeError } = await supabase
    .from("installation_reports")
    .update({ status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", draft.id);
  if (finalizeError) throw new Error(`Couldn't finalize the report: ${finalizeError.message}`);

  for (const { photo } of photos) deletePhotoFile(photo.uri);
  await deleteDraft(draft.id);
  onProgress?.({ phase: "done", photosTotal: photos.length, photosDone: done });
}
