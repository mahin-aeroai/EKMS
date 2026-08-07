import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SymbolView } from "expo-symbols";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "../../lib/supabase";
import { getSignedUrl } from "../../lib/copilot";
import type { ApplelfgSiteSurveyRow } from "@mmdi/shared/rows";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard } from "../../theme/components";

/**
 * Mirrors src/app/workspaces/site-surveys/page.tsx: query
 * apple_lfg_site_surveys, then hit /api/lfg-surveys/signed-url to open the PDF.
 * The route needs no changes beyond Bearer auth (see web-patch/).
 *
 * Difference from web: instead of window.open() we download to the app's cache
 * directory and hand the file to the iOS share sheet, so it can go to Files,
 * Mail, or Preview.
 *
 * "Site Survey page looks so boring make it only search then show results
 * with beautiful theme" -- previously fetched and showed the 40 most
 * recent surveys unconditionally on mount, which read as an inert list
 * rather than a search tool. Now: an empty query shows a prompt state
 * (search icon + hint text) and fetches nothing at all -- the list only
 * appears once you've actually typed something.
 */

const PAGE = 40;

export default function SurveysScreen() {
  const t = vibrant;
  const s = styles(t);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ApplelfgSiteSurveyRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    const term = query.trim();
    if (!term) {
      setRows(null);
      setTotalCount(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const q = supabase
        .from("apple_lfg_site_surveys")
        .select("*", { count: "exact" })
        .order("uploaded_at", { ascending: false })
        .limit(PAGE)
        .or(`store_name.ilike.%${term}%,apple_store_id.ilike.%${term}%,chain.ilike.%${term}%,file_name.ilike.%${term}%`);

      const { data, count, error } = await q;
      if (cancelled) return;
      if (error) {
        setRows([]);
        return;
      }
      setRows(data as ApplelfgSiteSurveyRow[]);
      setTotalCount(count ?? null);
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const open = useCallback(async (row: ApplelfgSiteSurveyRow) => {
    setOpeningId(row.id);
    try {
      const url = await getSignedUrl("survey", { path: row.relative_path });
      const destination = new File(Paths.cache, row.file_name);
      // idempotent: true -- re-opening the same survey twice in a session must
      // overwrite the cached copy, not throw (the default behaviour of the
      // new File API, unlike the old FileSystem.downloadAsync it replaces).
      const file = await File.downloadFileAsync(url, destination, { idempotent: true });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } finally {
      setOpeningId(null);
    }
  }, []);

  const searching = query.trim().length > 0;

  return (
    <View style={s.screen}>
      <Text style={s.heading}>Site Surveys</Text>
      <View style={s.searchWrap}>
        <SymbolView name="magnifyingglass" tintColor={t.inkMuted} size={18} />
        <TextInput
          style={s.search}
          value={query}
          onChangeText={setQuery}
          placeholder="Store, chain, or Apple store ID"
          placeholderTextColor={t.inkMuted}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {!searching ? (
        <View style={s.prompt}>
          <View style={s.promptIconWrap}>
            <SymbolView name="doc.text.magnifyingglass" tintColor={t.primary} size={30} />
          </View>
          <Text style={s.promptTitle}>Find a site survey</Text>
          <Text style={s.promptText}>Search by store name, chain, or Apple store ID to see results.</Text>
        </View>
      ) : rows === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : rows.length === 0 ? (
        <Text style={s.empty}>No surveys match that search.</Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={s.list}
          ListHeaderComponent={
            <Text style={s.resultCount}>
              {totalCount ?? rows.length} result{(totalCount ?? rows.length) === 1 ? "" : "s"}
            </Text>
          }
          ListFooterComponent={
            totalCount !== null && totalCount > rows.length ? (
              <Text style={s.footer}>
                Showing {rows.length} of {totalCount}. Narrow the search to see more.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable onPress={() => open(item)} disabled={openingId === item.id}>
              {({ pressed }) => (
                <SoftCard style={[s.row, pressed && { opacity: 0.7 }]}>
                  <View style={s.rowText}>
                    <Text style={s.title} numberOfLines={1}>
                      {item.store_name ?? item.file_name}
                    </Text>
                    <Text style={s.meta} numberOfLines={1}>
                      {[item.chain, item.apple_store_id].filter(Boolean).join(" · ") || "Not recorded"}
                    </Text>
                  </View>
                  {openingId === item.id ? (
                    <ActivityIndicator color={t.primary} />
                  ) : (
                    <Text style={s.chev}>›</Text>
                  )}
                </SoftCard>
              )}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    heading: { fontSize: 26, fontWeight: "700", color: t.ink, marginHorizontal: 16, marginTop: 8 },
    searchWrap: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      margin: 16,
      marginTop: 12,
      height: 48,
      borderRadius: 24,
      backgroundColor: t.surfaceRaised,
      paddingHorizontal: 16,
      shadowColor: "#3D2E6B",
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 12,
      elevation: 3,
    },
    search: { flex: 1, fontSize: 17, color: t.ink },

    prompt: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
    promptIconWrap: {
      width: 64, height: 64, borderRadius: 32, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    promptTitle: { fontSize: 18, fontWeight: "700", color: t.ink },
    promptText: { fontSize: 14, color: t.inkSecondary, textAlign: "center", maxWidth: 260 },

    resultCount: { fontSize: 13, fontWeight: "600", color: t.inkSecondary, marginBottom: 2 },

    list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
    // No fixed row height: Dynamic Type must be able to grow these.
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
      gap: 12,
    },
    rowText: { flex: 1 },
    title: { fontSize: 17, color: t.ink },
    meta: { fontSize: 15, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    empty: { padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    footer: { padding: 16, textAlign: "center", fontSize: 13, color: t.inkMuted },
    pad: { padding: 24 },
  });
