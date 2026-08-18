import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../theme/vibrant";
import { SoftCard, GradientButton } from "../theme/components";

/**
 * "the detail we added in previous section is sufficient some of them
 * missing and if there are multi line items it is missing so let them
 * open in diferent screena dn show them nicely like a bill" -- Sales by
 * Rep's customer-detail sheet used to list one flat row per raw
 * sales_transactions line, which is why multi-line invoices looked like
 * several unrelated/incomplete rows. sales-by-rep.tsx now groups those
 * lines into "Bills" (same customer + invoice_date -- there's no real
 * invoice_number column, see PROJECT_STATUS.md) and pushes here with the
 * bill's line items serialized as a route param, since a Bill is an
 * ephemeral client-side grouping with no row of its own to look up by id
 * (contrast report/[id].tsx and cost-sheet/[ref].tsx, which both read a
 * real saved record back from Supabase).
 */

interface BillLine {
  invoice_date: string | null;
  taxable_value: number;
  item_description: string | null;
  quantity: number | null;
  rate: number | null;
}

function formatISOToDMY(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

export default function BillScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { customerName, address, date, total, lines } = useLocalSearchParams<{
    customerName?: string;
    address?: string;
    date?: string;
    total?: string;
    lines?: string;
  }>();

  let items: BillLine[] = [];
  try {
    items = lines ? (JSON.parse(lines) as BillLine[]) : [];
  } catch {
    items = [];
  }

  const totalValue = Number(total ?? 0);

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <SoftCard style={s.headerCard}>
          <Text style={s.customerName}>{customerName || "—"}</Text>
          {address ? <Text style={s.address}>{address}</Text> : null}
          <View style={s.headerMetaRow}>
            <Text style={s.headerMetaLabel}>Bill date</Text>
            <Text style={s.headerMetaValue}>{formatISOToDMY(date ?? null)}</Text>
          </View>
        </SoftCard>

        {/* "for grand total lets on use gradient lets use flat color like:
            #8C98B0" -- same flat treatment as every other grand-total card
            this round. */}
        <View style={s.totalCard}>
          <Text style={s.totalLabel}>Bill Total</Text>
          <Text style={s.totalValue}>₹{totalValue.toLocaleString("en-IN")}</Text>
        </View>

        <Text style={s.sectionTitle}>Items ({items.length})</Text>
        <SoftCard style={s.itemsCard}>
          {items.length === 0 ? (
            <Text style={s.empty}>No line items.</Text>
          ) : (
            items.map((line, i) => (
              <View key={i} style={[s.itemRow, i === items.length - 1 && s.itemRowLast]}>
                <View style={s.itemLeft}>
                  <Text style={s.itemName} numberOfLines={2}>{line.item_description || "—"}</Text>
                  {line.quantity != null && line.rate != null ? (
                    <Text style={s.itemMeta}>Qty {line.quantity} × ₹{line.rate.toLocaleString("en-IN")}</Text>
                  ) : null}
                </View>
                <Text style={s.itemValue}>₹{line.taxable_value.toLocaleString("en-IN")}</Text>
              </View>
            ))
          )}
        </SoftCard>

        <GradientButton label="Back" onPress={() => router.back()} style={s.doneBtn} />
      </ScrollView>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    content: { padding: 16, paddingBottom: 32, gap: 16 },

    headerCard: { padding: 16, gap: 6 },
    customerName: { fontSize: 17, fontFamily: fonts.bold, color: t.ink },
    address: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, lineHeight: 16 },
    headerMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 6, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.line },
    headerMetaLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    headerMetaValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },

    totalCard: {
      alignItems: "center", gap: 4, paddingVertical: 22, paddingHorizontal: 18,
      backgroundColor: t.inkMuted, borderRadius: 16,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
    },
    totalLabel: { fontSize: 12, fontFamily: fonts.medium, color: t.onGradient, opacity: 0.85 },
    totalValue: { fontSize: 30, fontFamily: fonts.bold, color: t.onGradient, marginTop: 4 },

    sectionTitle: { ...sectionLabelStyle(t), marginTop: 2 },
    itemsCard: { padding: 12, gap: 0, overflow: "hidden" },
    empty: { padding: 8, fontSize: 13, fontFamily: fonts.regular, color: t.inkMuted, textAlign: "center" },

    itemRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 12,
      paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line,
    },
    itemRowLast: { borderBottomWidth: 0 },
    itemLeft: { flex: 1, gap: 2 },
    itemName: { fontSize: 13, fontFamily: fonts.medium, color: t.ink },
    itemMeta: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    itemValue: { fontSize: 13, fontFamily: fonts.medium, color: t.inkSecondary },

    doneBtn: { marginTop: 4 },
  });
