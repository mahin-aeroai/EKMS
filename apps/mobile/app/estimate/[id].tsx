import { useEffect, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { vibrant, fonts, sectionLabelStyle, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "../../lib/supabase";
import { CALADEA_BOLD_BASE64, CALADEA_REGULAR_BASE64 } from "../../lib/estimatePdfFonts";

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
  salesperson_designation: string | null;
  salesperson_phone: string | null;
  salesperson_email: string | null;
  job_completion_time: string | null;
  delivery_commitment: string | null;
  created_at: string;
  customers: { name: string } | null;
}

interface LineItemRow {
  id: string;
  sort_order: number;
  product_no: string | null;
  product_name: string | null;
  design_name: string | null;
  description: string | null;
  additional_description: string | null;
  uom: string | null;
  calc_mode: string | null;
  width_cm: number | null;
  height_cm: number | null;
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

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return "th";
  switch (n % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

function formatLongDate(iso: string): string {
  const d = iso ? new Date(iso) : new Date();
  const day = d.getDate();
  const month = d.toLocaleDateString("en-GB", { month: "long" });
  return `${day}${ordinal(day)} ${month}, ${d.getFullYear()}`;
}

function rupee(n: number): string {
  return n.toLocaleString("en-IN", { maximumFractionDigits: 2, minimumFractionDigits: 2 });
}

// Mirrors apps/web/src/lib/estimateBuilder/pdf.ts's getSizeUnit() exactly
// -- a mobile-built line's uom is always "SQFT"/"NOS" (see estimate-
// builder.tsx), which this always resolves to "cm" (the `u.includes("sq")`
// branch), matching how width_cm/height_cm are actually stored on save.
function getSizeUnit(uom: string | null | undefined): "cm" | "ft" | "in" {
  const u = (uom ?? "").toLowerCase().trim();
  if (!u || u.includes("sq")) return "cm";
  if (/\bft\b|feet/.test(u)) return "ft";
  if (/\bin\b|inch/.test(u)) return "in";
  return "cm";
}

const HSN_CODE_PRINTED_PRODUCTS = "4911";

// Exact wording from apps/web/src/lib/estimateBuilder/pdf.ts's BOILERPLATE
// -- "Lets create the same pdf file which we designed in web for
// estimate" -- kept byte-for-byte identical rather than paraphrased.
const BOILERPLATE = {
  priceNotes: [
    "The quoted amount is only for supply in all respects as per details given above in accordance with the BOQ items.",
    "Installation charges are included, for detailed specifications please check enclosure of BOQ sheet.",
  ],
  jobCompletionTrailer: "Any sort of delay shall be intimated accordingly the expected time for completion given may vary.",
  closing:
    "We trust our offer is in line with your requirements. Further if you may feel like, contact us for any sort of clarification or assistance required. It shall be our pleasure to fulfill your requirements in the best possible manner always.",
  thanking: "Thanking and assuring you of our best services at all the times.",
};
const DEFAULT_JOB_COMPLETION_TIME = "The overall job is expected to be completed according to the given Schedule.";
const DEFAULT_DELIVERY_COMMITMENT =
  "Same day delivery within Hyderabad city, out station deliveries based on logistics with effect from the provided conditions are true.";
const PDF_MMDI = {
  legalName: "Macromedia Digital Imaging Private Limited",
  address: "23B & 24, Phase 5, IDA – Cherlapally, Hyderabad – 500051",
  phone: "+91 40 2726 7777 / 8888",
  email: "info@mmdi.in",
  web: "www.mmdi.in",
  signOffLine: "For MACROMEDIA DIGITAL IMAGING PVT. LTD.",
};

// "when i save estimate it should be saved and create an attachment to
// send as email. thats is optional" then "Lets create the same pdf file
// which we designed in web for estimate" -- this now mirrors
// generateEstimatePdf() in apps/web/src/lib/estimateBuilder/pdf.ts
// section-for-section (Date/To/Attn/SUB/Quote No block, intro paragraph,
// full line-items table, taxable/GST/total summary line, Prices/Job
// Completion/Delivery/Payment Schedule boilerplate, Notes, closing,
// signing block) rather than the simplified single-column version this
// screen started with. Built as an HTML string for expo-print (WebKit
// rendering, regular CSS) instead of web's pdf-lib canvas approach --
// same content and layout, different rendering engine.
function buildEstimateHtml(estimate: EstimateRow, lines: LineItemRow[]): string {
  let subtotal = 0;
  let transportTotal = 0;
  let installTotal = 0;
  const rowsHtml = lines
    .map((l) => {
      const sizeUnit = getSizeUnit(l.uom);
      const base = l.calc_mode === "sqft" ? (l.sqft_total ?? 0) * l.unit_rate : l.quantity * l.unit_rate;
      const transport = l.transportation_rate ?? 0;
      const install = l.installation_rate ?? 0;
      subtotal += base;
      transportTotal += transport;
      installTotal += install;
      const amount = base + transport + install;
      const tax = (amount * estimate.gst_percent) / 100;

      const nameLine = [l.design_name, l.product_name || l.description].filter(Boolean).join(" — ") || l.product_name || "—";
      const descLine = [l.description, l.additional_description].filter(Boolean).join(" — ");
      const productLines = [nameLine, descLine, `HSN: ${HSN_CODE_PRINTED_PRODUCTS}`].filter(Boolean).map(escapeHtml).join("<br/>");

      const wh = l.width_cm != null && l.height_cm != null
        ? `${l.width_cm.toFixed(2)}${sizeUnit} × ${l.height_cm.toFixed(2)}${sizeUnit}`
        : "—";
      // Same "don't repeat the unit a second time" rule as web: a sqft
      // line's Qty column is just the bare piece count (the SQFT column
      // already carries the priced area), and a "nos" line only appends
      // its uom when that uom is a real counting unit, not a borrowed
      // cm/ft/in size unit.
      const qtyCell = l.calc_mode === "sqft" || ["cm", "ft", "in"].includes((l.uom ?? "").toLowerCase())
        ? String(l.quantity)
        : `${l.quantity} ${l.uom ?? ""}`.trim();
      const sqftCell = l.calc_mode === "sqft" ? (l.sqft_total ?? 0).toFixed(2) : "—";

      return `<tr>
        <td>${escapeHtml(l.product_no || "—")}</td>
        <td>${productLines}</td>
        <td>${escapeHtml(wh)}</td>
        <td class="num">${escapeHtml(qtyCell)}</td>
        <td class="num">${sqftCell}</td>
        <td class="num">${rupee(l.unit_rate)}</td>
        <td class="num">${rupee(base)}</td>
        <td class="num">${transport ? rupee(transport) : "—"}</td>
        <td class="num">${install ? rupee(install) : "—"}</td>
        <td class="num">${rupee(tax)}</td>
        <td class="num">${rupee(amount + tax)}</td>
      </tr>`;
    })
    .join("");

  const taxableTotal = subtotal + transportTotal + installTotal;
  const gstAmount = (taxableTotal * estimate.gst_percent) / 100;
  const grandTotal = taxableTotal + gstAmount;

  const paymentLine =
    estimate.payment_terms_type === "advance"
      ? "100% advance payment before commencement of work."
      : estimate.payment_terms_type === "against_delivery"
        ? "Payment against delivery."
        : estimate.payment_terms_days
          ? `${estimate.payment_terms_days} days from the date of supply.`
          : "To be confirmed.";

  const signatoryLines = [
    estimate.salesperson_name,
    estimate.salesperson_designation,
    estimate.salesperson_phone ? `Mobile: ${estimate.salesperson_phone}` : null,
    estimate.salesperson_email ? `Email: ${estimate.salesperson_email}` : null,
  ].filter((l): l is string => !!l);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<style>
  /* "The estimate report pdf is not matching with web pdf i need exactly
     same format and fonts and size" -- this screen previously fell back
     to Georgia/Times New Roman (whatever serif WebKit found), which reads
     visibly larger/wider than Caladea at the same nominal point size
     because of different font metrics (bigger x-height) -- so "9pt" here
     never actually looked like the web PDF's 9pt. Caladea is now embedded
     directly (base64 data URI, see ../../lib/estimatePdfFonts.ts) --
     byte-for-byte the same font file apps/web/src/lib/estimateBuilder/
     pdf.ts embeds via pdf-lib, so this is now the real same typeface, not
     an approximation, at the same sizes web already used (9pt body, 8pt
     table).
     Page-numbered running footers (web's per-page MMDI address/page-number
     strip) aren't reliably supported by WebKit's print engine behind
     expo-print/react-native's HTML->PDF path the way pdf-lib's
     page-by-page drawing lets the web version do it -- that part is
     deliberately NOT replicated here; a single closing address block sits
     at the end of the letter instead (see .footer below), same
     information, just not repeated on every page. */
  @font-face {
    font-family: "Caladea";
    font-weight: 400;
    src: url(data:font/ttf;base64,${CALADEA_REGULAR_BASE64}) format("truetype");
  }
  @font-face {
    font-family: "Caladea";
    font-weight: 700;
    src: url(data:font/ttf;base64,${CALADEA_BOLD_BASE64}) format("truetype");
  }
  @page { size: A4; margin: 20mm; }
  body { font-family: "Caladea", Georgia, serif; color: #14161c; font-size: 9pt; line-height: 1.45; }
  p { margin: 0 0 9pt; }
  b { font-weight: 700; }
  table { width: 100%; border-collapse: collapse; margin: 10pt 0 12pt; table-layout: fixed; }
  th, td { border: 0.5pt solid #ccced1; padding: 4pt 3pt; font-size: 8pt; vertical-align: top; word-wrap: break-word; }
  th { background: #f0f1f3; text-align: left; font-weight: 700; }
  td.num, th.num { text-align: right; }
  tr.totals td { font-weight: 700; }
  .bullets { margin: 0 0 6pt; padding: 0; list-style: none; }
  .bullets li { margin-bottom: 3pt; }
  h3 { font-size: 9pt; margin: 10pt 0 4pt; }
  .summary { margin: 4pt 0 14pt; }
  .summary b { font-size: 9pt; }
  .signoff { margin-top: 22pt; }
  .footer { margin-top: 24pt; padding-top: 8pt; border-top: 0.5pt solid #ccced1; font-size: 7.5pt; color: #6b6f78; }
  .footer p { margin: 0 0 2pt; }
</style>
</head>
<body>
  <p>Date: ${formatLongDate(estimate.created_at)}</p>

  <p>
    To,<br/>
    <b>${escapeHtml(estimate.customers?.name ?? "—")}</b><br/>
    ${estimate.customer_address ? `${escapeHtml(estimate.customer_address)}<br/>` : ""}
    ${estimate.customer_gstin ? `GST: ${escapeHtml(estimate.customer_gstin)}<br/>` : ""}
  </p>

  <p>
    Dear Sir/Madam,<br/><br/>
    ${estimate.attention_person ? `<b>Attn: ${escapeHtml(estimate.attention_person)},</b><br/>` : ""}
    ${estimate.quote_subject ? `<b>SUB: ${escapeHtml(estimate.quote_subject)}</b><br/>` : ""}
    <b>Quote No.: ${escapeHtml(estimate.quote_number)} (Version 1)</b><br/>
    <b>Campaign/Job#/Program: ${escapeHtml(estimate.job_number)}</b>
  </p>

  <p>With reference to the above subject requirement, we hereby feel pleasure in submitting our proposal for the supply of the below items as per the given specifications. Please find below quote for your kind approval.</p>

  <table>
    <colgroup>
      <col style="width:15mm" /><col style="width:33mm" /><col style="width:17mm" />
      <col style="width:8mm" /><col style="width:12mm" /><col style="width:12mm" />
      <col style="width:13mm" /><col style="width:13mm" /><col style="width:12mm" />
      <col style="width:12mm" /><col style="width:23mm" />
    </colgroup>
    <thead>
      <tr>
        <th>Product No.</th>
        <th>Design / Product</th>
        <th>W × H</th>
        <th class="num">Qty</th>
        <th class="num">SQFT</th>
        <th class="num">Rate</th>
        <th class="num">Amount</th>
        <th class="num">Shipping</th>
        <th class="num">Instl.</th>
        <th class="num">GST @${estimate.gst_percent}%</th>
        <th class="num">Grand Total</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHtml}
      <tr class="totals">
        <td></td><td></td><td></td><td></td><td></td>
        <td class="num">Totals</td>
        <td class="num">${rupee(subtotal)}</td>
        <td class="num">${rupee(transportTotal)}</td>
        <td class="num">${rupee(installTotal)}</td>
        <td class="num">${rupee(gstAmount)}</td>
        <td class="num">${rupee(grandTotal)}</td>
      </tr>
    </tbody>
  </table>

  <p class="summary">Total Taxable Value (INR): ${rupee(taxableTotal)} &nbsp;&nbsp;&nbsp; GST @${estimate.gst_percent}% (INR): ${rupee(gstAmount)} &nbsp;&nbsp;&nbsp; <b>Total Value (INR): ${rupee(grandTotal)}</b></p>

  <h3>Prices:</h3>
  <ul class="bullets">
    ${BOILERPLATE.priceNotes.map((n) => `<li>•&nbsp; ${escapeHtml(n)}</li>`).join("")}
  </ul>

  <h3>JOB Completion Time:</h3>
  <p>${escapeHtml(estimate.job_completion_time || DEFAULT_JOB_COMPLETION_TIME)} ${escapeHtml(BOILERPLATE.jobCompletionTrailer)}</p>

  <h3>Delivery time:</h3>
  <p>${escapeHtml(estimate.delivery_commitment || DEFAULT_DELIVERY_COMMITMENT)}</p>

  <h3>Payment Schedule:</h3>
  <p>${escapeHtml(paymentLine)}</p>

  ${estimate.notes ? `<h3>Notes:</h3><p>${escapeHtml(estimate.notes)}</p>` : ""}

  <p>${escapeHtml(BOILERPLATE.closing)}</p>
  <p>${escapeHtml(BOILERPLATE.thanking)}</p>

  <div class="signoff">
    <p><b>${escapeHtml(PDF_MMDI.signOffLine)}</b></p>
    ${signatoryLines.map((l) => `<p style="margin:0 0 2pt;">${escapeHtml(l)}</p>`).join("")}
  </div>

  <div class="footer">
    <p>${escapeHtml(PDF_MMDI.legalName)}, ${escapeHtml(PDF_MMDI.address)}</p>
    <p>Ph.: ${escapeHtml(PDF_MMDI.phone)}   |   ${escapeHtml(PDF_MMDI.email)}   |   ${escapeHtml(PDF_MMDI.web)}</p>
    <p>${escapeHtml(estimate.quote_number)}</p>
  </div>
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
            "id, quote_number, job_number, status, gst_percent, subtotal, transportation_total, installation_total, taxable_total, gst_amount, grand_total, notes, attention_person, quote_subject, customer_address, customer_gstin, payment_terms_days, payment_terms_type, salesperson_name, salesperson_designation, salesperson_phone, salesperson_email, job_completion_time, delivery_commitment, created_at, customers(name)"
          )
          .eq("id", id)
          .maybeSingle(),
        supabase
          .from("estimate_line_items")
          .select(
            "id, sort_order, product_no, product_name, design_name, description, additional_description, uom, calc_mode, width_cm, height_cm, width_in, height_in, sqft_total, unit_rate, quantity, transportation_rate, installation_rate, line_total"
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
      const html = buildEstimateHtml(estimate, lines);
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
                    <Text style={s.itemSub}>{line.width_in.toFixed(2)}in × {line.height_in.toFixed(2)}in · {line.sqft_total?.toFixed(2) ?? "—"} sqft</Text>
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
                  {/* "check in Qty it is showing as 1SQFt which is wrong.
                      it shuld be like 620 sqft" -- the piece count (2, 5)
                      read as a sqft amount next to "SQFT"; a sqft-priced
                      line shows its actual billed sqft here instead,
                      matching web's own SQFT column. */}
                  {line.calc_mode === "sqft"
                    ? `${(line.sqft_total ?? 0).toFixed(2)} sqft`
                    : `${line.quantity} ${line.uom || ""}`.trim()}
                  {" × ₹"}{line.unit_rate.toLocaleString("en-IN")}
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
