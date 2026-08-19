import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { radius } from "@mmdi/shared/theme";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import { deleteDraft, listDrafts, saveDraft } from "@/lib/installationReports/draftStore";
import { allPhotos } from "@/lib/installationReports/submit";
import { emptyDraftReport, type DraftReport } from "@/lib/installationReports/types";

/**
 * Plan section 4 step 1: "Reports list -- drafts and recently submitted."
 *
 * A local draft file is not the full picture: submit upserts the
 * installation_reports row (status: "draft") and every site_entry row
 * *before* it uploads a single photo (see submit.ts), so a submit that died
 * at photo 3 of 20 leaves a row sitting on the server that looks like normal
 * in-progress work from here, but is invisible to a supervisor checking any
 * server-side list -- unless this screen also checks the server. Three
 * states, merged by report id:
 *
 *   local draft   -- only exists on this device, submit was never attempted
 *                    (or died before the report row itself was upserted)
 *   incomplete    -- a server row exists with status != "submitted". The
 *                    dangerous one: it exists server-side but isn't done.
 *                    If the local draft is still on this device, Resume just
 *                    re-opens it -- submitReport() is idempotent per photo,
 *                    so it picks up from whichever photos already succeeded
 *                    rather than re-uploading them.
 *   complete      -- status = "submitted". Terminal; nothing to resume.
 *
 * Scoped to the signed-in user's own reports (created_by = auth.uid()) --
 * this is a personal worklist, not the admin-wide view web will eventually
 * own (plan section 5).
 */

type ReportStatus = "local-draft" | "incomplete" | "complete";

interface ReportListItem {
  id: string;
  storeName: string;
  status: ReportStatus;
  sortKey: string;
  photosUploaded: number | null;
  photosExpected: number | null;
  resumable: boolean;
}

const PAGE = 50;

function statusMeta(status: ReportStatus, t: VibrantTheme): { color: string; label: string } {
  if (status === "complete") return { color: t.success, label: "Complete" };
  if (status === "incomplete") return { color: t.danger, label: "Incomplete" };
  return { color: t.inkMuted, label: "Local draft" };
}

export default function ReportsScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [items, setItems] = useState<ReportListItem[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [discardingId, setDiscardingId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const [drafts, userRes] = await Promise.all([listDrafts(), supabase.auth.getUser()]);
        const userId = userRes.data.user?.id;
        if (cancelled) return;

        const draftsById = new Map(drafts.map((d) => [d.id, d]));

        const { data: serverReports } = userId
          ? await supabase
              .from("installation_reports")
              .select("id, store_name, status, created_at, submitted_at")
              .eq("created_by", userId)
              .order("created_at", { ascending: false })
              .limit(PAGE)
          : { data: [] as { id: string; store_name: string; status: string; created_at: string; submitted_at: string | null }[] };
        if (cancelled) return;

        const incompleteIds = (serverReports ?? []).filter((r) => r.status !== "submitted").map((r) => r.id);
        const photoCounts = new Map<string, number>();
        if (incompleteIds.length > 0) {
          const { data: photoRows } = await supabase
            .from("installation_report_photos")
            .select("report_id")
            .in("report_id", incompleteIds);
          for (const row of photoRows ?? []) {
            photoCounts.set(row.report_id, (photoCounts.get(row.report_id) ?? 0) + 1);
          }
        }
        if (cancelled) return;

        const byId = new Map<string, ReportListItem>();

        for (const r of serverReports ?? []) {
          const draft = draftsById.get(r.id);
          const complete = r.status === "submitted";
          byId.set(r.id, {
            id: r.id,
            storeName: r.store_name || "Untitled report",
            status: complete ? "complete" : "incomplete",
            sortKey: r.submitted_at ?? r.created_at,
            photosUploaded: complete ? null : photoCounts.get(r.id) ?? 0,
            photosExpected: complete ? null : draft ? allPhotos(draft).length : null,
            // Resuming re-opens the local draft, which still has every photo
            // file and every "already uploaded" checkpoint on disk. Without
            // it (a different device, or the draft file is gone) there's
            // nothing to resume from here.
            resumable: !complete && !!draft,
          });
        }

        for (const d of drafts) {
          if (byId.has(d.id)) continue;
          byId.set(d.id, {
            id: d.id,
            storeName: d.storeName || "Untitled report",
            status: "local-draft",
            sortKey: d.updatedAt,
            photosUploaded: null,
            photosExpected: null,
            resumable: true,
          });
        }

        const sorted = Array.from(byId.values()).sort((a, b) => b.sortKey.localeCompare(a.sortKey));
        setItems(sorted);
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  async function newReport() {
    setCreating(true);
    try {
      const id = Crypto.randomUUID();
      const draft = emptyDraftReport(id);
      await saveDraft(draft);
      router.push(`/report/${id}`);
    } finally {
      setCreating(false);
    }
  }

  // "Also give delete option for unsuccessful installtion reports" --
  // Discard used to only appear for "orphaned" incomplete reports (a
  // server row with no matching local draft, the one case where Resume
  // is impossible). Any OTHER unsubmitted report -- local-draft-only, or
  // incomplete-but-resumable -- had no delete path at all. Now offered
  // for every non-complete status; see the render below for exactly
  // which rows get the button.
  function confirmDiscard(item: ReportListItem) {
    Alert.alert(
      "Discard this report?",
      `"${item.storeName}" and all its site and photo rows will be permanently deleted. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Discard", style: "destructive", onPress: () => void discardReport(item) },
      ]
    );
  }

  async function discardReport(item: ReportListItem) {
    setDiscardingId(item.id);
    try {
      // A pure local-draft item (never reached the server at all) has no
      // installation_reports row to delete -- only the on-device file.
      if (item.status !== "local-draft") {
        // installation_report_site_entries and installation_report_photos
        // both reference report_id with `on delete cascade` (see
        // supabase-installation-reports-schema.sql), so deleting the
        // report row is enough to take every site and photo row with it.
        //
        // NOT solved here: any object this report already PUT to R2
        // before it got stuck is now orphaned -- deleting the DB row
        // doesn't touch R2, and there is no reverse index from a
        // relative_path back to "was this ever deleted". Cleaning those
        // up needs a separate service-role sweep (list the report's R2
        // prefix, delete anything with no matching photo row), not
        // something this client-side action can or should attempt.
        const { data, error } = await supabase.from("installation_reports").delete().eq("id", item.id).select("id");
        if (error) throw new Error(error.message);
        // RLS-filtered deletes return 200 with zero rows, not an error --
        // a silent no-op that would otherwise look identical to success.
        // Delete succeeds for an admin (installation_reports_delete_by_role)
        // or for the report's own creator while it's still status =
        // 'draft' (see supabase-installation-reports-own-draft-delete-
        // migration.sql) -- this is a defensive fallback for anything
        // outside both, which the UI shouldn't normally offer Discard on
        // in the first place.
        if (!data || data.length === 0) {
          throw new Error("Nothing was deleted -- you may not have permission to discard this report.");
        }
      }
      // Always clear the local draft file too (harmless no-op if there
      // isn't one) -- otherwise a resumable incomplete report's on-device
      // file would survive its own server-row delete and resurface as a
      // fresh "local draft" item next time this list loads.
      await deleteDraft(item.id);
      setItems((prev) => prev?.filter((it) => it.id !== item.id) ?? prev);
    } catch (err) {
      Alert.alert("Couldn't discard", err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDiscardingId(null);
    }
  }

  return (
    <View style={s.screen}>
      {items === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : items.length === 0 ? (
        <Text style={s.empty}>No reports yet. Start a new one below.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={s.list}
          renderItem={({ item }) => {
            const meta = statusMeta(item.status, t);
            const progress =
              item.status === "incomplete"
                ? item.photosExpected !== null
                  ? `${item.photosUploaded}/${item.photosExpected} photos uploaded`
                  : `${item.photosUploaded} photo(s) uploaded — draft not on this device`
                : null;
            const orphaned = item.status === "incomplete" && !item.resumable;
            // "not able to open and see the preview" -- complete reports
            // are now tappable too, opening the read-only server-backed
            // preview instead of the local-draft editor.
            const openTarget = item.resumable
              ? `/report/${item.id}`
              : item.status === "complete"
                ? `/report-preview/${item.id}`
                : null;
            // "give delete option for unsuccessful installtion reports" --
            // any non-complete report can be discarded now, not just
            // orphaned ones (see discardReport's own comment for how a
            // resumable one's local draft file gets cleaned up too).
            const canDiscard = item.status !== "complete";
            return (
              <Pressable onPress={() => openTarget && router.push(openTarget as never)} disabled={!openTarget}>
                {({ pressed }) => (
                  <SoftCard style={[s.row, pressed && !!openTarget && { opacity: 0.7 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.title} numberOfLines={1}>{item.storeName}</Text>
                      {progress && <Text style={s.progress}>{progress}</Text>}
                      <View style={s.statusWrap}>
                        <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                        <Text style={s.statusText}>{meta.label}</Text>
                        {orphaned && <Text style={s.statusText}> · not resumable here</Text>}
                      </View>
                    </View>
                    <View style={s.rowActions}>
                      {openTarget && (
                        <Text style={s.chev}>{item.status === "incomplete" ? "Resume ›" : "›"}</Text>
                      )}
                      {canDiscard && (
                        <Pressable
                          onPress={() => confirmDiscard(item)}
                          disabled={discardingId === item.id}
                          style={s.discardBtn}
                          hitSlop={8}
                        >
                          {discardingId === item.id ? (
                            <ActivityIndicator color={t.danger} />
                          ) : (
                            <Text style={s.discardText}>Discard</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </SoftCard>
                )}
              </Pressable>
            );
          }}
        />
      )}

      <View style={s.footer}>
        <GradientButton label="+ New Report" onPress={newReport} loading={creating} />
      </View>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
    title: { fontSize: 17, color: t.ink },
    progress: { fontSize: 13, color: t.inkSecondary, marginTop: 2 },
    statusWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, color: t.inkSecondary },
    chev: { fontSize: 15, fontWeight: "600", color: t.primary },
    rowActions: { flexDirection: "row", alignItems: "center", gap: 10 },
    discardBtn: { minHeight: 32, paddingHorizontal: 12, justifyContent: "center", alignItems: "center", borderRadius: radius.md, borderWidth: 1.5, borderColor: t.danger },
    discardText: { fontSize: 13, fontWeight: "600", color: t.danger },
    empty: { flex: 1, padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    pad: { padding: 24 },
    footer: {
      backgroundColor: t.surface,
      padding: 16,
    },
  });
