import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { vibrant, fonts, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientCard, GradientButton } from "../../theme/components";
import { fmtRupee } from "@mmdi/shared/sign-estimator/calc";
import { supabase } from "../../lib/supabase";

/**
 * "after genrating the cost sheet it is not showing cost sheet. make a
 * screen for it." -- Generate Cost Sheet previously just dropped a one-line
 * "Cost sheet {ref} saved." toast into the same Step 6 scroll view, with no
 * way to actually see what was generated. estimator.tsx's generateCostSheet
 * now saves a full snapshot into sign_estimates.calc (material lines incl.
 * their spec detail, overhead/labour/markup/discount, the three sell lines,
 * GST, final total + margin) and router.push()es here on success, mirroring
 * report/[id].tsx's route-per-record pattern -- this screen just reads that
 * one saved row back and renders it, no live recomputation.
 */

interface MaterialLine {
  label: string;
  detail: string;
  value: number;
}

interface CostSheetCalc {
  categoryLabel?: string;
  jobName?: string;
  dimW?: number;
  dimH?: number;
  dimUnit?: string;
  qty?: number;
  materials?: MaterialLine[];
  rawMaterialCost?: number;
  overheadPct?: number;
  overheadValue?: number;
  labour?: number;
  productionCost?: number;
  markupPct?: number;
  markupValue?: number;
  discountPct?: number;
  discountValue?: number;
  signageSell?: number;
  printSell?: number;
  installSell?: number;
  subtotal?: number;
  gstPct?: number;
  gstAmt?: number;
  finalAmount?: number;
  margin?: number;
  marginAmt?: number;
}

interface SignEstimateRow {
  ref: string;
  client: string | null;
  category: string | null;
  qty: number;
  final_amount: number;
  margin: number;
  calc: CostSheetCalc;
  created_at: string;
}

export default function CostSheetScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { ref } = useLocalSearchParams<{ ref: string }>();

  const [row, setRow] = useState<SignEstimateRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("sign_estimates")
        .select("ref, client, category, qty, final_amount, margin, calc, created_at")
        .eq("ref", ref)
        .maybeSingle();
      if (cancelled) return;
      if (err || !data) {
        setError("Couldn't load this cost sheet.");
        return;
      }
      setRow(data as SignEstimateRow);
    })();
    return () => {
      cancelled = true;
    };
  }, [ref]);

  if (error) {
    return (
      <View style={s.centerFill}>
        <Text style={s.alertText}>{error}</Text>
        <Pressable style={s.backLink} onPress={() => router.back()}>
          <Text style={s.backLinkText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  if (!row) {
    return (
      <View style={s.centerFill}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  const c = row.calc ?? {};

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <GradientCard style={s.heroCard}>
          <Text style={s.heroRef}>{row.ref}</Text>
          <Text style={s.heroClient} numberOfLines={1}>{c.jobName || row.client || "—"}</Text>
          <Text style={s.heroValue}>{fmtRupee(row.final_amount)}</Text>
          <Text style={s.heroMargin}>Gross margin {row.margin}% ({fmtRupee(c.marginAmt ?? 0)})</Text>
        </GradientCard>

        <SoftCard style={s.metaCard}>
          <MetaRow t={t} label="Category" value={c.categoryLabel || row.category || "—"} />
          <MetaRow t={t} label="Size" value={c.dimW && c.dimH ? `${c.dimW} × ${c.dimH} ${c.dimUnit ?? ""}` : "—"} />
          <MetaRow t={t} label="Quantity" value={String(c.qty ?? row.qty)} />
          <MetaRow t={t} label="Generated" value={new Date(row.created_at).toLocaleDateString("en-IN")} />
        </SoftCard>

        {c.materials && c.materials.some((m) => m.value > 0) && (
          <>
            <Text style={s.sectionTitle}>Materials</Text>
            <SoftCard style={s.summaryCard}>
              {c.materials.filter((m) => m.value > 0).map((m) => (
                <Row key={m.label} t={t} small label={m.label} detail={m.detail} value={fmtRupee(m.value)} />
              ))}
              <Row t={t} label="Raw Material Cost (per sign)" value={fmtRupee(c.rawMaterialCost ?? 0)} strong />
            </SoftCard>
          </>
        )}

        <Text style={s.sectionTitle}>Cost breakdown</Text>
        <SoftCard style={s.summaryCard}>
          <Row t={t} small label={`Overhead (${c.overheadPct ?? 0}%)`} value={fmtRupee(c.overheadValue ?? 0)} />
          <Row t={t} small label="Labour" value={fmtRupee(c.labour ?? 0)} />
          <Row t={t} label="Signage Production Cost" value={fmtRupee(c.productionCost ?? 0)} strong />
        </SoftCard>

        <Text style={s.sectionTitle}>What gets charged</Text>
        <SoftCard style={s.summaryCard}>
          <Row t={t} small label={`Markup (${c.markupPct ?? 0}%)`} value={fmtRupee(c.markupValue ?? 0)} />
          {(c.discountValue ?? 0) > 0 && <Row t={t} small label={`Discount (${c.discountPct ?? 0}%)`} value={`−${fmtRupee(c.discountValue ?? 0)}`} />}
          <Row t={t} label="Signage" value={fmtRupee(c.signageSell ?? 0)} strong />
          <Row t={t} label="Printing" value={fmtRupee(c.printSell ?? 0)} strong />
          <Row t={t} label="Installation" value={fmtRupee(c.installSell ?? 0)} strong />
          <Row t={t} label="Subtotal (ex-GST)" value={fmtRupee(c.subtotal ?? 0)} strong />
          <Row t={t} small label={`GST (${c.gstPct ?? 0}%)`} value={fmtRupee(c.gstAmt ?? 0)} />
        </SoftCard>

        <GradientButton label="Back to Sign Costing" onPress={() => router.back()} style={s.doneBtn} />
      </ScrollView>
    </View>
  );
}

function MetaRow({ t, label, value }: { t: VibrantTheme; label: string; value: string }) {
  const s = styles(t);
  return (
    <View style={s.metaRow}>
      <Text style={s.metaLabel}>{label}</Text>
      <Text style={s.metaValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

function Row({
  t, label, detail, value, strong, small,
}: { t: VibrantTheme; label: string; detail?: string; value: string; strong?: boolean; small?: boolean }) {
  const s = styles(t);
  return (
    <View style={[s.row, strong && s.rowStrong, small && s.rowSmall]}>
      <View style={s.rowLeft}>
        <Text style={[s.rowLabel, small && s.rowLabelSmall, strong && s.rowLabelStrong]}>{label}</Text>
        {detail ? <Text style={s.rowDetail}>{detail}</Text> : null}
      </View>
      <Text style={[s.rowValue, small && s.rowLabelSmall, strong && s.rowLabelStrong]}>{value}</Text>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    centerFill: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 16 },
    content: { padding: 16, paddingBottom: 32, gap: 16 },

    alertText: { fontSize: 14, color: t.danger, textAlign: "center" },
    backLink: { paddingVertical: 8, paddingHorizontal: 16 },
    backLinkText: { fontSize: 14, fontFamily: fonts.bold, color: t.primary },

    heroCard: { alignItems: "center", gap: 4, paddingVertical: 22 },
    heroRef: { fontSize: 12, fontFamily: fonts.medium, color: t.onGradient, opacity: 0.85 },
    heroClient: { fontSize: 14, fontFamily: fonts.serifBold, color: t.onGradient, marginTop: 2 },
    heroValue: { fontSize: 30, fontFamily: fonts.bold, color: t.onGradient, marginTop: 6 },
    heroMargin: { fontSize: 12, fontFamily: fonts.regular, color: t.onGradient, opacity: 0.85 },

    metaCard: { padding: 14, gap: 8 },
    metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
    metaLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    metaValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink, flexShrink: 1, textAlign: "right" },

    sectionTitle: { fontSize: 12, fontFamily: fonts.serifBold, color: t.ink, marginTop: 2 },
    summaryCard: { padding: 12, gap: 0, overflow: "hidden" },

    row: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12, paddingVertical: 9, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    rowStrong: { backgroundColor: t.surfaceSunken, marginHorizontal: -12, paddingHorizontal: 12, borderRadius: 8 },
    rowSmall: { paddingVertical: 7 },
    rowLeft: { flex: 1, gap: 2 },
    rowLabel: { fontSize: 13, fontFamily: fonts.regular, color: t.inkSecondary },
    rowLabelSmall: { fontSize: 12, color: t.inkMuted },
    rowLabelStrong: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    rowDetail: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    rowValue: { fontSize: 13, fontFamily: fonts.regular, color: t.inkSecondary, textAlign: "right" },

    doneBtn: { marginTop: 4 },
  });
