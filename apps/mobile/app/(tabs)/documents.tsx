import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { supabase } from "../../lib/supabase";
import { getSignedUrl } from "../../lib/copilot";
import { themes, radius, type Theme } from "@mmdi/shared/theme";
import type { DocumentRow } from "@mmdi/shared/rows";

/**
 * Documents. Categories are fixed in the web app
 * (src/app/workspaces/documents/page.tsx) -- kept identical here rather than
 * derived, since the column is a free-text `category` with no enum behind it.
 * Note "Drawings" is a category value inside `documents`, not the separate
 * drawings table; that is deliberate in the web app and mirrored here.
 *
 * Rows without relative_path have no file attached, so there is nothing to
 * download -- they render without the chevron rather than failing on tap.
 */

const CATEGORIES = ["IKEA IWAY", "FSC COC Audit", "ISO 9001", "Statutory Documents", "Drawings", "Other"] as const;
const ALL = "All";

export default function DocumentsScreen() {
  const scheme = useColorScheme();
  const t = themes[scheme === "dark" ? "dark" : "light"];
  const s = styles(t);

  const [rows, setRows] = useState<DocumentRow[] | null>(null);
  const [filter, setFilter] = useState<string>(ALL);
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("documents")
        .select("*")
        .eq("superseded", false)
        .order("uploaded_at", { ascending: false });
      if (cancelled) return;
      setRows(error ? [] : (data as DocumentRow[]));
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const open = useCallback(async (row: DocumentRow) => {
    if (!row.relative_path) return;
    setOpening(row.id);
    try {
      const url = await getSignedUrl("knowledge", { table: "documents", path: row.relative_path });
      const name = row.file_name ?? `${row.title}.pdf`;
      const destination = new File(Paths.cache, name);
      const file = await File.downloadFileAsync(url, destination, { idempotent: true });
      if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(file.uri);
    } finally {
      setOpening(null);
    }
  }, []);

  const visible = rows?.filter((r) => filter === ALL || r.category === filter) ?? null;

  return (
    <View style={s.screen}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {[ALL, ...CATEGORIES].map((c) => (
          <Pressable key={c} onPress={() => setFilter(c)} style={[s.chip, filter === c && s.chipOn]}>
            <Text style={[s.chipText, filter === c && s.chipTextOn]}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {visible === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : visible.length === 0 ? (
        <Text style={s.empty}>No documents in this category yet.</Text>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => r.id}
          contentInsetAdjustmentBehavior="automatic"
          ItemSeparatorComponent={() => <View style={s.sep} />}
          renderItem={({ item }) => {
            const hasFile = Boolean(item.relative_path);
            return (
              <Pressable
                onPress={() => open(item)}
                disabled={!hasFile || opening === item.id}
                style={({ pressed }) => [s.row, pressed && hasFile && { backgroundColor: t.surfaceSunken }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={s.title}>{item.title}</Text>
                  {item.category ? <Text style={s.meta}>{item.category}</Text> : null}
                  {!hasFile ? <Text style={s.noFile}>No file attached</Text> : null}
                </View>
                {opening === item.id ? (
                  <ActivityIndicator color={t.primary} />
                ) : hasFile ? (
                  <Text style={s.chev}>›</Text>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = (t: Theme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    chips: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.md, borderWidth: StyleSheet.hairlineWidth, borderColor: t.line },
    chipOn: { backgroundColor: t.primary, borderColor: t.primary },
    chipText: { fontSize: 14, color: t.inkSecondary },
    chipTextOn: { color: t.onBrand },
    row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44, paddingVertical: 12, paddingHorizontal: 16 },
    title: { fontSize: 17, color: t.ink },
    meta: { fontSize: 15, color: t.inkSecondary, marginTop: 2 },
    noFile: { fontSize: 13, color: t.inkMuted, marginTop: 2 },
    chev: { fontSize: 22, color: t.inkMuted },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: t.line, marginLeft: 16 },
    empty: { padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    pad: { padding: 24 },
  });
