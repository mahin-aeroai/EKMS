import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "@/lib/supabase";
import { fmtRupee } from "@mmdi/shared/sign-estimator/calc";

/**
 * "in my previous chat i asked to add new module cost sheet but not sign
 * costsheets. the cost sheet from tool from web app and which we build
 * costing like attached screen" -- the user's "Cost Sheet" request was
 * actually the Tools > Cost Sheet BOM+Work-Centre calculator (see
 * app/(tabs)/cost-sheets.tsx, now rebuilt as that calculator). This file
 * is what cost-sheets.tsx used to be: a browsable list of every Sign
 * Costing run this user has generated (querying `sign_estimates`, tap to
 * reopen cost-sheet/[ref]). Renamed rather than deleted so that feature
 * isn't lost -- it's a real, useful screen, just not what "Cost Sheet"
 * meant. Reached from a text link at the bottom of the new Cost Sheet
 * calculator ("View past Sign Costing sheets") and stays off the tab bar
 * (href: null in _layout.tsx) alongside Surveys/Basil Installations.
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

export default function SignCostingHistoryScreen() {
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
