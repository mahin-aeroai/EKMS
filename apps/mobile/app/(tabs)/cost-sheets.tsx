import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import { fmtRupee } from "@mmdi/shared/sign-estimator/calc";

/**
 * "add cost sheet from tools to the menu too" -- Sign Costing's "Generate
 * Cost Sheet" button already saves a full snapshot into `sign_estimates`
 * and pushes straight to cost-sheet/[ref] (see estimator.tsx's
 * generateCostSheet and that screen's own header comment), but there was
 * no way back to a PREVIOUS cost sheet other than remembering its ref --
 * generating a new one was the only entry point. This is the missing list
 * screen: every cost sheet this user has generated, most recent first,
 * tap to reopen the exact same detail screen. Same list-screen shape as
 * reports.tsx (fetch scoped to created_by = auth.uid(), FlatList +
 * SoftCard rows, a footer action button) rather than inventing a new
 * pattern.
 */

interface CostSheetListItem {
  ref: string;
  client: string;
  category: string;
  finalAmount: number;
  createdAt: string;
}

const PAGE = 50;

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export default function CostSheetsScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [items, setItems] = useState<CostSheetListItem[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const { data: userRes } = await supabase.auth.getUser();
        const userId = userRes.user?.id;
        if (!userId) {
          if (!cancelled) setItems([]);
          return;
        }
        const { data } = await supabase
          .from("sign_estimates")
          .select("ref, client, category, final_amount, created_at")
          .eq("created_by", userId)
          .order("created_at", { ascending: false })
          .limit(PAGE);
        if (cancelled) return;
        setItems(
          (data ?? []).map((r) => ({
            ref: r.ref,
            client: r.client || "Untitled",
            category: r.category || "—",
            finalAmount: r.final_amount ?? 0,
            createdAt: r.created_at,
          }))
        );
      })();
      return () => {
        cancelled = true;
      };
    }, [])
  );

  return (
    <View style={s.screen}>
      {items === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : items.length === 0 ? (
        <Text style={s.empty}>No cost sheets yet. Generate one from Sign Costing below.</Text>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(d) => d.ref}
          contentInsetAdjustmentBehavior="automatic"
          contentContainerStyle={s.list}
          renderItem={({ item }) => (
            <Pressable onPress={() => router.push(`/cost-sheet/${item.ref}`)}>
              {({ pressed }) => (
                <SoftCard style={[s.row, pressed && { opacity: 0.7 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.title} numberOfLines={1}>{item.client}</Text>
                    <Text style={s.meta} numberOfLines={1}>
                      {item.ref} · {item.category} · {formatDate(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={s.amount}>{fmtRupee(item.finalAmount)}</Text>
                  <Text style={s.chev}>›</Text>
                </SoftCard>
              )}
            </Pressable>
          )}
        />
      )}

      <View style={s.footer}>
        <GradientButton label="+ New Cost Sheet" onPress={() => router.push("/estimator")} />
      </View>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16, gap: 10 },
    row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
    title: { fontSize: 16, color: t.ink },
    meta: { fontSize: 12, color: t.inkSecondary, marginTop: 2 },
    amount: { fontSize: 15, fontWeight: "700", color: t.ink },
    chev: { fontSize: 15, fontWeight: "600", color: t.primary },
    empty: { flex: 1, padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },
    pad: { padding: 24 },
    footer: { backgroundColor: t.surface, padding: 16 },
  });
