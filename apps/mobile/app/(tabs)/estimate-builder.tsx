import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { radius } from "@mmdi/shared/theme";
import { vibrant, fonts, sectionLabelStyle, optionAccent, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "../../lib/supabase";

/**
 * "lets build a new module which is exist in tools/ estimate builder but
 * not sign estimater" -- mirrors apps/web/src/app/workspaces/
 * estimate-builder/page.tsx: a client-facing QUOTATION generator (pick a
 * customer, add priced line items, set GST/payment terms, save) --
 * different from Sign Costing (estimator.tsx / sign_estimates), which is
 * an internal materials/production COST calculator. The two are related
 * on web via a shared "estimate pool," but that's a separate future round.
 *
 * v1 scope, deliberately cut down from the full web feature:
 *  - Line items are custom-typed only. The web version can also pull
 *    priced rows from a customer's IKEA/Apple contract rate card, their
 *    recent purchase history, or a queued Sign Costing/Cost Sheet job via
 *    the "estimate pool" -- all three are real, separately-scoped native
 *    builds of their own, not added here.
 *  - No PDF file is generated/downloaded on-device (the web version uses
 *    pdf-lib + fontkit client-side; porting that to React Native needs its
 *    own investigation). Instead, saving an estimate opens a dedicated
 *    "bill view" screen (app/estimate/[id].tsx) styled like a real
 *    invoice -- which is what was actually asked for ("in the same way
 *    like this bill view kind of appearances").
 *  - No editing/versioning (`root_estimate_id`/version bump) -- every save
 *    is a new estimate. The web version's version-on-edit behaviour can
 *    follow in a later round if estimates need correcting after the fact.
 *  - Salesperson is a single free-typed name (web picks from `employees`,
 *    ~500 rows, via a searchable dropdown) -- designation/phone/email
 *    aren't captured here.
 *
 * Data model matches the web version exactly (two real tables, not a JSON
 * blob like sign_estimates.calc): `estimates` (header/totals) +
 * `estimate_line_items` (one row per line, FK'd to estimate_id). Quote
 * numbers come from the same Postgres RPC, `generate_quote_number(p_customer_code)`.
 *
 * GST is one flat % on (subtotal + transport + install) -- no CGST/SGST/
 * IGST split, matching the web version's own explicit, user-confirmed
 * design decision (see estimate-builder/page.tsx's header comment) --
 * this is a DIFFERENT and deliberately simpler convention than Sales by
 * Rep's Bill screen, which shows the real per-line SGST/CGST/IGST because
 * that data actually exists per-row in sales_transactions; estimates are
 * a forward-looking quote, not a completed, already-taxed sale.
 */

interface CustomerOption {
  id: string;
  code: string;
  name: string;
  address: string | null;
  gstin: string | null;
  default_attention_person: string | null;
}

type CalcMode = "nos" | "sqft";
type PaymentTermsType = "net_days" | "advance" | "against_delivery";

interface DraftLine {
  key: string;
  productName: string;
  description: string;
  calcMode: CalcMode;
  widthIn: string;
  heightIn: string;
  quantity: string;
  unitRate: string;
  transportationRate: string;
  installationRate: string;
}

interface RecentEstimate {
  id: string;
  quote_number: string;
  job_number: string;
  grand_total: number;
  created_at: string;
  customer_name: string;
}

function parseNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function computeLine(line: DraftLine) {
  const qty = parseNum(line.quantity);
  const rate = parseNum(line.unitRate);
  const transport = parseNum(line.transportationRate);
  const install = parseNum(line.installationRate);
  let sqftTotal: number | null = null;
  let subtotal: number;
  if (line.calcMode === "sqft") {
    const w = parseNum(line.widthIn);
    const h = parseNum(line.heightIn);
    sqftTotal = ((w * h) / 144) * qty;
    subtotal = sqftTotal * rate;
  } else {
    subtotal = qty * rate;
  }
  return { sqftTotal, subtotal, total: subtotal + transport + install };
}

async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const pageSize = 1000;
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await buildPage(from, from + pageSize - 1);
    if (error || !data) break;
    all.push(...data);
    if (data.length < pageSize) break;
  }
  return all;
}

// Same count-first-then-parallel-pages approach as sales-by-rep.tsx's
// fetchAllRowsParallel -- ~1,687 customers is well past a single request's
// silent server-side row cap, so this needs pagination too.
async function fetchAllRowsParallel<T>(
  getCount: () => PromiseLike<{ count: number | null; error: unknown }>,
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const pageSize = 1000;
  const { count, error: countError } = await getCount();
  if (countError || !count) return fetchAllRows(buildPage);
  const pageCount = Math.max(1, Math.ceil(count / pageSize));
  const pages = await Promise.all(
    Array.from({ length: pageCount }, (_, i) => buildPage(i * pageSize, i * pageSize + pageSize - 1))
  );
  const all: T[] = [];
  for (const { data } of pages) {
    if (data) all.push(...data);
  }
  return all;
}

export default function EstimateBuilderScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [customers, setCustomers] = useState<CustomerOption[] | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerOption | null>(null);

  const [jobNumber, setJobNumber] = useState("");
  const [attentionPerson, setAttentionPerson] = useState("");
  const [quoteSubject, setQuoteSubject] = useState("Quote for - Digital Printing Graphics");
  const [address, setAddress] = useState("");
  const [gstin, setGstin] = useState("");
  const [paymentTermsType, setPaymentTermsType] = useState<PaymentTermsType>("net_days");
  const [paymentTermsDays, setPaymentTermsDays] = useState("30");
  const [salespersonName, setSalespersonName] = useState("");
  const [notes, setNotes] = useState("");
  const [gstPercent, setGstPercent] = useState("18");

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [lineModalOpen, setLineModalOpen] = useState(false);
  const nextKey = useRef(0);
  const [draftLine, setDraftLine] = useState<DraftLine>(emptyLine());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentEstimate[] | null>(null);

  function emptyLine(): DraftLine {
    return {
      key: String(nextKey.current++),
      productName: "",
      description: "",
      calcMode: "sqft",
      widthIn: "",
      heightIn: "",
      quantity: "1",
      unitRate: "",
      transportationRate: "",
      installationRate: "",
    };
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchAllRowsParallel<{
        id: string;
        code: string;
        name: string;
        address: string | null;
        gstin: string | null;
        default_attention_person: string | null;
      }>(
        () => supabase.from("customers").select("id", { count: "exact", head: true }),
        (from, to) =>
          supabase
            .from("customers")
            .select("id, code, name, address, gstin, default_attention_person")
            .order("name")
            .range(from, to)
      );
      if (cancelled) return;
      setCustomers(all);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadRecent() {
    const { data } = await supabase
      .from("estimates")
      .select("id, quote_number, job_number, grand_total, created_at, customers(name)")
      .order("created_at", { ascending: false })
      .limit(10);
    const rows = (
      (data as { id: string; quote_number: string; job_number: string; grand_total: number; created_at: string; customers: { name: string } | null }[] | null) ?? []
    ).map((r) => ({
      id: r.id,
      quote_number: r.quote_number,
      job_number: r.job_number,
      grand_total: r.grand_total,
      created_at: r.created_at,
      customer_name: r.customers?.name ?? "—",
    }));
    setRecent(rows);
  }

  useEffect(() => {
    loadRecent();
  }, []);

  function onSelectCustomer(c: CustomerOption) {
    setSelectedCustomer(c);
    setAddress(c.address ?? "");
    setGstin(c.gstin ?? "");
    setAttentionPerson(c.default_attention_person ?? "");
    setCustomerPickerOpen(false);
    setCustomerSearch("");
  }

  function openAddLine() {
    setDraftLine(emptyLine());
    setLineModalOpen(true);
  }

  function confirmAddLine() {
    Keyboard.dismiss();
    setLines((prev) => [...prev, draftLine]);
    setLineModalOpen(false);
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  const computedLines = lines.map((l) => ({ ...l, ...computeLine(l) }));
  const subtotalSum = computedLines.reduce((sum, l) => sum + l.subtotal, 0);
  const transportSum = computedLines.reduce((sum, l) => sum + parseNum(l.transportationRate), 0);
  const installSum = computedLines.reduce((sum, l) => sum + parseNum(l.installationRate), 0);
  const taxableTotal = subtotalSum + transportSum + installSum;
  const gstPct = parseNum(gstPercent);
  const gstAmount = (taxableTotal * gstPct) / 100;
  const grandTotal = taxableTotal + gstAmount;

  const filteredCustomers = (customers ?? []).filter(
    (c) => !customerSearch.trim() || c.name.toLowerCase().includes(customerSearch.trim().toLowerCase())
  );

  async function saveEstimate() {
    setError(null);
    if (!selectedCustomer) {
      setError("Pick a customer first.");
      return;
    }
    if (!jobNumber.trim()) {
      setError("Campaign/Job#/Program is required.");
      return;
    }
    if (lines.length === 0) {
      setError("Add at least one line item.");
      return;
    }
    setSaving(true);
    try {
      const { data: quoteNumber, error: qnErr } = await supabase.rpc("generate_quote_number", {
        p_customer_code: selectedCustomer.code,
      });
      if (qnErr || !quoteNumber) {
        throw new Error(qnErr?.message ?? "Could not generate a quote number.");
      }
      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;

      const { data: estRow, error: estErr } = await supabase
        .from("estimates")
        .insert({
          quote_number: quoteNumber,
          job_number: jobNumber.trim(),
          version: 1,
          root_estimate_id: null,
          customer_id: selectedCustomer.id,
          contract_id: null,
          site_id: null,
          status: "draft",
          gst_percent: gstPct,
          subtotal: subtotalSum,
          transportation_total: transportSum,
          installation_total: installSum,
          taxable_total: taxableTotal,
          gst_amount: gstAmount,
          grand_total: grandTotal,
          notes: notes.trim() || null,
          attention_person: attentionPerson.trim() || null,
          quote_subject: quoteSubject.trim() || null,
          customer_address: address.trim() || null,
          customer_gstin: gstin.trim() || null,
          job_completion_time: null,
          delivery_commitment: null,
          payment_terms_days: paymentTermsType === "net_days" ? parseNum(paymentTermsDays) || null : null,
          payment_terms_type: paymentTermsType,
          salesperson_name: salespersonName.trim() || null,
          salesperson_designation: null,
          salesperson_phone: null,
          salesperson_email: null,
          created_by: userId,
        })
        .select("id")
        .single();
      if (estErr || !estRow) throw new Error(estErr?.message ?? "Could not save this estimate.");

      const lineRows = computedLines.map((l, i) => ({
        estimate_id: estRow.id,
        sort_order: i,
        is_contract_item: false,
        rate_card_source: null,
        product_no: null,
        product_name: l.productName.trim() || null,
        design_name: null,
        description: l.description.trim() || null,
        additional_description: null,
        uom: l.calcMode === "sqft" ? "SQFT" : "NOS",
        calc_mode: l.calcMode,
        width_cm: l.calcMode === "sqft" ? parseNum(l.widthIn) : null,
        height_cm: l.calcMode === "sqft" ? parseNum(l.heightIn) : null,
        width_in: l.calcMode === "sqft" ? parseNum(l.widthIn) : null,
        height_in: l.calcMode === "sqft" ? parseNum(l.heightIn) : null,
        sqft_total: l.sqftTotal,
        unit_rate: parseNum(l.unitRate),
        quantity: parseNum(l.quantity),
        transportation_rate: parseNum(l.transportationRate) || null,
        installation_rate: parseNum(l.installationRate) || null,
        line_subtotal: l.subtotal,
        line_total: l.total,
      }));
      const { error: liErr } = await supabase.from("estimate_line_items").insert(lineRows);
      if (liErr) throw new Error(liErr.message);

      router.push(`/estimate/${estRow.id}`);

      // Reset the form for the next quote, and refresh the recent list.
      setSelectedCustomer(null);
      setJobNumber("");
      setAttentionPerson("");
      setAddress("");
      setGstin("");
      setNotes("");
      setLines([]);
      loadRecent();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving this estimate.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={s.screen}>
      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        <Text style={s.sectionTitle}>Customer</Text>
        <Pressable style={s.pickerField} onPress={() => setCustomerPickerOpen(true)}>
          <Text style={selectedCustomer ? s.pickerText : s.pickerPlaceholder} numberOfLines={1}>
            {selectedCustomer?.name || (customers === null ? "Loading…" : "Select a customer")}
          </Text>
          <Text style={s.pickerChevron}>⌄</Text>
        </Pressable>

        {selectedCustomer && (
          <SoftCard style={s.customerCard}>
            <Text style={s.customerCardName}>{selectedCustomer.name}</Text>
            {address ? <Text style={s.customerCardMeta}>{address}</Text> : null}
            {gstin ? <Text style={s.customerCardMeta}>GSTIN: {gstin}</Text> : null}
          </SoftCard>
        )}

        <Text style={s.sectionTitle}>Quote details</Text>
        <SoftCard style={s.formCard}>
          <Field label="Campaign / Job# / Program *" value={jobNumber} onChangeText={setJobNumber} placeholder="e.g. IKEA FY26 JOB 36" t={t} />
          <Field label="Attention person" value={attentionPerson} onChangeText={setAttentionPerson} placeholder="Optional" t={t} />
          <Field label="Quote subject" value={quoteSubject} onChangeText={setQuoteSubject} t={t} />
          <Field label="Delivery address" value={address} onChangeText={setAddress} multiline t={t} />
          <Field label="Customer GSTIN" value={gstin} onChangeText={setGstin} placeholder="Optional" t={t} />
        </SoftCard>

        <Text style={s.sectionTitle}>Payment terms</Text>
        <SoftCard style={s.formCard}>
          <View style={s.segmentRow}>
            {(["net_days", "advance", "against_delivery"] as PaymentTermsType[]).map((v) => (
              <Pressable
                key={v}
                style={[s.segment, paymentTermsType === v && s.segmentActive]}
                onPress={() => setPaymentTermsType(v)}
              >
                <Text style={[s.segmentText, paymentTermsType === v && s.segmentTextActive]}>
                  {v === "net_days" ? "Net Days" : v === "advance" ? "Advance" : "Against Delivery"}
                </Text>
              </Pressable>
            ))}
          </View>
          {paymentTermsType === "net_days" && (
            <Field label="Days" value={paymentTermsDays} onChangeText={setPaymentTermsDays} keyboardType="number-pad" t={t} />
          )}
        </SoftCard>

        <View style={s.sectionHeaderRow}>
          <Text style={s.sectionTitle}>Line items ({lines.length})</Text>
          <Pressable style={s.addLineBtn} onPress={openAddLine}>
            <Text style={s.addLineBtnText}>+ Add item</Text>
          </Pressable>
        </View>

        {computedLines.length === 0 ? (
          <SoftCard style={s.emptyLinesCard}>
            <Text style={s.emptyLinesText}>No line items yet. Tap "+ Add item" to start.</Text>
          </SoftCard>
        ) : (
          <View style={{ gap: 8 }}>
            {computedLines.map((l, i) => (
              <SoftCard key={l.key} style={[s.lineRow, { borderLeftWidth: 3, borderLeftColor: optionAccent(t, i) }]}>
                <View style={s.lineRowText}>
                  <Text style={s.lineRowTitle} numberOfLines={1}>{l.productName || l.description || "Untitled item"}</Text>
                  <Text style={s.lineRowMeta}>
                    {l.calcMode === "sqft"
                      ? `${l.widthIn || 0}×${l.heightIn || 0}in × ${l.quantity || 0} = ${l.sqftTotal?.toFixed(1) ?? 0} sqft × ₹${l.unitRate || 0}`
                      : `Qty ${l.quantity || 0} × ₹${l.unitRate || 0}`}
                  </Text>
                </View>
                <View style={s.lineRowRight}>
                  <Text style={s.lineRowValue}>₹{l.total.toLocaleString("en-IN")}</Text>
                  <Pressable onPress={() => removeLine(l.key)} hitSlop={8}>
                    <Text style={s.lineRowRemove}>Remove</Text>
                  </Pressable>
                </View>
              </SoftCard>
            ))}
          </View>
        )}

        <Text style={s.sectionTitle}>GST & totals</Text>
        <SoftCard style={s.formCard}>
          <Field label="GST %" value={gstPercent} onChangeText={setGstPercent} keyboardType="decimal-pad" t={t} />
        </SoftCard>

        <View style={s.totalsCard}>
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>Subtotal</Text>
            <Text style={s.totalsValue}>₹{subtotalSum.toLocaleString("en-IN")}</Text>
          </View>
          {transportSum > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Transportation</Text>
              <Text style={s.totalsValue}>₹{transportSum.toLocaleString("en-IN")}</Text>
            </View>
          )}
          {installSum > 0 && (
            <View style={s.totalsRow}>
              <Text style={s.totalsLabel}>Installation</Text>
              <Text style={s.totalsValue}>₹{installSum.toLocaleString("en-IN")}</Text>
            </View>
          )}
          <View style={s.totalsRow}>
            <Text style={s.totalsLabel}>GST ({gstPct || 0}%)</Text>
            <Text style={s.totalsValue}>₹{gstAmount.toLocaleString("en-IN")}</Text>
          </View>
        </View>

        {/* "for grand total lets on use gradient lets use flat color like:
            #8C98B0" -- same flat treatment used everywhere else in the app;
            the understated bill-view totals style is reserved for the
            read-only estimate/[id].tsx screen, per the user's request that
            that screen specifically should read like an invoice. */}
        <View style={s.grandTotalCard}>
          <Text style={s.grandTotalLabel}>Grand Total</Text>
          <Text style={s.grandTotalValue}>₹{grandTotal.toLocaleString("en-IN")}</Text>
        </View>

        <Text style={s.sectionTitle}>Salesperson</Text>
        <SoftCard style={s.formCard}>
          <Field label="Name" value={salespersonName} onChangeText={setSalespersonName} placeholder="Optional" t={t} />
        </SoftCard>

        <Text style={s.sectionTitle}>Notes</Text>
        <SoftCard style={s.formCard}>
          <Field label="" value={notes} onChangeText={setNotes} placeholder="Optional" multiline t={t} />
        </SoftCard>

        {error ? <Text style={s.errorText}>{error}</Text> : null}

        <GradientButton label="Save estimate" onPress={saveEstimate} loading={saving} style={s.saveBtn} />

        <Text style={s.sectionTitle}>Recent estimates</Text>
        {recent === null ? (
          <ActivityIndicator color={t.primary} style={{ marginVertical: 12 }} />
        ) : recent.length === 0 ? (
          <SoftCard style={s.emptyLinesCard}>
            <Text style={s.emptyLinesText}>No estimates saved yet.</Text>
          </SoftCard>
        ) : (
          <View style={{ gap: 8 }}>
            {recent.map((r) => (
              <Pressable key={r.id} onPress={() => router.push(`/estimate/${r.id}`)}>
                {({ pressed }) => (
                  <SoftCard style={[s.lineRow, pressed && { opacity: 0.7 }]}>
                    <View style={s.lineRowText}>
                      <Text style={s.lineRowTitle} numberOfLines={1}>{r.customer_name}</Text>
                      <Text style={s.lineRowMeta}>{r.quote_number} · {r.job_number}</Text>
                    </View>
                    <Text style={s.lineRowValue}>₹{r.grand_total.toLocaleString("en-IN")}</Text>
                  </SoftCard>
                )}
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={customerPickerOpen} transparent animationType="slide" onRequestClose={() => setCustomerPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setCustomerPickerOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Customer</Text>
            <Pressable onPress={() => setCustomerPickerOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <TextInput
            style={s.customerSearchInput}
            value={customerSearch}
            onChangeText={setCustomerSearch}
            placeholder="Search customers"
            placeholderTextColor={t.inkMuted}
            autoCapitalize="words"
          />
          <FlatList
            data={filteredCustomers}
            keyExtractor={(c) => c.id}
            style={s.modalList}
            renderItem={({ item: c, index }) => (
              <Pressable
                style={[s.modalOption, { borderLeftColor: optionAccent(t, index) }, selectedCustomer?.id === c.id && s.modalOptionActive]}
                onPress={() => onSelectCustomer(c)}
              >
                <Text style={s.modalOptionText} numberOfLines={1}>{c.name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>{customers === null ? "Loading…" : "No customers found."}</Text>}
          />
        </View>
      </Modal>

      <Modal visible={lineModalOpen} transparent animationType="slide" onRequestClose={() => setLineModalOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setLineModalOpen(false)} />
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.lineModalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Add line item</Text>
            <Pressable onPress={() => setLineModalOpen(false)}><Text style={s.modalClose}>Cancel</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={s.lineModalContent} keyboardShouldPersistTaps="handled">
            <Field label="Product name" value={draftLine.productName} onChangeText={(v) => setDraftLine((d) => ({ ...d, productName: v }))} t={t} />
            <Field label="Description" value={draftLine.description} onChangeText={(v) => setDraftLine((d) => ({ ...d, description: v }))} multiline t={t} />

            <View style={s.segmentRow}>
              {(["sqft", "nos"] as CalcMode[]).map((v) => (
                <Pressable
                  key={v}
                  style={[s.segment, draftLine.calcMode === v && s.segmentActive]}
                  onPress={() => setDraftLine((d) => ({ ...d, calcMode: v }))}
                >
                  <Text style={[s.segmentText, draftLine.calcMode === v && s.segmentTextActive]}>
                    {v === "sqft" ? "SQFT" : "Nos"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {draftLine.calcMode === "sqft" && (
              <View style={s.dimRow}>
                <View style={{ flex: 1 }}>
                  <Field label="Width (in)" value={draftLine.widthIn} onChangeText={(v) => setDraftLine((d) => ({ ...d, widthIn: v }))} keyboardType="decimal-pad" t={t} />
                </View>
                <View style={{ flex: 1 }}>
                  <Field label="Height (in)" value={draftLine.heightIn} onChangeText={(v) => setDraftLine((d) => ({ ...d, heightIn: v }))} keyboardType="decimal-pad" t={t} />
                </View>
              </View>
            )}

            <Field label="Quantity" value={draftLine.quantity} onChangeText={(v) => setDraftLine((d) => ({ ...d, quantity: v }))} keyboardType="decimal-pad" t={t} />
            <Field label="Rate (per sqft or per nos)" value={draftLine.unitRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, unitRate: v }))} keyboardType="decimal-pad" t={t} />
            <Field label="Transportation (flat)" value={draftLine.transportationRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, transportationRate: v }))} keyboardType="decimal-pad" placeholder="Optional" t={t} />
            <Field label="Installation (flat)" value={draftLine.installationRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, installationRate: v }))} keyboardType="decimal-pad" placeholder="Optional" t={t} />

            <View style={s.lineModalPreview}>
              <Text style={s.lineModalPreviewLabel}>Line total</Text>
              <Text style={s.lineModalPreviewValue}>₹{computeLine(draftLine).total.toLocaleString("en-IN")}</Text>
            </View>

            <GradientButton label="Add to quote" onPress={confirmAddLine} style={{ marginTop: 4 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline, t,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "decimal-pad" | "number-pad";
  multiline?: boolean;
  t: VibrantTheme;
}) {
  const s = styles(t);
  return (
    <View style={s.field}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        style={[s.fieldInput, multiline && s.fieldInputMultiline]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={t.inkMuted}
        keyboardType={keyboardType ?? "default"}
        multiline={multiline}
      />
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    content: { padding: 16, paddingBottom: 40, gap: 10 },

    sectionTitle: { ...sectionLabelStyle(t), marginTop: 6 },
    sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 6 },

    pickerField: {
      minHeight: 44, borderRadius: 14,
      backgroundColor: t.surfaceRaised, paddingHorizontal: 16, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    },
    pickerText: { flex: 1, fontSize: 15, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 15, color: t.inkMuted },
    pickerChevron: { fontSize: 16, color: t.inkMuted },

    customerCard: { padding: 12, gap: 2 },
    customerCardName: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },
    customerCardMeta: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },

    formCard: { padding: 14, gap: 10 },
    field: { gap: 4 },
    fieldLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    fieldInput: {
      minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: t.inkMuted + "40",
      paddingHorizontal: 10, paddingVertical: 8, fontSize: 14, color: t.ink, backgroundColor: t.surfaceRaised,
    },
    fieldInputMultiline: { minHeight: 64, textAlignVertical: "top" },

    segmentRow: { flexDirection: "row", gap: 6 },
    segment: { flex: 1, minHeight: 36, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.surfaceSunken },
    segmentActive: { backgroundColor: t.primaryTint },
    segmentText: { fontSize: 12, fontFamily: fonts.medium, color: t.inkSecondary },
    segmentTextActive: { color: t.primary },

    addLineBtn: { minHeight: 32, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.md, backgroundColor: t.primaryTint },
    addLineBtnText: { fontSize: 12, fontFamily: fonts.bold, color: t.primary },

    emptyLinesCard: { padding: 16 },
    emptyLinesText: { fontSize: 13, color: t.inkMuted, textAlign: "center" },

    lineRow: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 10, padding: 12 },
    lineRowText: { flex: 1, gap: 2 },
    lineRowTitle: { fontSize: 14, fontFamily: fonts.medium, color: t.ink },
    lineRowMeta: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    lineRowRight: { alignItems: "flex-end", gap: 4 },
    lineRowValue: { fontSize: 14, fontFamily: fonts.bold, color: t.ink },
    lineRowRemove: { fontSize: 11, fontFamily: fonts.medium, color: t.danger },

    totalsCard: { paddingHorizontal: 4, gap: 4 },
    totalsRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
    totalsLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    totalsValue: { fontSize: 12, fontFamily: fonts.medium, color: t.ink },

    grandTotalCard: {
      alignItems: "center", gap: 4, paddingVertical: 18, paddingHorizontal: 18,
      backgroundColor: t.inkMuted, borderRadius: 16,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
    },
    grandTotalLabel: { fontSize: 12, fontFamily: fonts.medium, color: t.onGradient, opacity: 0.85 },
    grandTotalValue: { fontSize: 26, fontFamily: fonts.bold, color: t.onGradient, marginTop: 2 },

    errorText: { fontSize: 13, color: t.danger, textAlign: "center" },
    saveBtn: { marginTop: 4 },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "75%", paddingBottom: 24 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 15, fontWeight: "600", color: t.ink },
    modalClose: { fontSize: 15, fontWeight: "600", color: t.primary },
    modalList: { paddingHorizontal: 8 },
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderLeftWidth: 3, marginVertical: 1 },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 13, fontFamily: fonts.regular, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 14 },
    customerSearchInput: {
      minHeight: 40, marginHorizontal: 16, marginBottom: 8, borderRadius: 10,
      backgroundColor: t.surfaceSunken, paddingHorizontal: 12, fontSize: 14, color: t.ink,
    },

    lineModalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "88%" },
    lineModalContent: { padding: 16, gap: 10, paddingBottom: 32 },
    dimRow: { flexDirection: "row", gap: 10 },
    lineModalPreview: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 8, paddingHorizontal: 10, backgroundColor: t.surfaceSunken, borderRadius: 10, marginTop: 4,
    },
    lineModalPreviewLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    lineModalPreviewValue: { fontSize: 15, fontFamily: fonts.bold, color: t.ink },
  });
