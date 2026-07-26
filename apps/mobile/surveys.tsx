import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from "react-native";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "../../lib/supabase";
import { getSignedUrl } from "../../lib/copilot";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import type { ApplelfgSiteSurveyRow } from "@mmdi/shared/rows";

/**
 * Mirrors src/app/workspaces/site-surveys/page.tsx: query
 * apple_lfg_site_surveys, then hit /api/lfg-surveys/signed-url to open the PDF.
 * The route needs no changes beyond Bearer auth (see web-patch/).
 *
 * Difference from web: instead of window.open() we download to the app's cache
 * directory and hand the file to the iOS share sheet, so it can go to Files,
 * Mail, or Preview.
 */

const PAGE = 40;

export default function SurveysScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<ApplelfgSiteSurveyRow[] | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      let q = supabase
        .from("apple_lfg_site_surveys")
        .select("*", { count: "exact" })
        .order("uploaded_at", { ascending: false })
        .limit(PAGE);

      const term = query.trim();
      if (term) {
        q = q.or(
          `store_name.ilike.%${term}%,apple_store_id.ilike.%${term}%,chain.ilike.%${term}%,file_name.ilike.%${term}%`
        );
      }

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
      const target = `${FileSystem.cacheDirectory}${row.file_name}`;
      const { uri } = await FileSystem.downloadAsync(url, target);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
      }
    } finally {
      setOpeningId(null);
    }
  }, []);

  return (
    <View style={s.screen}>
      <TextInput
        style={s.search}
        value={query}
        onChangeText={setQuery}
        placeholder="Store, chain, or Apple store ID"
        placeholderTextColor={t.inkMuted}
        autoCorrect={false}
        clearButtonMode="while-editing"
      />

      {rows === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : rows.length === 0 ? (
        <Text style={s.empty}>
          {query.trim() ? "No surveys match that search." : "No surveys uploaded yet."}
        </Text>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(r) => r.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={s.sep} />}
          ListFooterComponent={
            totalCount !== null && totalCount > rows.length ? (
              <Text style={s.footer}>
                Showing {rows.length} of {totalCount}. Narrow the search to see more.
              </Text>
            ) : null
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => open(item)}
              disabled={openingId === item.id}
              style={({ pressed }) => [s.row, pressed && { backgroundColor: t.surfaceSunken }]}
            >
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
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    search: {
      margin: 16,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: t.surfaceSunken,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: t.line,
      paddingHorizontal: 12,
      fontSize: 17,
      color: t.ink,
    },
    // No fixed row height: Dynamic Type must be able to grow these.
    row: {
      flexDirection: "row",
      alignItems: "center",
      minHeight: 44,
      paddingVertical: 12,
      paddingHorizontal: 16,
      gap: 12,
    },
    rowText: { flex: 1 },
    title: { fontSize: 17, color: t.ink },
    meta: { fontSize: 15, color: t.inkSecondary, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 16 },
    empty: { padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    footer: { padding: 16, textAlign: "center", fontSize: 13, color: t.inkMuted },
    pad: { padding: 24 },
  });
