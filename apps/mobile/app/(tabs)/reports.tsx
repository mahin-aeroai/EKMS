import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useColorScheme } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import * as Crypto from "expo-crypto";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import { listDrafts, saveDraft } from "@/lib/installationReports/draftStore";
import { emptyDraftReport, type DraftReport } from "@/lib/installationReports/types";

/**
 * Plan section 4 step 1: "Reports list -- drafts and recently submitted."
 * Recently-submitted reports aren't queryable from the device yet (that's
 * plan section 5, web-side, explicitly out of scope for this task) -- this
 * screen only lists local drafts. A draft's own submitState still shows
 * "Submitted" here until its file is deleted at the end of a successful
 * submit (see submit.ts), so a report mid-submit-retry doesn't just vanish.
 */
export default function ReportsScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);
  const router = useRouter();

  const [drafts, setDrafts] = useState<DraftReport[] | null>(null);
  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      listDrafts().then((d) => !cancelled && setDrafts(d));
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

  return (
    <View style={s.screen}>
      {drafts === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : drafts.length === 0 ? (
        <Text style={s.empty}>No draft reports yet. Start a new one below.</Text>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(d) => d.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => router.push(`/report/${item.id}`)}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: t.surfaceSunken }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.title} numberOfLines={1}>
                  {item.storeName || "Untitled report"}
                </Text>
                <Text style={s.meta}>
                  {item.submitState === "submitting" ? "Submitting…" : item.submitState === "submitted" ? "Submitted" : "Draft"}
                  {" · "}
                  {new Date(item.updatedAt).toLocaleString()}
                </Text>
              </View>
              <Text style={s.chev}>›</Text>
            </Pressable>
          )}
        />
      )}

      <View style={s.footer}>
        <Pressable style={s.newBtn} onPress={newReport} disabled={creating}>
          {creating ? <ActivityIndicator color={t.onBrand} /> : <Text style={s.newBtnText}>+ New Report</Text>}
        </Pressable>
      </View>
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 12, paddingHorizontal: 16 },
    title: { fontSize: 17, color: t.ink },
    meta: { fontSize: 13, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 16 },
    empty: { flex: 1, padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    pad: { padding: 24 },
    footer: {
      borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line, backgroundColor: t.surfaceRaised,
      padding: 16,
    },
    newBtn: { minHeight: 46, borderRadius: radius.md, backgroundColor: t.primary, alignItems: "center", justifyContent: "center" },
    newBtnText: { fontSize: 16, fontWeight: "600", color: t.onBrand },
  });
