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
 * an internal materials/production COST calculator.
 *
 * "when i add line item to the estimate i wanted have this 4 options" --
 * the Add Item modal mirrors web's 4-source picker (tables/mapping
 * confirmed by reading page.tsx directly):
 *  - From contract catalog: hardcoded to two literal customers (name
 *    contains "ikea"/"apple", same substring check as web).
 *  - From recent purchases: sales_transactions filtered by customer_id,
 *    collapsed client-side to one row per item_code (latest wins).
 *  - Non-contract / unlisted product: manual-entry form.
 *  - From estimate pool: estimate_pool_items where status='available' --
 *    populated by web's Sign Estimator/Cost Sheet "Add to Pool" action.
 *
 * "Lets add design/creative detail" -- `designName` is now a real,
 * editable field (was already a DB column and part of the save mapping,
 * just never exposed in the UI) -- shown for every source, since a
 * design/creative name is independent of where the product itself came
 * from.
 *
 * "when i select from contract item ... the menu still appears and i am
 * unable to identify it is already selected" -- once a pick is made on
 * the Contract/Recent/Pool tabs, the search box + result list are hidden
 * in favour of a single "Selected" card with a "Change" action, instead
 * of leaving the full list open with no visual selected-state.
 *
 * "against deliver does not align in box properly" -- the shared
 * `segment`/`segmentText` styles (used by payment terms, calc mode, sqft
 * entry mode, and now dim units) switched from a fixed minHeight to
 * auto-height + centered text, so a longer label like "Against Delivery"
 * wraps to two lines cleanly instead of clipping/overflowing a fixed box.
 *
 * "when i choose by dimension i need to have centimeters/mm/feet too as
 * option" -- `dimUnit` (in/cm/mm/ft) is now picked alongside Width/
 * Height. Internally converted to inches for the sqft math (matches web's
 * widthIn()/heightIn()) and to centimeters for width_cm/height_cm (the
 * columns web's own getSizeUnit() reads back as centimeters by default --
 * see pdf.ts) -- so an estimate built on mobile in any unit still reads
 * correctly if someone later opens it on web.
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
type SqftEntryMode = "dims" | "bulk";
type DimUnit = "in" | "cm" | "mm" | "ft";
type DraftSource = "contract" | "history" | "custom" | "pool";
type PaymentTermsType = "net_days" | "advance" | "against_delivery";

interface DraftLine {
  key: string;
  source: DraftSource;
  isContractItem: boolean;
  rateCardSource: string | null;
  poolItemId: string | null;
  productNo: string;
  productName: string;
  designName: string;
  description: string;
  additionalDescription: string;
  calcMode: CalcMode;
  sqftEntryMode: SqftEntryMode;
  dimUnit: DimUnit;
  width: string;
  height: string;
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

interface IkeaRateCardRow {
  sl_no: number | null;
  scope: string | null;
  material_category: string | null;
  product: string;
  description: string | null;
  uom: string | null;
  revised_rate: number;
  remarks: string | null;
}

interface AppleRateCardRow {
  sku_id: string;
  sku_description: string | null;
  category: string | null;
  program: string | null;
  substrate: string | null;
  unit: string | null;
  bill_rate: number;
  rate_inr_each: number | null;
  start_date: string | null;
  end_date: string | null;
  sqft: number | null;
}

interface HistorySaleRow {
  item_code: string | null;
  item_description: string | null;
  product_category: string | null;
  rate: number | null;
  invoice_date: string | null;
}

interface HistoryProduct {
  key: string;
  itemCode: string | null;
  itemDescription: string | null;
  productCategory: string | null;
  latestRate: number;
  latestDate: string | null;
  timesPurchased: number;
}

interface EstimatePoolItem {
  id: string;
  source: "sign_estimator" | "cost_sheet" | string;
  source_ref_id: string | null;
  label: string;
  sell_amount: number;
  cost_amount: number | null;
  summary: Record<string, unknown> | null;
  status: string;
  used_in_estimate_id: string | null;
  created_at: string;
}

function parseNum(s: string): number {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

function inferCalcMode(uom: string | null | undefined): CalcMode {
  if (uom && /nos|qty|each|pc|piece/i.test(uom)) return "nos";
  return "sqft";
}

// See file header note -- mirrors web's widthIn()/heightIn() (inches, for
// the actual sqft math) and getSizeUnit()'s cm default (for width_cm/
// height_cm, the columns web reads back).
function toInches(v: number, u: DimUnit): number {
  switch (u) {
    case "cm": return v / 2.54;
    case "mm": return v / 25.4;
    case "ft": return v * 12;
    default: return v;
  }
}
function toCm(v: number, u: DimUnit): number {
  switch (u) {
    case "in": return v * 2.54;
    case "mm": return v / 10;
    case "ft": return v * 30.48;
    default: return v;
  }
}

function computeLine(line: DraftLine) {
  const qty = parseNum(line.quantity);
  const rate = parseNum(line.unitRate);
  const transport = parseNum(line.transportationRate);
  const install = parseNum(line.installationRate);
  let sqftTotal: number | null = null;
  let subtotal: number;
  if (line.calcMode === "sqft") {
    if (line.sqftEntryMode === "bulk") {
      // Quantity field IS the sqft total directly -- used for rate-card
      // rows and pool items that carry no per-piece dimensions.
      sqftTotal = qty;
      subtotal = sqftTotal * rate;
    } else {
      const wIn = toInches(parseNum(line.width), line.dimUnit);
      const hIn = toInches(parseNum(line.height), line.dimUnit);
      sqftTotal = ((wIn * hIn) / 144) * qty;
      subtotal = sqftTotal * rate;
    }
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

const PICKER_RESULT_CAP = 30;

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
  const [pendingExtraLine, setPendingExtraLine] = useState<DraftLine | null>(null);
  const [usedPoolItemIds, setUsedPoolItemIds] = useState<Set<string>>(new Set());

  const [activeTab, setActiveTab] = useState<DraftSource>("custom");
  const [pickerSearch, setPickerSearch] = useState("");
  const [ikeaRows, setIkeaRows] = useState<IkeaRateCardRow[] | null>(null);
  const [appleRows, setAppleRows] = useState<AppleRateCardRow[] | null>(null);
  const [historyProducts, setHistoryProducts] = useState<HistoryProduct[] | null>(null);
  const [poolRows, setPoolRows] = useState<EstimatePoolItem[] | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [recent, setRecent] = useState<RecentEstimate[] | null>(null);

  function emptyLine(): DraftLine {
    return {
      key: String(nextKey.current++),
      source: "custom",
      isContractItem: false,
      rateCardSource: null,
      poolItemId: null,
      productNo: "",
      productName: "",
      designName: "",
      description: "",
      additionalDescription: "",
      calcMode: "sqft",
      sqftEntryMode: "dims",
      dimUnit: "in",
      width: "",
      height: "",
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

  async function loadPool() {
    const { data } = await supabase
      .from("estimate_pool_items")
      .select("id, source, source_ref_id, label, sell_amount, cost_amount, summary, status, used_in_estimate_id, created_at")
      .eq("status", "available")
      .order("created_at", { ascending: false });
    setPoolRows((data as EstimatePoolItem[] | null) ?? []);
  }

  useEffect(() => {
    loadPool();
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

  // Contract-catalog / history datasets are customer-specific -- clear
  // them whenever the customer changes so a stale list from a previous
  // pick doesn't leak into the next one.
  useEffect(() => {
    setIkeaRows(null);
    setAppleRows(null);
    setHistoryProducts(null);
  }, [selectedCustomer?.id]);

  const isIkea = !!selectedCustomer?.name?.toLowerCase().includes("ikea");
  const isApple = !!selectedCustomer?.name?.toLowerCase().includes("apple");

  useEffect(() => {
    if (!lineModalOpen || activeTab !== "contract" || !selectedCustomer) return;
    if (isIkea && ikeaRows === null) {
      supabase
        .from("ikea_rate_card")
        .select("sl_no, scope, material_category, product, description, uom, revised_rate, remarks")
        .order("product")
        .limit(2000)
        .then(({ data }) => setIkeaRows((data as IkeaRateCardRow[] | null) ?? []));
    }
    if (isApple && appleRows === null) {
      supabase
        .from("apple_rate_card")
        .select("sku_id, sku_description, category, program, substrate, unit, bill_rate, rate_inr_each, start_date, end_date, sqft")
        .order("sku_id")
        .limit(2000)
        .then(({ data }) => setAppleRows((data as AppleRateCardRow[] | null) ?? []));
    }
  }, [lineModalOpen, activeTab, selectedCustomer, isIkea, isApple, ikeaRows, appleRows]);

  useEffect(() => {
    if (!lineModalOpen || activeTab !== "history" || !selectedCustomer || historyProducts !== null) return;
    (async () => {
      const rows = await fetchAllRows<HistorySaleRow>((from, to) =>
        supabase
          .from("sales_transactions")
          .select("item_code, item_description, product_category, rate, invoice_date")
          .eq("customer_id", selectedCustomer.id)
          .range(from, to)
      );
      const sorted = rows
        .slice()
        .sort((a, b) => (b.invoice_date ?? "").localeCompare(a.invoice_date ?? ""));
      const byKey = new Map<string, HistoryProduct>();
      for (const r of sorted) {
        const key = r.item_code ?? r.item_description ?? "";
        if (!key) continue;
        const existing = byKey.get(key);
        if (existing) {
          existing.timesPurchased += 1;
        } else {
          byKey.set(key, {
            key,
            itemCode: r.item_code,
            itemDescription: r.item_description,
            productCategory: r.product_category,
            latestRate: r.rate ?? 0,
            latestDate: r.invoice_date,
            timesPurchased: 1,
          });
        }
      }
      const list = Array.from(byKey.values()).sort((a, b) => (b.latestDate ?? "").localeCompare(a.latestDate ?? ""));
      setHistoryProducts(list);
    })();
  }, [lineModalOpen, activeTab, selectedCustomer, historyProducts]);

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
    setPendingExtraLine(null);
    setActiveTab("custom");
    setPickerSearch("");
    setLineModalOpen(true);
  }

  function pickIkeaRow(row: IkeaRateCardRow) {
    setDraftLine((d) => ({
      ...d,
      source: "contract",
      isContractItem: true,
      rateCardSource: "ikea_rate_card",
      productNo: String(row.sl_no ?? ""),
      productName: row.product,
      description: row.description ?? "",
      calcMode: inferCalcMode(row.uom),
      sqftEntryMode: "bulk",
      unitRate: String(row.revised_rate),
    }));
    setPendingExtraLine(null);
  }

  function pickAppleRow(row: AppleRateCardRow) {
    setDraftLine((d) => ({
      ...d,
      source: "contract",
      isContractItem: true,
      rateCardSource: "apple_rate_card",
      productNo: row.sku_id,
      productName: row.sku_description || row.sku_id,
      description: [row.category, row.program, row.substrate].filter(Boolean).join(" / "),
      calcMode: inferCalcMode(row.unit),
      sqftEntryMode: "bulk",
      unitRate: String(row.rate_inr_each ?? row.bill_rate),
    }));
    setPendingExtraLine(null);
  }

  function pickHistoryProduct(p: HistoryProduct) {
    setDraftLine((d) => ({
      ...d,
      source: "history",
      isContractItem: false,
      rateCardSource: null,
      productNo: p.itemCode ?? "",
      productName: p.itemDescription || p.itemCode || "",
      description: p.productCategory ?? "",
      unitRate: String(p.latestRate),
    }));
    setPendingExtraLine(null);
  }

  function pickPoolRow(row: EstimatePoolItem) {
    const sum = (row.summary ?? {}) as Record<string, unknown>;
    const num = (k: string) => (typeof sum[k] === "number" ? (sum[k] as number) : null);
    const str = (k: string) => (typeof sum[k] === "string" ? (sum[k] as string) : null);

    if (row.source === "cost_sheet" && num("width") != null && num("height") != null) {
      const materials = Array.isArray(sum.materials) ? (sum.materials as unknown[]).filter((m) => typeof m === "string").join(", ") : null;
      // Web maps Cost Sheet's own "INC"/other uom the same way -- see this
      // file's header note.
      const dimUnit: DimUnit = str("uom") === "INC" ? "in" : "ft";
      setDraftLine((d) => ({
        ...d,
        source: "pool",
        isContractItem: false,
        rateCardSource: null,
        poolItemId: row.id,
        productName: row.label,
        description: [str("description"), materials].filter(Boolean).join(" — "),
        calcMode: "sqft",
        sqftEntryMode: "dims",
        dimUnit,
        width: String(num("width")),
        height: String(num("height")),
        quantity: num("qty") != null ? String(num("qty")) : "1",
        unitRate: num("unitRatePerSqft") != null ? String(num("unitRatePerSqft")) : String(row.sell_amount),
      }));
      setPendingExtraLine(null);
      return;
    }

    if (row.source === "sign_estimator") {
      const qty = num("qty") || 1;
      const signageSell = num("signageSell") ?? row.sell_amount;
      setDraftLine((d) => ({
        ...d,
        source: "pool",
        isContractItem: false,
        rateCardSource: null,
        poolItemId: row.id,
        productName: row.label,
        description: str("categoryLabel") ?? str("category") ?? "",
        calcMode: "nos",
        sqftEntryMode: "dims",
        width: "",
        height: "",
        quantity: String(qty),
        unitRate: String(Math.round(signageSell / qty)),
        transportationRate: num("shipping") != null ? String(num("shipping")) : "",
        installationRate: num("installSell") != null ? String(num("installSell")) : "",
      }));
      const printSell = num("printSell");
      if (printSell) {
        const printSqFt = num("printSqFt");
        const printRate = num("printRatePerSqft");
        setPendingExtraLine({
          ...emptyLine(),
          source: "pool",
          poolItemId: row.id,
          productName: `${row.label} — Printing`,
          calcMode: "sqft",
          sqftEntryMode: "bulk",
          quantity: printSqFt != null ? String(printSqFt) : "1",
          unitRate: printSqFt != null && printRate != null ? String(printRate) : String(printSell),
        });
      } else {
        setPendingExtraLine(null);
      }
      return;
    }

    // Fallback for any pool row shape that doesn't match the two known
    // sources -- matches web's own fallback branch.
    setDraftLine((d) => ({
      ...d,
      source: "pool",
      isContractItem: false,
      rateCardSource: null,
      poolItemId: row.id,
      productName: row.label,
      calcMode: "nos",
      sqftEntryMode: "dims",
      quantity: "1",
      unitRate: String(row.sell_amount ?? 0),
    }));
    setPendingExtraLine(null);
  }

  function clearPick() {
    setDraftLine((d) => ({
      ...d,
      productNo: "",
      productName: "",
      description: "",
      isContractItem: false,
      rateCardSource: null,
      poolItemId: null,
    }));
    setPendingExtraLine(null);
  }

  function confirmAddLine() {
    Keyboard.dismiss();
    setLines((prev) => {
      const next = [...prev, draftLine];
      if (pendingExtraLine) next.push(pendingExtraLine);
      return next;
    });
    if (draftLine.poolItemId) {
      setUsedPoolItemIds((prev) => new Set(prev).add(draftLine.poolItemId as string));
    }
    setPendingExtraLine(null);
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

  const searchLower = pickerSearch.trim().toLowerCase();
  const filteredIkea = (ikeaRows ?? [])
    .filter((r) => !searchLower || r.product.toLowerCase().includes(searchLower))
    .slice(0, PICKER_RESULT_CAP);
  const filteredApple = (appleRows ?? [])
    .filter((r) => !searchLower || (r.sku_description ?? r.sku_id).toLowerCase().includes(searchLower))
    .slice(0, PICKER_RESULT_CAP);
  const filteredHistory = (historyProducts ?? [])
    .filter((p) => !searchLower || (p.itemDescription ?? p.itemCode ?? "").toLowerCase().includes(searchLower))
    .slice(0, PICKER_RESULT_CAP);
  const filteredPool = (poolRows ?? []).filter((p) => !searchLower || p.label.toLowerCase().includes(searchLower));

  // Once a pick is made on a non-custom tab, hide the search/list in
  // favour of a single unambiguous "Selected" card -- see file header note.
  const hasPick = draftLine.source === activeTab && draftLine.productName !== "";

  const primaryCalc = computeLine(draftLine);
  const extraCalc = pendingExtraLine ? computeLine(pendingExtraLine) : null;
  const previewTotal = primaryCalc.total + (extraCalc?.total ?? 0);

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
        is_contract_item: l.isContractItem,
        rate_card_source: l.rateCardSource,
        product_no: l.productNo.trim() || null,
        product_name: l.productName.trim() || null,
        design_name: l.designName.trim() || null,
        description: l.description.trim() || null,
        additional_description: l.additionalDescription.trim() || null,
        uom: l.calcMode === "sqft" ? "SQFT" : "NOS",
        calc_mode: l.calcMode,
        width_cm: l.calcMode === "sqft" && l.sqftEntryMode === "dims" ? toCm(parseNum(l.width), l.dimUnit) : null,
        height_cm: l.calcMode === "sqft" && l.sqftEntryMode === "dims" ? toCm(parseNum(l.height), l.dimUnit) : null,
        width_in: l.calcMode === "sqft" && l.sqftEntryMode === "dims" ? toInches(parseNum(l.width), l.dimUnit) : null,
        height_in: l.calcMode === "sqft" && l.sqftEntryMode === "dims" ? toInches(parseNum(l.height), l.dimUnit) : null,
        sqft_total: l.sqftTotal,
        unit_rate: parseNum(l.unitRate),
        quantity: parseNum(l.quantity),
        // NOT NULL columns on estimate_line_items -- default to 0, not
        // null, when the field is left blank (matches web's own draft
        // default of 0 rather than an omitted/null value).
        transportation_rate: parseNum(l.transportationRate),
        installation_rate: parseNum(l.installationRate),
        line_subtotal: l.subtotal,
        line_total: l.total,
      }));
      const { error: liErr } = await supabase.from("estimate_line_items").insert(lineRows);
      if (liErr) throw new Error(liErr.message);

      if (usedPoolItemIds.size > 0) {
        // Best-effort, isolated from the main flow -- matches web: a
        // failure here shouldn't undo an otherwise-successful save.
        try {
          await supabase
            .from("estimate_pool_items")
            .update({ status: "used", used_in_estimate_id: estRow.id })
            .in("id", Array.from(usedPoolItemIds));
        } catch {
          // ignore
        }
        setUsedPoolItemIds(new Set());
        loadPool();
      }

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
                  <Text style={s.lineRowTitle} numberOfLines={1}>
                    {[l.designName, l.productName || l.description].filter(Boolean).join(" — ") || "Untitled item"}
                  </Text>
                  <Text style={s.lineRowMeta}>
                    {l.calcMode === "sqft"
                      ? l.sqftEntryMode === "bulk"
                        ? `${l.quantity || 0} sqft × ₹${l.unitRate || 0}`
                        : `${l.width || 0}×${l.height || 0}${l.dimUnit} × ${l.quantity || 0} = ${l.sqftTotal?.toFixed(1) ?? 0} sqft × ₹${l.unitRate || 0}`
                      : `Qty ${l.quantity || 0} × ₹${l.unitRate || 0}`}
                  </Text>
                  {l.source !== "custom" && (
                    <Text style={s.lineRowSource}>
                      {l.source === "contract" ? "Contract catalog" : l.source === "history" ? "Recent purchase" : "Estimate pool"}
                    </Text>
                  )}
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

          <View style={s.sourceTabRow}>
            {([
              ["contract", "Contract"],
              ["history", "Recent"],
              ["custom", "Custom"],
              ["pool", `Pool${poolRows && poolRows.length > 0 ? ` (${poolRows.length})` : ""}`],
            ] as [DraftSource, string][]).map(([tab, label]) => (
              <Pressable
                key={tab}
                style={[s.sourceTab, activeTab === tab && s.sourceTabActive]}
                onPress={() => {
                  setActiveTab(tab);
                  setPickerSearch("");
                }}
              >
                <Text style={[s.sourceTabText, activeTab === tab && s.sourceTabTextActive]} numberOfLines={1}>{label}</Text>
              </Pressable>
            ))}
          </View>

          <ScrollView contentContainerStyle={s.lineModalContent} keyboardShouldPersistTaps="handled">
            {activeTab === "contract" && (
              <View style={{ gap: 8 }}>
                {!selectedCustomer ? (
                  <Text style={s.pickerHint}>Pick a customer first.</Text>
                ) : !isIkea && !isApple ? (
                  <Text style={s.pickerHint}>No rate card is wired up for {selectedCustomer.name} yet — use the Custom tab.</Text>
                ) : hasPick ? (
                  <SelectedCard t={t} title={draftLine.productName} sub={draftLine.description} extra={pendingExtraLine?.productName} onChange={clearPick} />
                ) : (
                  <>
                    <TextInput
                      style={s.pickerSearchInput}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      placeholder={isIkea ? "Search IKEA products" : "Search Apple SKUs"}
                      placeholderTextColor={t.inkMuted}
                    />
                    {isIkea && ikeaRows === null && <ActivityIndicator color={t.primary} style={{ marginVertical: 8 }} />}
                    {isIkea && ikeaRows !== null && (
                      <View style={{ gap: 6 }}>
                        {filteredIkea.map((row) => (
                          <Pressable key={row.sl_no ?? row.product} style={s.pickerRow} onPress={() => pickIkeaRow(row)}>
                            <Text style={s.pickerRowTitle} numberOfLines={1}>{row.product}</Text>
                            <Text style={s.pickerRowSub} numberOfLines={1}>₹{row.revised_rate.toLocaleString("en-IN")} / {row.uom || "unit"}{row.scope ? ` · ${row.scope}` : ""}</Text>
                          </Pressable>
                        ))}
                        {filteredIkea.length === 0 && <Text style={s.pickerHint}>No matches.</Text>}
                      </View>
                    )}
                    {isApple && appleRows === null && <ActivityIndicator color={t.primary} style={{ marginVertical: 8 }} />}
                    {isApple && appleRows !== null && (
                      <View style={{ gap: 6 }}>
                        {filteredApple.map((row) => (
                          <Pressable key={row.sku_id} style={s.pickerRow} onPress={() => pickAppleRow(row)}>
                            <Text style={s.pickerRowTitle} numberOfLines={1}>{row.sku_description || row.sku_id}</Text>
                            <Text style={s.pickerRowSub} numberOfLines={1}>₹{(row.rate_inr_each ?? row.bill_rate).toLocaleString("en-IN")} / {row.unit || "unit"}</Text>
                          </Pressable>
                        ))}
                        {filteredApple.length === 0 && <Text style={s.pickerHint}>No matches.</Text>}
                      </View>
                    )}
                  </>
                )}
              </View>
            )}

            {activeTab === "history" && (
              <View style={{ gap: 8 }}>
                {!selectedCustomer ? (
                  <Text style={s.pickerHint}>Pick a customer first.</Text>
                ) : historyProducts === null ? (
                  <ActivityIndicator color={t.primary} style={{ marginVertical: 8 }} />
                ) : historyProducts.length === 0 ? (
                  <Text style={s.pickerHint}>No past sales on file for this customer yet — use the Custom tab.</Text>
                ) : hasPick ? (
                  <SelectedCard t={t} title={draftLine.productName} sub={draftLine.description} onChange={clearPick} />
                ) : (
                  <>
                    <TextInput
                      style={s.pickerSearchInput}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      placeholder="Search past items"
                      placeholderTextColor={t.inkMuted}
                    />
                    <View style={{ gap: 6 }}>
                      {filteredHistory.map((p) => (
                        <Pressable key={p.key} style={s.pickerRow} onPress={() => pickHistoryProduct(p)}>
                          <Text style={s.pickerRowTitle} numberOfLines={1}>{p.itemDescription || p.itemCode}</Text>
                          <Text style={s.pickerRowSub} numberOfLines={1}>
                            ₹{p.latestRate.toLocaleString("en-IN")} · last bought {p.latestDate ?? "—"} · {p.timesPurchased}×
                          </Text>
                        </Pressable>
                      ))}
                      {filteredHistory.length === 0 && <Text style={s.pickerHint}>No matches.</Text>}
                    </View>
                  </>
                )}
              </View>
            )}

            {activeTab === "pool" && (
              <View style={{ gap: 8 }}>
                {poolRows === null ? (
                  <ActivityIndicator color={t.primary} style={{ marginVertical: 8 }} />
                ) : poolRows.length === 0 ? (
                  <Text style={s.pickerHint}>Nothing waiting in the pool right now.</Text>
                ) : hasPick ? (
                  <SelectedCard t={t} title={draftLine.productName} sub={draftLine.description} extra={pendingExtraLine?.productName} onChange={clearPick} />
                ) : (
                  <>
                    <TextInput
                      style={s.pickerSearchInput}
                      value={pickerSearch}
                      onChangeText={setPickerSearch}
                      placeholder="Search the pool"
                      placeholderTextColor={t.inkMuted}
                    />
                    <View style={{ gap: 6 }}>
                      {filteredPool.map((row) => (
                        <Pressable key={row.id} style={s.pickerRow} onPress={() => pickPoolRow(row)}>
                          <Text style={s.pickerRowTitle} numberOfLines={1}>{row.label}</Text>
                          <Text style={s.pickerRowSub} numberOfLines={1}>
                            {row.source === "sign_estimator" ? "Sign Estimator" : "Cost Sheet"} · ₹{row.sell_amount.toLocaleString("en-IN")}
                          </Text>
                        </Pressable>
                      ))}
                      {filteredPool.length === 0 && <Text style={s.pickerHint}>No matches.</Text>}
                    </View>
                  </>
                )}
              </View>
            )}

            {activeTab === "custom" && (
              <View style={{ gap: 10 }}>
                <Field label="Product name" value={draftLine.productName} onChangeText={(v) => setDraftLine((d) => ({ ...d, productName: v }))} t={t} />
                <Field label="Description" value={draftLine.description} onChangeText={(v) => setDraftLine((d) => ({ ...d, description: v }))} multiline t={t} />
              </View>
            )}

            <Field
              label="Design / Creative name"
              value={draftLine.designName}
              onChangeText={(v) => setDraftLine((d) => ({ ...d, designName: v }))}
              placeholder="Optional"
              t={t}
            />

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
              <View style={s.segmentRow}>
                {(["dims", "bulk"] as SqftEntryMode[]).map((v) => (
                  <Pressable
                    key={v}
                    style={[s.segment, draftLine.sqftEntryMode === v && s.segmentActive]}
                    onPress={() => setDraftLine((d) => ({ ...d, sqftEntryMode: v }))}
                  >
                    <Text style={[s.segmentText, draftLine.sqftEntryMode === v && s.segmentTextActive]}>
                      {v === "dims" ? "By dimensions" : "Total sqft"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}

            {draftLine.calcMode === "sqft" && draftLine.sqftEntryMode === "dims" && (
              <>
                <View style={s.segmentRow}>
                  {(["in", "cm", "mm", "ft"] as DimUnit[]).map((v) => (
                    <Pressable
                      key={v}
                      style={[s.segment, draftLine.dimUnit === v && s.segmentActive]}
                      onPress={() => setDraftLine((d) => ({ ...d, dimUnit: v }))}
                    >
                      <Text style={[s.segmentText, draftLine.dimUnit === v && s.segmentTextActive]}>
                        {v === "in" ? "Inches" : v === "cm" ? "CM" : v === "mm" ? "MM" : "Feet"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <View style={s.dimRow}>
                  <View style={{ flex: 1 }}>
                    <Field label={`Width (${draftLine.dimUnit})`} value={draftLine.width} onChangeText={(v) => setDraftLine((d) => ({ ...d, width: v }))} keyboardType="decimal-pad" t={t} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Field label={`Height (${draftLine.dimUnit})`} value={draftLine.height} onChangeText={(v) => setDraftLine((d) => ({ ...d, height: v }))} keyboardType="decimal-pad" t={t} />
                  </View>
                </View>
              </>
            )}

            <Field
              label={draftLine.calcMode === "sqft" && draftLine.sqftEntryMode === "bulk" ? "Total sqft" : "Quantity"}
              value={draftLine.quantity}
              onChangeText={(v) => setDraftLine((d) => ({ ...d, quantity: v }))}
              keyboardType="decimal-pad"
              t={t}
            />
            <Field label="Rate" value={draftLine.unitRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, unitRate: v }))} keyboardType="decimal-pad" t={t} />
            <Field label="Transportation (flat)" value={draftLine.transportationRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, transportationRate: v }))} keyboardType="decimal-pad" placeholder="Optional" t={t} />
            <Field label="Installation (flat)" value={draftLine.installationRate} onChangeText={(v) => setDraftLine((d) => ({ ...d, installationRate: v }))} keyboardType="decimal-pad" placeholder="Optional" t={t} />

            <View style={s.lineModalPreview}>
              <Text style={s.lineModalPreviewLabel}>{pendingExtraLine ? "Line total (2 lines)" : "Line total"}</Text>
              <Text style={s.lineModalPreviewValue}>₹{previewTotal.toLocaleString("en-IN")}</Text>
            </View>

            <GradientButton label="Add to quote" onPress={confirmAddLine} style={{ marginTop: 4 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function SelectedCard({
  t, title, sub, extra, onChange,
}: {
  t: VibrantTheme;
  title: string;
  sub?: string;
  extra?: string;
  onChange: () => void;
}) {
  const s = styles(t);
  return (
    <SoftCard style={s.pickedCard}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.pickedLabel}>Selected</Text>
          <Text style={s.pickedTitle} numberOfLines={2}>{title}</Text>
          {sub ? <Text style={s.pickedSub} numberOfLines={2}>{sub}</Text> : null}
          {extra ? <Text style={s.pickedSub}>+ {extra}</Text> : null}
        </View>
        <Pressable onPress={onChange} hitSlop={8}>
          <Text style={s.pickedChange}>Change</Text>
        </Pressable>
      </View>
    </SoftCard>
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

    // "against deliver does not align in box properly" -- auto-height +
    // centered, wrapping text instead of a fixed minHeight that clipped
    // the longer "Against Delivery" label. Shared by payment terms, calc
    // mode, sqft entry mode, and dim unit toggles.
    segmentRow: { flexDirection: "row", gap: 6 },
    segment: {
      flex: 1, borderRadius: 10, alignItems: "center", justifyContent: "center",
      backgroundColor: t.surfaceSunken, paddingVertical: 8, paddingHorizontal: 4,
    },
    segmentActive: { backgroundColor: t.primaryTint },
    segmentText: { fontSize: 11, fontFamily: fonts.medium, color: t.inkSecondary, textAlign: "center" },
    segmentTextActive: { color: t.primary },

    addLineBtn: { minHeight: 32, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.md, backgroundColor: t.primaryTint },
    addLineBtnText: { fontSize: 12, fontFamily: fonts.bold, color: t.primary },

    emptyLinesCard: { padding: 16 },
    emptyLinesText: { fontSize: 13, color: t.inkMuted, textAlign: "center" },

    lineRow: { flexDirection: "row", alignItems: "center", minHeight: 48, gap: 10, padding: 12 },
    lineRowText: { flex: 1, gap: 2 },
    lineRowTitle: { fontSize: 14, fontFamily: fonts.medium, color: t.ink },
    lineRowMeta: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },
    lineRowSource: { fontSize: 10, fontFamily: fonts.medium, color: t.primary },
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

    lineModalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "90%" },
    sourceTabRow: { flexDirection: "row", gap: 4, paddingHorizontal: 16, paddingTop: 10 },
    sourceTab: { flex: 1, minHeight: 34, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: t.surfaceSunken, paddingHorizontal: 4 },
    sourceTabActive: { backgroundColor: t.primaryTint },
    sourceTabText: { fontSize: 11, fontFamily: fonts.medium, color: t.inkSecondary },
    sourceTabTextActive: { color: t.primary },
    lineModalContent: { padding: 16, gap: 10, paddingBottom: 32 },
    dimRow: { flexDirection: "row", gap: 10 },

    pickerHint: { fontSize: 12, fontFamily: fonts.regular, color: t.inkMuted, paddingVertical: 8 },
    pickerSearchInput: {
      minHeight: 40, borderRadius: 10, backgroundColor: t.surfaceSunken, paddingHorizontal: 12, fontSize: 14, color: t.ink,
    },
    pickerRow: { minHeight: 44, borderRadius: 10, backgroundColor: t.surfaceSunken, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
    pickerRowTitle: { fontSize: 13, fontFamily: fonts.medium, color: t.ink },
    pickerRowSub: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted },

    pickedCard: { padding: 10, gap: 2, backgroundColor: t.primaryTint },
    pickedLabel: { fontSize: 10, fontFamily: fonts.bold, color: t.primary, textTransform: "uppercase", letterSpacing: 0.3 },
    pickedTitle: { fontSize: 13, fontFamily: fonts.bold, color: t.ink },
    pickedSub: { fontSize: 11, fontFamily: fonts.regular, color: t.inkSecondary },
    pickedChange: { fontSize: 12, fontFamily: fonts.bold, color: t.primary },

    lineModalPreview: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingVertical: 8, paddingHorizontal: 10, backgroundColor: t.surfaceSunken, borderRadius: 10, marginTop: 4,
    },
    lineModalPreviewLabel: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    lineModalPreviewValue: { fontSize: 15, fontFamily: fonts.bold, color: t.ink },
  });
