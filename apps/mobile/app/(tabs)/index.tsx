import { useCallback, useState } from "react";
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { supabase } from "../../lib/supabase";
import { useSession } from "../../context/auth";
import { listDrafts } from "../../lib/installationReports/draftStore";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { GradientCard, SoftCard } from "../../theme/components";

/**
 * "lets create a beautiful home page after login instead directly get into
 * copilot" -- this is now the (tabs) group's "index" route, so it's what
 * opens right after sign-in. Copilot moved to copilot.tsx (still a real
 * screen, just no longer a bottom tab -- see _layout.tsx's `href: null` on
 * that Tabs.Screen) and is reached from the hero quick-action card below,
 * per the user's own call on where Copilot should live.
 *
 * Recent activity re-derives the same local-draft + server-row merge as
 * reports.tsx (see that file's header comment for the full "why check the
 * server too" reasoning) rather than importing a shared helper -- small
 * per-screen UI logic stays local in this app, same convention as
 * fetchAllRows in sales-by-rep.tsx.
 */

type ReportStatus = "local-draft" | "incomplete" | "complete";

interface RecentItem {
  id: string;
  storeName: string;
  status: ReportStatus;
  sortKey: string;
  resumable: boolean;
}

const RECENT_LIMIT = 5;
const SERVER_PAGE = 30;

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function firstName(email: string | undefined): string {
  if (!email) return "there";
  const local = email.split("@")[0] ?? "";
  const word = local.split(/[.\-_]/)[0] ?? local;
  return word ? word[0].toUpperCase() + word.slice(1) : "there";
}

function statusMeta(status: ReportStatus, t: VibrantTheme): { color: string; label: string } {
  if (status === "complete") return { color: t.success, label: "Complete" };
  if (status === "incomplete") return { color: t.danger, label: "Incomplete" };
  return { color: t.inkMuted, label: "Local draft" };
}

// `as const` keeps each `icon` a string literal (e.g. "function") rather
// than widening to `string` -- SymbolView's `name` prop is a large union of
// specific SF Symbol literals, not a plain string, so a widened type fails
// to typecheck even though every literal here is already used successfully
// as a bare string prop in _layout.tsx.
const QUICK_ACTIONS = [
  { label: "Surveys", sub: "Search & open site surveys", icon: "doc.text.magnifyingglass", route: "/surveys" },
  { label: "Sign Costing", sub: "Build a signage cost sheet", icon: "function", route: "/estimator" },
  { label: "Basil Installations", sub: "Reports & new capture", icon: "list.clipboard", route: "/reports" },
  { label: "Sales by Rep", sub: "Customer breakdown by rep", icon: "chart.line.uptrend.xyaxis", route: "/sales-by-rep" },
] as const;

export default function HomeScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { session } = useSession();

  const [items, setItems] = useState<RecentItem[] | null>(null);

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
              .limit(SERVER_PAGE)
          : { data: [] as { id: string; store_name: string; status: string; created_at: string; submitted_at: string | null }[] };
        if (cancelled) return;

        const byId = new Map<string, RecentItem>();
        for (const r of serverReports ?? []) {
          const draft = draftsById.get(r.id);
          const complete = r.status === "submitted";
          byId.set(r.id, {
            id: r.id,
            storeName: r.store_name || "Untitled report",
            status: complete ? "complete" : "incomplete",
            sortKey: r.submitted_at ?? r.created_at,
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

  const inProgress = items?.filter((i) => i.status !== "complete").length ?? 0;
  const completedThisMonth =
    items?.filter((i) => {
      if (i.status !== "complete") return false;
      const d = new Date(i.sortKey);
      const now = new Date();
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length ?? 0;
  const recent = (items ?? []).slice(0, RECENT_LIMIT);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.content}>
      <View style={s.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greeting}>
            {greeting()}, {firstName(session?.user?.email)}
          </Text>
          <Text style={s.subGreeting}>Here's what's happening today.</Text>
        </View>
        <Image source={require("../../assets/images/logo-mark.png")} style={s.logo} resizeMode="contain" />
      </View>

      <Pressable onPress={() => router.push("/copilot")}>
        <GradientCard style={s.copilotCard}>
          <View style={s.copilotIconWrap}>
            <SymbolView name="bubble.left.and.text.bubble.right" tintColor={t.onGradient} size={24} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.copilotTitle}>Ask Copilot</Text>
            <Text style={s.copilotSub}>Job orders, surveys, quick answers — just ask.</Text>
          </View>
          <Text style={s.copilotChev}>›</Text>
        </GradientCard>
      </Pressable>

      <View style={s.statRow}>
        <SoftCard style={s.statCard}>
          <Text style={s.statValue}>{items === null ? "—" : inProgress}</Text>
          <Text style={s.statLabel}>In progress</Text>
        </SoftCard>
        <SoftCard style={s.statCard}>
          <Text style={s.statValue}>{items === null ? "—" : completedThisMonth}</Text>
          <Text style={s.statLabel}>Completed this month</Text>
        </SoftCard>
      </View>

      <Text style={s.sectionTitle}>Quick actions</Text>
      <View style={s.grid}>
        {QUICK_ACTIONS.map((a) => (
          <Pressable key={a.route} style={s.gridItem} onPress={() => router.push(a.route as never)}>
            <SoftCard style={s.gridCard}>
              <View style={s.gridIconWrap}>
                <SymbolView name={a.icon} tintColor={t.primary} size={20} />
              </View>
              <Text style={s.gridLabel}>{a.label}</Text>
              <Text style={s.gridSub} numberOfLines={2}>{a.sub}</Text>
            </SoftCard>
          </Pressable>
        ))}
      </View>

      <Text style={s.sectionTitle}>Recent activity</Text>
      {items === null ? (
        <ActivityIndicator style={s.pad} color={t.primary} />
      ) : recent.length === 0 ? (
        <SoftCard style={s.emptyCard}>
          <Text style={s.emptyText}>No reports yet — start one from Basil Installations.</Text>
        </SoftCard>
      ) : (
        <View style={{ gap: 10 }}>
          {recent.map((item) => {
            const meta = statusMeta(item.status, t);
            return (
              <Pressable
                key={item.id}
                onPress={() => item.resumable && router.push(`/report/${item.id}`)}
                disabled={!item.resumable}
              >
                {({ pressed }) => (
                  <SoftCard style={[s.recentRow, pressed && item.resumable && { opacity: 0.7 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={s.recentTitle} numberOfLines={1}>{item.storeName}</Text>
                      <View style={s.statusWrap}>
                        <View style={[s.statusDot, { backgroundColor: meta.color }]} />
                        <Text style={s.statusText}>{meta.label}</Text>
                      </View>
                    </View>
                    {item.resumable && <Text style={s.recentChev}>›</Text>}
                  </SoftCard>
                )}
              </Pressable>
            );
          })}
        </View>
      )}
    </ScrollView>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    content: { padding: 16, paddingBottom: 32, gap: 14 },

    greetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    greeting: { fontSize: 26, fontWeight: "700", color: t.ink },
    subGreeting: { fontSize: 15, color: t.inkSecondary, marginTop: -8 },
    logo: { width: 40, height: 40, borderRadius: 10 },

    copilotCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16 },
    copilotIconWrap: {
      width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    },
    copilotTitle: { fontSize: 17, fontWeight: "700", color: t.onGradient },
    copilotSub: { fontSize: 13, color: t.onGradient, opacity: 0.85, marginTop: 2 },
    copilotChev: { fontSize: 22, color: t.onGradient, opacity: 0.85 },

    statRow: { flexDirection: "row", gap: 10 },
    statCard: { flex: 1, padding: 14, gap: 2 },
    statValue: { fontSize: 24, fontWeight: "700", color: t.ink },
    statLabel: { fontSize: 12, color: t.inkSecondary },

    sectionTitle: { fontSize: 15, fontWeight: "600", color: t.ink, marginTop: 4 },

    grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    gridItem: { flexBasis: "47%", flexGrow: 1 },
    gridCard: { padding: 12, gap: 4, minHeight: 96 },
    gridIconWrap: {
      width: 34, height: 34, borderRadius: 17, backgroundColor: t.primaryTint,
      alignItems: "center", justifyContent: "center", marginBottom: 2,
    },
    gridLabel: { fontSize: 14, fontWeight: "600", color: t.ink },
    gridSub: { fontSize: 12, color: t.inkSecondary },

    pad: { padding: 16 },
    emptyCard: { padding: 16 },
    emptyText: { fontSize: 14, color: t.inkMuted, textAlign: "center" },

    recentRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, minHeight: 44 },
    recentTitle: { fontSize: 15, color: t.ink },
    statusWrap: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    statusDot: { width: 8, height: 8, borderRadius: 4 },
    statusText: { fontSize: 13, color: t.inkSecondary },
    recentChev: { fontSize: 20, color: t.inkMuted },
  });
