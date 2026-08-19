import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../theme/vibrant";
import { SoftCard, GradientButton } from "../theme/components";

/**
 * "lets make it like typical invocie view with header, delivery address,
 * inv number, date, campaign, line items and qty and rate value, etc. GST
 * part and total. like typical restaurant bill. with small fonts and
 * nicely laced on screen i dont want to highlite the value instead i
 * highlite invoice details."
 *
 * Followed by: "there are mistakes in the bill. chekc the ecel and correct
 * it. i need all information on the bill." -- the first version of this
 * screen used a synthetic "Bill Ref" and "GST not in source data" because
 * sales_transactions genuinely didn't have Invoice No/Campaign/GST at the
 * time. Checking the real Sales_day_book export (Bill.xlsx, then the full
 * ~9,274-row quarter file) confirmed those fields DO exist in the real
 * accounting data -- they just hadn't been imported.
 * supabase-sales-transactions-invoice-fidelity-migration.sql adds them
 * (invoice_no, campaign, place_of_supply, sgst/cgst/igst) and fixes a real
 * bug found along the way: item_description was blank for ~48.8% of rows
 * (raw-material lines like "3MM CLEAR ACRYLIC" on the Ikea India Pvt Ltd -
 * Worli bill) because the source's "Item Description" column is blank for
 * those -- the migration gap-fills from the source's "Item" column, which
 * is always populated.
 *
 * All of the above is real, backfilled data passed in via route params
 * from sales-by-rep.tsx (see groupIntoBills there) -- nothing on this
 * screen is invented or estimated.
 */

interface BillLine {
  invoice_date: string | null;
  taxable_value: number;
  item_description: string | null;
  quantity: number | null;
  rate: number | null;
  location: string | null;
  invoice_no: string | null;
  campaign: string | null;
  place_of_supply: string | null;
  sgst: number | null;
  cgst: number | null;
  igst: number | null;
  // "Sales invoice like bill still missing some product information" --
  // real column, already backfilled by the invoice-fidelity migration,
  // just never passed through to this screen before.
  hsn_sac: string | null;
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
  const {
    customerName, address, gstin, date, invoiceNo, campaign, location, placeOfSupply, total, gstAmount, lines, salesRep,
  } = useLocalSearchParams<{
    customerName?: string;
    address?: string;
    gstin?: string;
    date?: string;
    invoiceNo?: string;
    campaign?: string;
    location?: string;
    placeOfSupply?: string;
    total?: string;
    gstAmount?: string;
    lines?: string;
    salesRep?: string;
  }>();

  let items: BillLine[] = [];
  try {
    items = lines ? (JSON.parse(lines) as BillLine[]) : [];
  } catch {
    items = [];
  }

  const subtotal = Number(total ?? 0);
  const gst = Number(gstAmount ?? 0);
  const grandTotal = subtotal + gst;
  // A bill is either intra-state (CGST+SGST) or inter-state (IGST), never
  // both -- see the migration's own notes. Shown as separate labelled
  // lines like a real Indian tax invoice, not a single blended "GST" row.
  const sgstTotal = items.reduce((sum, l) => sum + (l.sgst ?? 0), 0);
  const cgstTotal = items.reduce((sum, l) => sum + (l.cgst ?? 0), 0);
  const igstTotal = items.reduce((sum, l) => sum + (l.igst ?? 0), 0);
  const gstPct = subtotal > 0 ? Math.round((gst / subtotal) * 100) : 0;

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.letterhead}>
          <Text style={s.letterheadName}>{MMDI.legalName}</Text>
          <Text style={s.letterheadMeta}>{MMDI.address}</Text>
          <Text style={s.letterheadMeta}>{MMDI.contact}</Text>
        </View>

        {/* "i dont want to highlite the value instead i highlite invoice
            details" -- this block carries the visual weight (tinted card,
            biggest text on the screen), not the total. */}
        <SoftCard style={s.metaCard}>
          <Text style={s.metaSectionLabel}>Bill To</Text>
          <Text style={s.customerName}>{customerName || "—"}</Text>
          {address ? <Text style={s.address}>{address}</Text> : null}
          {gstin ? <Text style={s.gstin}>GSTIN: {gstin}</Text> : null}

          <View style={s.metaDivider} />

          <MetaRow t={t} label="Invoice No" value={invoiceNo || "—"} />
          <MetaRow t={t} label="Date" value={formatISOToDMY(date ?? null)} />
          {salesRep ? <MetaRow t={t} label="Sales Rep" value={salesRep} /> : null}
          {campaign ? <MetaRow t={t} label="Campaign" value={campaign} /> : null}
          {location ? <MetaRow t={t} label="Location" value={location} /> : null}
          {placeOfSupply ? <MetaRow t={t} label="Place of Supply" value={placeOfSupply} /> : null}
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
                <View style={s.colItem}>
                  <Text style={s.itemName} numberOfLines={2}>{line.item_description || "Not recorded"}</Text>
                  {line.hsn_sac ? <Text style={s.itemHsn}>HSN: {line.hsn_sac}</Text> : null}
                </View>
                <Text style={[s.itemQty, s.colQty]}>
                  {line.quantity != null && line.rate != null ? `${line.quantity} × ₹${line.rate.toLocaleString("en-IN")}` : "—"}
                </Text>
                <Text style={[s.itemValue, s.colAmt]}>₹{line.taxable_value.toLocaleString("en-IN")}</Text>
              </View>
            ))
          )}
        </SoftCard>

        {/* "GST part and total. like typical restaurant bill" -- a plain,
            small, unhighlighted totals footer. Real SGST/CGST/IGST amounts
            from the database, not an invented flat rate -- see the file
            header comment. */}
        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal (Taxable Value)</Text>
            <Text style={s.totalsValue}>₹{subtotal.toLocaleString("en-IN")}</Text>
          </View>
          {sgstTotal > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>SGST</Text>
              <Text style={s.totalsValue}>₹{sgstTotal.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {cgstTotal > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>CGST</Text>
              <Text style={s.totalsValue}>₹{cgstTotal.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {igstTotal > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>IGST</Text>
              <Text style={s.totalsValue}>₹{igstTotal.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {sgstTotal === 0 && cgstTotal === 0 && igstTotal === 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>GST</Text>
              <Text style={s.totalsNote}>none recorded</Text>
            </View>
          )}
          {gst > 0 && (
            <Text style={s.totalsGstPctNote}>Effective rate ≈ {gstPct}%</Text>
          )}
          <View style={[s.totalsRow, s.totalsRowFinal]}>
            <Text style={s.totalsLabelFinal}>Total</Text>
            <Text style={s.totalsValueFinal}>₹{grandTotal.toLocaleString("en-IN")}</Text>
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
      <Text style={s.metaValue} numberOfLines={2}>{value}</Text>
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
    itemHsn: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted, marginTop: 1 },
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
    totalsGstPctNote: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted, textAlign: "right" },
    totalsLabelFinal: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    totalsValueFinal: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },

    doneBtn: { marginTop: 4 },
  });
