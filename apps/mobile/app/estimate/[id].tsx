import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "../../lib/supabase";

/**
 * Read-only "bill view" for a saved Estimate Builder quote -- same
 * invoice-style treatment as app/bill.tsx (letterhead, a tinted "quote
 * details" meta card carrying the visual weight, a plain items table, an
 * unhighlighted totals footer). Reached by tapping a saved estimate in
 * (tabs)/estimate-builder.tsx, either right after saving one or from the
 * recent-estimates list -- loads by id rather than route params, since an
 * estimate needs to be re-openable later, not just viewable once
 * immediately after creation.
 */

interface EstimateRow {
  id: string;
  quote_number: string;
  job_number: string;
  status: string;
  gst_percent: number;
  subtotal: number;
  transportation_total: number;
  installation_total: number;
  taxable_total: number;
  gst_amount: number;
  grand_total: number;
  notes: string | null;
  attention_person: string | null;
  quote_subject: string | null;
  customer_address: string | null;
  customer_gstin: string | null;
  payment_terms_days: number | null;
  payment_terms_type: string | null;
  salesperson_name: string | null;
  created_at: string;
  customers: { name: string } | null;
}

interface LineItemRow {
  id: string;
  sort_order: number;
  product_name: string | null;
  design_name: string | null;
  description: string | null;
  uom: string | null;
  calc_mode: string | null;
  width_in: number | null;
  height_in: number | null;
  sqft_total: number | null;
  unit_rate: number;
  quantity: number;
  transportation_rate: number | null;
  installation_rate: number | null;
  line_total: number;
}

const MMDI = {
  legalName: "Macromedia Digital Imaging Pvt. Ltd.",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  contact: "+91 40 2726 7777 / 8888   ·   info@mmdi.in",
};

function formatISOToDMY(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}

function paymentTermsLabel(type: string | null, days: number | null): string | null {
  if (type === "net_days") return days ? `Net ${days} days` : "Net days";
  if (type === "advance") return "Advance";
  if (type === "against_delivery") return "Against delivery";
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// "when i save estimate it should be saved and create an attachment to
// send as email. thats is optional" -- a real invoice-style PDF (via
// expo-print's HTML-to-PDF), shared through the native share sheet (Mail
// is one of the targets) via expo-sharing. Kept as a plain HTML string
// here rather than reusing React Native styling -- expo-print renders
// with WebKit, so this is regular CSS, not RN StyleSheet.
function buildEstimateHtml(estimate: EstimateRow, lines: LineItemRow[], terms: string | null): string {
  const rows = lines
    .map((l) => {
      const name = [l.design_name, l.product_name || l.description].filter(Boolean).map(String).map(escapeHtml).join(" — ") || "—";
      const qtyRate = `${l.quantity} ${l.uom ?? ""} × ₹${l.unit_rate.toLocaleString("en-IN")}`;
      return `<tr><td>${name}</td><td class="num">${escapeHtml(qtyRate)}</td><td class="num">₹${l.line_total.toLocaleString("en-IN")}</td></tr>`;
    })
    .join("");
  const dateStr = formatISOToDMY(estimate.created_at);
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1a1a2e; padding: 28px; font-size: 12px; }
  .letterhead { text-align: center; border-bottom: 1px solid #ddd; padding-bottom: 10px; margin-bottom: 18px; }
  .letterhead h1 { font-size: 16px; margin: 0; }
  .letterhead p { font-size: 10px; color: #777; margin: 2px 0; }
  .meta { background: #f7f3f2; border-radius: 8px; padding: 14px; margin-bottom: 18px; }
  .meta h2 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #a33; margin: 0 0 6px; }
  .meta .name { font-size: 16px; font-weight: 700; margin: 0 0 2px; }
  .meta-row { display: flex; justify-content: space-between; font-size: 11px; padding: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th { text-align: left; font-size: 9px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ccc; padding: 5px 4px; }
  td { font-size: 11px; padding: 7px 4px; border-bottom: 1px solid #eee; vertical-align: top; }
  .num { text-align: right; }
  .totals { width: 280px; margin-left: auto; }
  .totals-row { display: flex; justify-content: space-between; font-size: 11px; padding: 3px 0; }
  .totals-final { font-size: 14px; font-weight: 700; border-top: 1px solid #ccc; margin-top: 6px; padding-top: 8px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="letterhead">
    <h1>${MMDI.legalName}</h1>
    <p>${MMDI.address}</p>
    <p>${MMDI.contact}</p>
  </div>
  <div class="meta">
    <h2>Quote For</h2>
    <p class="name">${escapeHtml(estimate.customers?.name ?? "—")}</p>
    ${estimate.customer_address ? `<p>${escapeHtml(estimate.customer_address)}</p>` : ""}
    ${estimate.customer_gstin ? `<p>GSTIN: ${escapeHtml(estimate.customer_gstin)}</p>` : ""}
    <div class="meta-row"><span>Quote No</span><b>${escapeHtml(estimate.quote_number)}</b></div>
    <div class="meta-row"><span>Date</span><b>${dateStr}</b></div>
    <div class="meta-row"><span>Job / Campaign</span><b>${escapeHtml(estimate.job_number)}</b></div>
    ${estimate.attention_person ? `<div class="meta-row"><span>Attention</span><b>${escapeHtml(estimate.attention_person)}</b></div>` : ""}
    ${estimate.quote_subject ? `<div class="meta-row"><span>Subject</span><b>${escapeHtml(estimate.quote_subject)}</b></div>` : ""}
    ${terms ? `<div class="meta-row"><span>Payment Terms</span><b>${escapeHtml(terms)}</b></div>` : ""}
  </div>
  <table>
    <thead><tr><th>Item</th><th class="num">Qty × Rate</th><th class="num">Amount</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>₹${estimate.subtotal.toLocaleString("en-IN")}</span></div>
    ${estimate.transportation_total > 0 ? `<div class="totals-row"><span>Transportation</span><span>₹${estimate.transportation_total.toLocaleString("en-IN")}</span></div>` : ""}
    ${estimate.installation_total > 0 ? `<div class="totals-row"><span>Installation</span><span>₹${estimate.installation_total.toLocaleString("en-IN")}</span></div>` : ""}
    <div class="totals-row"><span>GST (${estimate.gst_percent}%)</span><span>₹${estimate.gst_amount.toLocaleString("en-IN")}</span></div>
    <div class="totals-final"><span>Grand Total</span><span>₹${estimate.grand_total.toLocaleString("en-IN")}</span></div>
  </div>
  ${estimate.salesperson_name ? `<p style="text-align:right;font-style:italic;color:#777;">Prepared by ${escapeHtml(estimate.salesperson_name)}</p>` : ""}
  ${estimate.notes ? `<p><b>Notes:</b> ${escapeHtml(estimate.notes)}</p>` : ""}
</body>
</html>`;
}

export default function EstimateViewScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [estimate, setEstimate] = useState<EstimateRow | null | undefined>(undefined);
  const [lines, setLines] = useState<LineItemRow[]>([]);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!id) return;
      const [{ data: est }, { data: li }] = await Promise.all([
        supabase
          .from("estimates")
          .select(
            "id, quote_number, job_number, status, gst_percent, subtotal, transportation_total, installation_total, taxable_total, gst_amount, grand_total, notes, attention_person, quote_subject, customer_address, customer_gstin, payment_terms_days, payment_terms_type, salesperson_name, created_at, customers(name)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("estimate_line_items")
          .select(
            "id, sort_order, product_name, design_name, description, uom, calc_mode, width_in, height_in, sqft_total, unit_rate, quantity, transportation_rate, installation_rate, line_total"
          )
          .eq("estimate_id", id)
          .order("sort_order"),
      ]);
      if (cancelled) return;
      setEstimate((est as unknown as EstimateRow) ?? null);
      setLines((li as LineItemRow[]) ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (estimate === undefined) {
    return (
      <View style={[s.screen, s.centered]}>
        <ActivityIndicator color={t.primary} />
      </View>
    );
  }

  if (estimate === null) {
    return (
      <View style={[s.screen, s.centered]}>
        <Text style={s.empty}>Estimate not found.</Text>
        <GradientButton label="Back" onPress={() => router.back()} style={s.doneBtn} />
      </View>
    );
  }

  const terms = paymentTermsLabel(estimate.payment_terms_type, estimate.payment_terms_days);

  async function shareAsPdf() {
    if (!estimate) return;
    setShareError(null);
    setSharing(true);
    try {
      const html = buildEstimateHtml(estimate, lines, terms);
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        setShareError("Sharing isn't available on this device.");
        return;
      }
      await Sharing.shareAsync(uri, {
        mimeType: "application/pdf",
        dialogTitle: `${estimate.quote_number} — ${estimate.customers?.name ?? "Estimate"}`,
        UTI: "com.adobe.pdf",
      });
    } catch (e) {
      setShareError(e instanceof Error ? e.message : "Could not generate the PDF.");
    } finally {
      setSharing(false);
    }
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content}>
        <View style={s.letterhead}>
          <Text style={s.letterheadName}>{MMDI.legalName}</Text>
          <Text style={s.letterheadMeta}>{MMDI.address}</Text>
          <Text style={s.letterheadMeta}>{MMDI.contact}</Text>
        </View>

        <SoftCard style={s.metaCard}>
          <Text style={s.metaSectionLabel}>Quote For</Text>
          <Text style={s.customerName}>{estimate.customers?.name || "—"}</Text>
          {estimate.customer_address ? <Text style={s.address}>{estimate.customer_address}</Text> : null}
          {estimate.customer_gstin ? <Text style={s.gstin}>GSTIN: {estimate.customer_gstin}</Text> : null}

          <View style={s.metaDivider} />

          <MetaRow t={t} label="Quote No" value={estimate.quote_number} />
          <MetaRow t={t} label="Date" value={formatISOToDMY(estimate.created_at)} />
          <MetaRow t={t} label="Job / Campaign" value={estimate.job_number} />
          {estimate.attention_person ? <MetaRow t={t} label="Attention" value={estimate.attention_person} /> : null}
          {estimate.quote_subject ? <MetaRow t={t} label="Subject" value={estimate.quote_subject} /> : null}
          {terms ? <MetaRow t={t} label="Payment Terms" value={terms} /> : null}
          <MetaRow t={t} label="Status" value={estimate.status} />
        </SoftCard>

        <Text style={s.sectionTitle}>Items ({lines.length})</Text>
        <SoftCard style={s.itemsCard}>
          <View style={s.tableHeader}>
            <Text style={[s.tableHeaderText, s.colItem]}>Item</Text>
            <Text style={[s.tableHeaderText, s.colQty]}>Qty × Rate</Text>
            <Text style={[s.tableHeaderText, s.colAmt]}>Amount</Text>
          </View>
          {lines.length === 0 ? (
            <Text style={s.empty}>No line items.</Text>
          ) : (
            lines.map((line, i) => (
              <View key={line.id} style={[s.itemRow, i === lines.length - 1 && s.itemRowLast]}>
                <View style={s.colItem}>
                  <Text style={s.itemName} numberOfLines={2}>
                    {[line.design_name, line.product_name || line.description].filter(Boolean).join(" — ") || "—"}
                  </Text>
                  {line.calc_mode === "sqft" && line.width_in != null && line.height_in != null ? (
                    <Text style={s.itemSub}>{line.width_in}in × {line.height_in}in · {line.sqft_total?.toFixed(1) ?? "—"} sqft</Text>
                  ) : null}
                  {(line.transportation_rate || line.installation_rate) ? (
                    <Text style={s.itemSub}>
                      {line.transportation_rate ? `Transport ₹${line.transportation_rate.toLocaleString("en-IN")}` : ""}
                      {line.transportation_rate && line.installation_rate ? " · " : ""}
                      {line.installation_rate ? `Install ₹${line.installation_rate.toLocaleString("en-IN")}` : ""}
                    </Text>
                  ) : null}
                </View>
                <Text style={[s.itemQty, s.colQty]}>
                  {line.quantity} {line.uom || ""} × ₹{line.unit_rate.toLocaleString("en-IN")}
                </Text>
                <Text style={[s.itemValue, s.colAmt]}>₹{line.line_total.toLocaleString("en-IN")}</Text>
              </View>
            ))
          )}
        </SoftCard>

        <View style={s.totalsBlock}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Text style={s.totalsValue}>₹{estimate.subtotal.toLocaleString("en-IN")}</Text>
          </View>
          {estimate.transportation_total > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Transportation</Text>
              <Text style={s.totalsValue}>₹{estimate.transportation_total.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {estimate.installation_total > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Installation</Text>
              <Text style={s.totalsValue}>₹{estimate.installation_total.toLocaleString("en-IN")}</Text>
            </View>
          )}
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>GST ({estimate.gst_percent}%)</Text>
            <Text style={s.totalsValue}>₹{estimate.gst_amount.toLocaleString("en-IN")}</Text>
          </View>
          <View style={[s.totalsRow, s.totalsRowFinal]}>
            <Text style={s.totalsLabelFinal}>Grand Total</Text>
            <Text style={s.totalsValueFinal}>₹{estimate.grand_total.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {estimate.salesperson_name ? (
          <Text style={s.signOff}>Prepared by {estimate.salesperson_name}</Text>
        ) : null}

        {estimate.notes ? (
          <>
            <Text style={s.sectionTitle}>Notes</Text>
            <SoftCard style={s.notesCard}>
              <Text style={s.notesText}>{estimate.notes}</Text>
            </SoftCard>
          </>
        ) : null}

        {shareError ? <Text style={s.shareError}>{shareError}</Text> : null}
        <GradientButton
          label="Share as PDF"
          variant="secondary"
          onPress={shareAsPdf}
          loading={sharing}
          style={s.shareBtn}
        />
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
    centered: { alignItems: "center", justifyContent: "center", gap: 12, padding: 24 },
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
    colItem: { flex: 1.6, gap: 1 },
    colQty: { flex: 1, textAlign: "right" },
    colAmt: { flex: 1, textAlign: "right" },
    itemName: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },
    itemSub: { fontSize: 10, fontFamily: fonts.regular, color: t.inkMuted },
    itemQty: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    itemValue: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },

    totalsBlock: { paddingHorizontal: 4, gap: 4 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalsRowFinal: { marginTop: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: t.lineStrong },
    totalsLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    totalsValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },
    totalsLabelFinal: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    totalsValueFinal: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },

    signOff: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted, textAlign: "right", fontStyle: "italic" },

    notesCard: { padding: 12 },
    notesText: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, lineHeight: 17 },

    shareError: { fontSize: 12, fontFamily: fonts.regular, color: t.danger, textAlign: "center" },
    shareBtn: { marginTop: 4 },
    doneBtn: { marginTop: 4 },
  });
