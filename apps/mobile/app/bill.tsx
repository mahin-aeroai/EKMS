import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../theme/vibrant";
import { SoftCard, GradientButton } from "../theme/components";

/**
 * "lets make it like typical invocie view with header, delivery address,
 * inv number, date, campaign, line items and qty and rate value, etc. GST
 * part and total. like typical restaurant bill. with small fonts and
 * nicely laced on screen i dont want to highlite the value instead i
 * highlite invoice details." -- rebuilt from the earlier plain
 * customer/total/items version into an actual invoice layout:
 *   - MMDI's own letterhead details (seller) up top, same fixed text as
 *     the web app's quotation PDF (apps/web/src/lib/estimateBuilder/pdf.ts)
 *   - "Bill To" block: customer + delivery address + GSTIN
 *   - a meta strip: Bill Ref / Date / Location -- this block (not the
 *     total) now carries the visual weight, a tinted card with slightly
 *     larger text than everything else on the screen
 *   - line items as a proper table (description / qty×rate / amount)
 *   - a plain, small, unhighlighted totals footer (Subtotal, GST, Total)
 *
 * Two honest gaps vs. a real invoice, called out rather than faked:
 *   - "inv number": sales_transactions has no invoice_number column (see
 *     PROJECT_STATUS.md's own note on what was left out of the import).
 *     `ref` below is a short, stable reference derived from customer+date
 *     (see billRef() in sales-by-rep.tsx) -- same bill always shows the
 *     same code, but it's a reference code, not a real accounting invoice
 *     number, and is labelled "Bill Ref" rather than "Invoice No" for that
 *     reason.
 *   - "campaign": no campaign column either. `location` (a real column) is
 *     the closest available field and is shown in its place, labelled
 *     "Location".
 *   - "GST part": sales_transactions has taxable_value only, no gst_percent
 *     or gst amount per line -- there's nothing to sum. The Subtotal/Total
 *     footer has a GST row reserved and labelled, with a small note that
 *     it isn't in the source data, rather than inventing a percentage.
 */

interface BillLine {
  invoice_date: string | null;
  taxable_value: number;
  item_description: string | null;
  quantity: number | null;
  rate: number | null;
  location: string | null;
}

function formatISOToDMY(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

const MMDI = {
  legalName: "Macromedia Digital Imaging Pvt. Ltd.",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  contact: "+91 40 2726 7777 / 8888   ·   info@mmdi.in",
};

export default function BillScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { customerName, address, gstin, date, location, ref, total, lines } = useLocalSearchParams<{
    customerName?: string;
    address?: string;
    gstin?: string;
    date?: string;
    location?: string;
    ref?: string;
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
        <View style={s.letterhead}>
          <Text style={s.letterheadName}>{MMDI.legalName}</Text>
          <Text style={s.letterheadMeta}>{MMDI.address}</Text>
          <Text style={s.letterheadMeta}>{MMDI.contact}</Text>
        </View>

        {/* "i dont want to highlite the value instead i highlite invoice
            details" -- this block carries the visual weight now (tinted
            card, the biggest text on the screen), not the total. */}
        <SoftCard style={s.metaCard}>
          <Text style={s.metaSectionLabel}>Bill To</Text>
          <Text style={s.customerName}>{customerName || "—"}</Text>
          {address ? <Text style={s.address}>{address}</Text> : null}
          {gstin ? <Text style={s.gstin}>GSTIN: {gstin}</Text> : null}

          <View style={s.metaDivider} />

          <MetaRow t={t} label="Bill Ref" value={ref || "—"} />
          <MetaRow t={t} label="Date" value={formatISOToDMY(date ?? null)} />
          {location ? <MetaRow t={t} label="Location" value={location} /> : null}
        </SoftCard>

        <Text style={s.sectionTitle}>Items ({items.length})</Text>
        <SoftCard style={s.itemsCard}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colItem]}>Item</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty × Rate</Text>
            <Text style={[s.tableHeaderText, s.colAmt]}>Amount</Text>
          </View>
          {items.length === 0 ? (
            <Text style={s.empty}>No line items.</Text>
          ) : (
            items.map((line, i) => (
              <View key={i} style={[s.itemRow, i === items.length - 1 && s.itemRowLast]}>
                <Text style={[s.itemName, s.colItem]} numberOfLines={2}>{line.item_description || "—"}</Text>
                <Text style={[s.itemQty, s.colQty]}>
                  {line.quantity != null && line.rate != null ? `${line.quantity} × ₹${line.rate.toLocaleString("en-IN")}` : "—"}
                </Text>
                <Text style={[s.itemValue, s.colAmt]}>₹{line.taxable_value.toLocaleString("en-IN")}</Text>
              </View>
            ))
          )}
        </SoftCard>

        {/* "GST part and total. like typical restaurant bill" -- a plain,
            small, unhighlighted totals footer instead of the old big flat
            hero card. No GST figure is invented: sales_transactions has no
            gst_percent/amount column, only taxable_value, so there's
            nothing to sum -- see the file header comment. */}
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal (Taxable Value)</Text>
            <Text style={s.totalsValue}>₹{totalValue.toLocaleString("en-IN")}</Text>
          </View>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>GST</Text>
            <Text style={s.totalsNote}>not in source data</Text>
          </View>
          <View style={[s.totalsRow, s.totalsRowFinal]}>
            <Text style={s.totalsLabelFinal}>Total</Text>
            <Text style={s.totalsValueFinal}>₹{totalValue.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        <GradientButton label="Back" onPress={() => router.back()} style={s.doneBtn} />
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

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    content: { padding: 16, paddingBottom: 32, gap: 14 },

    letterhead: { alignItems: "center", gap: 1, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    letterheadName: { fontSize: 13, fontFamily: fonts.bold, color: t.ink, textAlign: "center" },
    letterheadMeta: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted, textAlign: "center" },

    metaCard: { padding: 14, gap: 3, backgroundColor: t.surfaceSunken },
    metaSectionLabel: { ...sectionLabelStyle(t), marginBottom: 1 },
    customerName: { fontSize: 16, fontFamily: fonts.bold, color: t.ink },
    address: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, lineHeight: 16 },
    gstin: { fontSize: 11, fontFamily: fonts.medium, color: t.inkSecondary, marginTop: 2 },
    metaDivider: { height: StyleSheet.hairlineWidth, backgroundColor: t.lineStrong, marginVertical: 8 },
    metaRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 3 },
    metaLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    metaValue: { fontSize: 12, fontFamily: fonts.bold, color: t.ink, flexShrink: 1, textAlign: "right" },

    sectionTitle: { ...sectionLabelStyle(t) },
    itemsCard: { padding: 10, gap: 0, overflow: "hidden" },
    empty: { padding: 8, fontSize: 12, fontFamily: fonts.regular, color: t.inkMuted, textAlign: "center" },

    tableHeader: { flexDirection: "row", gap: 8, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.lineStrong },
    tableHeaderText: { fontSize: 10, fontFamily: fonts.bold, color: t.inkMuted, textTransform: "uppercase", letterSpacing: 0.3 },

    itemRow: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line,
    },
    itemRowLast: { borderBottomWidth: 0 },
    colItem: { flex: 1.6 },
    colQty: { flex: 1, textAlign: "right" },
    colAmt: { flex: 1, textAlign: "right" },
    itemName: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },
    itemQty: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    itemValue: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },

    // "i dont want to highlite the value" -- plain rows, no card/gradient/
    // color background, small text throughout.
    totalsBlock: { paddingHorizontal: 4, gap: 4 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalsRowFinal: { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong },
    totalsLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    totalsValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },
    totalsNote: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted, fontStyle: "italic" },
    totalsLabelFinal: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    totalsValueFinal: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },

    doneBtn: { marginTop: 4 },
  });
