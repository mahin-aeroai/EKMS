import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useRouter } from "expo-router";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { LinearGradient } from "expo-linear-gradient";
import { radius } from "@mmdi/shared/theme";
import { vibrant, fonts, sectionLabelStyle, optionAccent, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientButton } from "../../theme/components";
import { supabase } from "../../lib/supabase";

/**
 * Mirrors apps/web/src/app/workspaces/sales-by-rep/page.tsx: pick a sales
 * person and an optional date range, see every customer they sold to for
 * that period with totals, sorted by value. Same paginated-fetch approach
 * as the web version (fetchAllRows there) -- Supabase/PostgREST's
 * server-side max-rows setting silently clamps a single request well short
 * of this table's real size, so `all()` below pages through with `.range()`
 * rather than trusting a bare `.select()` (see the web app's AI Copilot
 * route for the fuller history of that bug class).
 *
 * "dates convert indian format DDMMYYYY and give calendar there" -- From/To
 * were plain YYYY-MM-DD text fields (no native <input type="date">
 * equivalent existed without a new dependency). Now backed by
 * @react-native-community/datetimepicker (SDK 57 pins 9.1.0, matching this
 * project's react-native 0.86.0 exactly -- see bundledNativeModules.json)
 * -- state is a real Date, displayed as DD/MM/YYYY, converted to ISO
 * (toISODate) only at the query boundary since that's what Supabase's
 * .gte()/.lte() expect. New native module, so this needs a fresh EAS build,
 * not a JS-only update.
 *
 * "after run report keyboard is stuck on screen" -- was a side effect of
 * the old text-input date fields (the software keyboard could stay up
 * after Run report if a date field still had focus). Switching From/To to
 * Pressable-triggered pickers removes the keyboard from that flow
 * entirely; Keyboard.dismiss() in runReport() is a defensive backstop for
 * any other field.
 *
 * The sales-person picker is a bottom-sheet Modal + list (no native
 * <select> equivalent), same pattern as EstimatorTab's PickerField. CSV
 * export shares the file via the native share sheet (Mail, Files,
 * WhatsApp, etc.) instead of triggering a browser download.
 *
 * "put that after selection of sales person and then customer and if we
 * leave all customer like wise" -- customer used to be a free-text box
 * that only appeared after Run report, filtering the already-fetched rows
 * client-side. Now it's a second picker, same bottom-sheet pattern as
 * sales person, sitting directly between sales person and the date range
 * (disabled with a "select a sales person first" placeholder until one is
 * chosen). Its options come from a lightweight query scoped to the
 * selected rep (refetched whenever selectedRep changes), and it defaults
 * to "" meaning "All customers" -- selecting a specific one feeds a real
 * .eq("customer_name", ...) into the report query alongside sales_manager
 * and the date range, rather than post-filtering results that were
 * already fetched unfiltered.
 */

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDMY(d: Date | null): string {
  if (!d) return "";
  const day = String(d.getDate()).padStart(2, "0");
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${day}/${m}/${d.getFullYear()}`;
}

// "dates convert indian format DDMMYYYY" applies here too -- invoice_date
// comes back from Supabase as a plain "YYYY-MM-DD" string, not a Date.
function formatISOToDMY(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${d}/${m}/${y}` : iso;
}

interface CustomerTransaction {
  invoice_date: string | null;
  taxable_value: number;
  // "i want add here more details about each invocie with, product, qty
  // rate" -- each sales_transactions row already IS one product line (not
  // a multi-line invoice), so these three plus taxable_value fully
  // describe it: no further grouping needed, just more fields kept.
  item_description: string | null;
  quantity: number | null;
  rate: number | null;
  location: string | null;
  // "lets make it like typical invocie view with header, delivery
  // address, inv number, date, campaign ... GST part" -- these five were
  // added to sales_transactions by
  // supabase-sales-transactions-invoice-fidelity-migration.sql (backfilled
  // from the real Sales_day_book export, not derived/guessed). A row has
  // either sgst+cgst OR igst, never both -- standard Indian
  // intra-state-vs-inter-state GST split, see the migration's own notes.
  invoice_no: string | null;
  campaign: string | null;
  place_of_supply: string | null;
  sgst: number | null;
  cgst: number | null;
  igst: number | null;
}

// "the detail we added in previous section is sufficient some of them
// missing and if there are multi line items it is missing so let them
// open in diferent screena dn show them nicely like a bill" -- a "bill"
// is every line sharing the same real Invoice No (falls back to grouping
// by invoice_date for the rare row where invoice_no wasn't backfilled,
// e.g. a row added after the migration ran). This used to be approximated
// by customer + date before invoice_no existed in the database.
interface BillGroup {
  invoiceNo: string | null;
  date: string | null;
  campaign: string | null;
  location: string | null;
  placeOfSupply: string | null;
  total: number;
  gstAmount: number;
  lines: CustomerTransaction[];
}

function groupIntoBills(transactions: CustomerTransaction[]): BillGroup[] {
  const byKey = new Map<string, CustomerTransaction[]>();
  for (const txn of transactions) {
    const key = txn.invoice_no ?? `date:${txn.invoice_date ?? "—"}`;
    const list = byKey.get(key) ?? [];
    list.push(txn);
    byKey.set(key, list);
  }
  return Array.from(byKey.values())
    .map((lines) => ({
      invoiceNo: lines.find((l) => l.invoice_no)?.invoice_no ?? null,
      date: lines[0]?.invoice_date ?? null,
      campaign: lines.find((l) => l.campaign)?.campaign ?? null,
      location: lines.find((l) => l.location)?.location ?? null,
      placeOfSupply: lines.find((l) => l.place_of_supply)?.place_of_supply ?? null,
      total: lines.reduce((sum, l) => sum + l.taxable_value, 0),
      gstAmount: lines.reduce((sum, l) => sum + (l.sgst ?? 0) + (l.cgst ?? 0) + (l.igst ?? 0), 0),
      lines,
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));
}

interface CustomerBreakdownRow {
  customer_id: string | null;
  customer_name: string;
  // "customer name make it more visible with address so that we can
  // identify easily" -- sales_transactions has no address column itself
  // (per PROJECT_STATUS.md's own note on what was deliberately left out
  // of the import); filled in after the fact from `customers.address` via
  // customer_id, see the batch lookup in runReport() below. null until
  // that lookup resolves, or if this customer_id has no customers match.
  address: string | null;
  // "GST part" on the Bill screen -- customers.gstin, same batch lookup as
  // address (see runReport() below). null if this customer has none on file.
  gstin: string | null;
  transaction_count: number;
  total_taxable_value: number;
  // Raw per-line data (used for CSV export's line-item fidelity and to
  // derive `bills` below) -- the detail sheet itself now renders `bills`,
  // not this directly.
  transactions: CustomerTransaction[];
  bills: BillGroup[];
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

// "While loading slaes person selction it istaking lot of time" --
// fetchAllRows above pages sequentially, each page awaiting the one
// before it, so N pages means N round-trips back-to-back before the
// screen has anything to show. Getting the row count first (a fast,
// row-free `head: true` request) lets every page fire in parallel
// instead -- same data transferred, but wall-clock time is roughly one
// round-trip instead of N. Falls back to the sequential fetchAllRows if
// the count request itself fails for any reason.
// "Not all sales person are visible in filter .. check" -- root cause:
// firing every page's request at once (Promise.all below) means a single
// page hitting a transient network hiccup, timeout, or the connection
// pool's concurrency limit comes back as { data: null, error: ... }
// instead of throwing, and the old code just skipped it silently
// (`if (data) all.push(...data)`), permanently dropping whichever
// sales_manager values happened to live on that one page -- with the
// dropdown never showing anything was wrong. fetchAllRows (the older,
// proven-reliable sequential version this file already had) doesn't hit
// this because it only ever has one request in flight, so it was never
// at risk the same way. Now: if ANY page errors, this falls back to that
// same sequential path for correctness rather than silently returning an
// incomplete list -- a bit slower on the rare failure, but never wrong.
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
  if (pages.some((p) => p.error || !p.data)) return fetchAllRows(buildPage);
  const all: T[] = [];
  for (const { data } of pages) {
    if (data) all.push(...data);
  }
  return all;
}

function formatCrore(rupees: number): string {
  return `₹${(rupees / 10000000).toFixed(2)} Cr`;
}

/**
 * "Make the sales by rep screen beautiful with sales graphs and target
 * achivements, monthly sales, gorss margin graphs, product wise category
 * maps. revenue models. very high tech new age graphics like attached."
 *
 * Built from the SAME transactions this screen already fetched for the
 * customer breakdown (every CustomerBreakdownRow carries its own raw
 * `transactions`) -- no new query, no new table.
 *
 * Two of the five things asked for aren't here: target achievement and
 * gross margin. Checked both against the real schema before writing any
 * of this -- there is no sales-targets table anywhere (grepped the whole
 * repo for sales_target/target_amount/monthly_target: zero matches), and
 * sales_transactions itself has no cost/COGS column, only the revenue
 * side (taxable_value + the GST split) -- see
 * supabase-sales-transactions-invoice-fidelity-migration.sql. Charting
 * either would mean inventing numbers with nothing real behind them,
 * which is worse than not having the chart. What's below uses only data
 * that's actually there: a monthly trend, top products (item_description
 * is the closest thing to a product/category field this table has), and
 * top locations. If a real targets feature (a table plus somewhere to
 * enter them) or a cost/COGS field ever gets added, margin and
 * achievement charts are the natural next addition here.
 *
 * No charting library -- react-native-svg isn't a dependency and adding
 * one means another native rebuild. Every bar below is a plain View
 * (optionally with a LinearGradient fill, already a dependency), sized
 * with plain percentage heights/widths.
 */

interface MonthValue {
  month: string; // "YYYY-MM"
  value: number;
}

const TREND_MONTHS = 6;

function buildMonthlyTrend(rows: CustomerBreakdownRow[]): MonthValue[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    for (const txn of row.transactions) {
      if (!txn.invoice_date) continue;
      const key = txn.invoice_date.slice(0, 7);
      map.set(key, (map.get(key) ?? 0) + txn.taxable_value);
    }
  }
  return Array.from(map.entries())
    .map(([month, value]) => ({ month, value }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-TREND_MONTHS);
}

const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  const idx = Number(m) - 1;
  return `${MONTH_ABBR[idx] ?? m}'${(y ?? "").slice(2)}`;
}

interface LabelValue {
  label: string;
  value: number;
}

const BREAKDOWN_LIMIT = 5;

function buildBreakdown(rows: CustomerBreakdownRow[], pick: (t: CustomerTransaction) => string | null): LabelValue[] {
  const map = new Map<string, number>();
  for (const row of rows) {
    for (const txn of row.transactions) {
      const raw = pick(txn);
      const label = raw && raw.trim() ? raw.trim() : "Not recorded";
      map.set(label, (map.get(label) ?? 0) + txn.taxable_value);
    }
  }
  return Array.from(map.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, BREAKDOWN_LIMIT);
}

function TrendChart({ t, data }: { t: VibrantTheme; data: MonthValue[] }) {
  const s = chartStyles(t);
  if (data.length === 0) return <Text style={s.chartEmpty}>No dated transactions in this period.</Text>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={s.trendWrap}>
      {data.map((d) => (
        <View key={d.month} style={s.trendCol}>
          <Text style={s.trendValue} numberOfLines={1}>
            {d.value >= 100000 ? `${(d.value / 100000).toFixed(1)}L` : d.value.toLocaleString("en-IN")}
          </Text>
          <View style={s.trendTrack}>
            <LinearGradient
              colors={t.gradientPrimary}
              start={{ x: 0, y: 1 }}
              end={{ x: 0, y: 0 }}
              style={[s.trendFill, { height: `${Math.max(6, (d.value / max) * 100)}%` }]}
            />
          </View>
          <Text style={s.trendMonth}>{formatMonthLabel(d.month)}</Text>
        </View>
      ))}
    </View>
  );
}

function BreakdownBars({ t, data }: { t: VibrantTheme; data: LabelValue[] }) {
  const s = chartStyles(t);
  if (data.length === 0) return <Text style={s.chartEmpty}>No data in this period.</Text>;
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <View style={{ gap: 12 }}>
      {data.map((d, i) => (
        <View key={d.label} style={s.breakdownRow}>
          <Text style={s.breakdownLabel} numberOfLines={1}>{d.label}</Text>
          <View style={s.breakdownTrack}>
            <View
              style={[
                s.breakdownFill,
                { width: `${Math.max(4, (d.value / max) * 100)}%`, backgroundColor: optionAccent(t, i) },
              ]}
            />
          </View>
          <Text style={s.breakdownValue}>₹{d.value.toLocaleString("en-IN")}</Text>
        </View>
      ))}
    </View>
  );
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function SalesByRepScreen() {
  const t = vibrant;
  const s = styles(t);
  const router = useRouter();

  const [salesPeople, setSalesPeople] = useState<string[] | null>(null);
  const [repPickerOpen, setRepPickerOpen] = useState(false);
  const [selectedRep, setSelectedRep] = useState("");
  // "can we put that after selection of sales person and then customer and
  // if we leave all customer like wise" -- customer used to be a free-text
  // box that only appeared after Run report, filtering the already-fetched
  // rows client-side. Now it's a proper picker (same pattern as the sales
  // person picker above it) that comes right after sales person and before
  // the date range, so the flow reads: pick a rep, optionally narrow to
  // one of their customers (or leave it on "All customers"), then a date
  // range, then run. Selecting a customer feeds an actual .eq() filter
  // into the query below rather than a client-side substring match.
  const [customerNames, setCustomerNames] = useState<string[] | null>(null);
  const [customerPickerOpen, setCustomerPickerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(""); // "" = All customers
  const [dateFrom, setDateFrom] = useState<Date | null>(null);
  const [dateTo, setDateTo] = useState<Date | null>(null);
  const [fromPickerOpen, setFromPickerOpen] = useState(false);
  const [toPickerOpen, setToPickerOpen] = useState(false);
  const [rows, setRows] = useState<CustomerBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  // "after generating sales by customers should open detail transactions"
  const [detailCustomer, setDetailCustomer] = useState<CustomerBreakdownRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchAllRowsParallel<{ sales_manager: string | null }>(
        () => supabase.from("sales_transactions").select("sales_manager", { count: "exact", head: true }),
        (from, to) => supabase.from("sales_transactions").select("sales_manager").range(from, to)
      );
      if (cancelled) return;
      const unique = Array.from(new Set(all.map((r) => r.sales_manager).filter((v): v is string => !!v))).sort();
      setSalesPeople(unique);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Refetches whenever the sales person changes -- unscoped by date (the
  // date range isn't picked yet at this point in the flow), so this lists
  // every customer that rep has ever sold to. Resets the customer
  // selection back to "All customers" too, since whichever specific
  // customer was picked for the previous rep may not apply to this one.
  useEffect(() => {
    setSelectedCustomer("");
    if (!selectedRep) {
      setCustomerNames(null);
      return;
    }
    let cancelled = false;
    setCustomerNames(null);
    (async () => {
      const all = await fetchAllRowsParallel<{ customer_name: string | null }>(
        () =>
          supabase
            .from("sales_transactions")
            .select("customer_name", { count: "exact", head: true })
            .eq("sales_manager", selectedRep),
        (from, to) =>
          supabase.from("sales_transactions").select("customer_name").eq("sales_manager", selectedRep).range(from, to)
      );
      if (cancelled) return;
      const unique = Array.from(new Set(all.map((r) => r.customer_name).filter((v): v is string => !!v))).sort();
      setCustomerNames(unique);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedRep]);

  async function runReport() {
    if (!selectedRep) return;
    // "after run report keyboard is stuck on screen" -- defensive backstop;
    // the date fields themselves no longer summon the keyboard at all now
    // that they're picker-driven (see the file header comment).
    Keyboard.dismiss();
    setLoading(true);
    setRows(null);
    try {
      // Same date-range + customer filters apply to both the count check
      // and every page -- built once so they can't drift apart.
      function withFilters<
        Q extends { gte: (c: string, v: string) => Q; lte: (c: string, v: string) => Q; eq: (c: string, v: string) => Q }
      >(q: Q): Q {
        if (dateFrom) q = q.gte("invoice_date", toISODate(dateFrom));
        if (dateTo) q = q.lte("invoice_date", toISODate(dateTo));
        if (selectedCustomer) q = q.eq("customer_name", selectedCustomer);
        return q;
      }
      const all = await fetchAllRowsParallel<{
        customer_id: string | null;
        customer_name: string | null;
        taxable_value: number;
        invoice_date: string | null;
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
      }>(
        () =>
          withFilters(
            supabase.from("sales_transactions").select("*", { count: "exact", head: true }).eq("sales_manager", selectedRep)
          ),
        (from, to) =>
          withFilters(
            supabase
              .from("sales_transactions")
              .select(
                "customer_id, customer_name, taxable_value, invoice_date, item_description, quantity, rate, location, invoice_no, campaign, place_of_supply, sgst, cgst, igst"
              )
              .eq("sales_manager", selectedRep)
              .range(from, to)
          )
      );
      const groups = new Map<string, { customerId: string | null; total: number; count: number; transactions: CustomerTransaction[] }>();
      for (const r of all) {
        const name = r.customer_name ?? "Unknown";
        const g = groups.get(name) ?? { customerId: r.customer_id, total: 0, count: 0, transactions: [] };
        g.total += r.taxable_value ?? 0;
        g.count += 1;
        g.transactions.push({
          invoice_date: r.invoice_date,
          taxable_value: r.taxable_value ?? 0,
          item_description: r.item_description,
          quantity: r.quantity,
          rate: r.rate,
          location: r.location,
          invoice_no: r.invoice_no,
          campaign: r.campaign,
          place_of_supply: r.place_of_supply,
          sgst: r.sgst,
          cgst: r.cgst,
          igst: r.igst,
        });
        groups.set(name, g);
      }

      // "customer name make it more visible with address" + "GST part" --
      // a second, small batch query rather than joining in the main
      // paginated fetch above (that fetch can be thousands of rows across
      // many repeated customers; a join would repeat the same
      // address/gstin string on every one of them for no benefit). One row
      // per distinct customer here.
      const customerIds = Array.from(new Set([...groups.values()].map((g) => g.customerId).filter((v): v is string => !!v)));
      const addressById = new Map<string, string | null>();
      const gstinById = new Map<string, string | null>();
      if (customerIds.length > 0) {
        const { data: customerRows } = await supabase.from("customers").select("id, address, gstin").in("id", customerIds);
        for (const c of (customerRows as { id: string; address: string | null; gstin: string | null }[] | null) ?? []) {
          addressById.set(c.id, c.address);
          gstinById.set(c.id, c.gstin);
        }
      }

      const breakdown = [...groups.entries()]
        .map(([customer_name, g]) => ({
          customer_id: g.customerId,
          customer_name,
          address: g.customerId ? addressById.get(g.customerId) ?? null : null,
          gstin: g.customerId ? gstinById.get(g.customerId) ?? null : null,
          transaction_count: g.count,
          total_taxable_value: g.total,
          transactions: g.transactions.sort((a, b) => (b.invoice_date ?? "").localeCompare(a.invoice_date ?? "")),
          bills: groupIntoBills(g.transactions),
        }))
        .sort((a, b) => b.total_taxable_value - a.total_taxable_value);
      setRows(breakdown);
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    if (!filteredRows || !selectedRep) return;
    setExporting(true);
    try {
      const header = ["Sales Person", "Customer", "Transactions", "Total Taxable Value"];
      const lines = [header.join(",")];
      for (const r of filteredRows) {
        lines.push([selectedRep, r.customer_name, r.transaction_count, r.total_taxable_value].map(csvEscape).join(","));
      }
      const periodLabel = dateFrom || dateTo ? `-${dateFrom ? toISODate(dateFrom) : "start"}-to-${dateTo ? toISODate(dateTo) : "end"}` : "";
      const customerLabel = selectedCustomer ? `-${selectedCustomer.replace(/\s+/g, "-")}` : "";
      const filename = `sales-by-rep-${selectedRep.replace(/\s+/g, "-")}${customerLabel}${periodLabel}.csv`;
      // .write() creates the file itself if it doesn't exist yet -- same
      // pattern already proven in lib/installationReports/draftStore.ts,
      // no separate .create() call needed (and calling .create() on a file
      // that already exists risks throwing, so deleting first is enough).
      const file = new File(Paths.cache, filename);
      if (file.exists) file.delete();
      file.write(lines.join("\n"));
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, { mimeType: "text/csv", UTI: "public.comma-separated-values-text" });
      }
    } finally {
      setExporting(false);
    }
  }

  // The customer picker now feeds an actual query filter (see withFilters
  // in runReport above) rather than filtering client-side, so `rows` is
  // already scoped correctly by the time it lands here -- no separate
  // filteredRows derivation needed. Kept the name so the JSX below (and
  // the stats/CSV export that read it) didn't need to change.
  const filteredRows = rows;
  const totalSales = filteredRows?.reduce((sum, r) => sum + r.total_taxable_value, 0) ?? 0;
  const totalTxns = filteredRows?.reduce((sum, r) => sum + r.transaction_count, 0) ?? 0;
  const monthlyTrend = filteredRows ? buildMonthlyTrend(filteredRows) : [];
  const topItems = filteredRows ? buildBreakdown(filteredRows, (txn) => txn.item_description) : [];
  const topLocations = filteredRows ? buildBreakdown(filteredRows, (txn) => txn.location) : [];

  return (
    <View style={s.screen}>
      <View style={s.filters}>
        <Pressable style={s.pickerField} onPress={() => setRepPickerOpen(true)}>
          <Text style={selectedRep ? s.pickerText : s.pickerPlaceholder} numberOfLines={1}>
            {selectedRep || (salesPeople === null ? "Loading…" : "Select a sales person")}
          </Text>
          <Text style={s.pickerChevron}>⌄</Text>
        </Pressable>

        <Pressable
          style={[s.pickerField, !selectedRep && s.pickerFieldDisabled]}
          onPress={() => selectedRep && setCustomerPickerOpen(true)}
        >
          <Text style={selectedCustomer ? s.pickerText : s.pickerPlaceholder} numberOfLines={1}>
            {!selectedRep
              ? "Select a sales person first"
              : selectedCustomer || (customerNames === null ? "Loading…" : "All customers")}
          </Text>
          <Text style={s.pickerChevron}>⌄</Text>
        </Pressable>

        <View style={s.dateRow}>
          <View style={s.dateField}>
            <Text style={s.label}>From (optional)</Text>
            <Pressable style={s.dateInput} onPress={() => setFromPickerOpen(true)}>
              <Text style={dateFrom ? s.dateInputText : s.dateInputPlaceholder}>
                {dateFrom ? formatDMY(dateFrom) : "DD/MM/YYYY"}
              </Text>
            </Pressable>
          </View>
          <View style={s.dateField}>
            <Text style={s.label}>To (optional)</Text>
            <Pressable style={s.dateInput} onPress={() => setToPickerOpen(true)}>
              <Text style={dateTo ? s.dateInputText : s.dateInputPlaceholder}>
                {dateTo ? formatDMY(dateTo) : "DD/MM/YYYY"}
              </Text>
            </Pressable>
          </View>
        </View>

        <GradientButton label="Run report" onPress={runReport} loading={loading} disabled={!selectedRep} />
      </View>

      {filteredRows !== null && (
        <>
          <View style={s.statRow}>
            {/* "for grand total lets on use gradient lets use flat color
                like: #8C98B0" -- same flat treatment as Sign Costing's
                and Cost Sheet's grand-total cards. */}
            <View style={[s.statCardHero, s.statCardHeroFlat]}>
              <Text style={s.statLabelHero}>Total Sales</Text>
              <Text style={s.statValueHero}>{formatCrore(totalSales)}</Text>
            </View>
            <View style={s.statCardCol}>
              <SoftCard style={s.statCard}>
                <Text style={s.statLabel}>Customers</Text>
                <Text style={s.statValue}>{filteredRows.length}</Text>
              </SoftCard>
              <SoftCard style={s.statCard}>
                <Text style={s.statLabel}>Transactions</Text>
                <Text style={s.statValue}>{totalTxns.toLocaleString("en-IN")}</Text>
              </SoftCard>
            </View>
          </View>

          {filteredRows.length === 0 ? (
            <Text style={s.empty}>
              {selectedCustomer
                ? `No sales found for ${selectedCustomer} (${selectedRep}) in this period.`
                : `No sales found for ${selectedRep} in this period.`}
            </Text>
          ) : (
            <FlatList
              data={filteredRows}
              keyExtractor={(r) => r.customer_name}
              contentInsetAdjustmentBehavior="automatic"
              // "in the page scroll is very small at bottom can't see and
              // difficult to scroll" -- same root cause already fixed once
              // in copilot.tsx this session: a FlatList with only
              // contentContainerStyle and no style={flex:1} of its own
              // doesn't reliably claim the space its siblings (the filter
              // fields + stat row above) leave behind, so its actual
              // scrollable viewport ends up shorter than the real
              // available screen space.
              style={s.flatList}
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <>
                  {/* Charts live inside the FlatList's own header (not as
                      fixed siblings above it) so they scroll together with
                      the customer list through the one flex:1 FlatList --
                      stacking more fixed content above the list is exactly
                      what caused the "scroll is very small" bug this same
                      round fixed. */}
                  <Text style={[s.chartSectionTitle, { marginTop: 0 }]}>Monthly trend</Text>
                  <SoftCard style={s.chartCard}>
                    <TrendChart t={t} data={monthlyTrend} />
                  </SoftCard>

                  <Text style={s.chartSectionTitle}>Top products</Text>
                  <SoftCard style={s.chartCard}>
                    <BreakdownBars t={t} data={topItems} />
                  </SoftCard>

                  <Text style={s.chartSectionTitle}>Top locations</Text>
                  <SoftCard style={s.chartCard}>
                    <BreakdownBars t={t} data={topLocations} />
                  </SoftCard>

                  <Text style={s.chartSectionTitle}>Customers</Text>
                  <Pressable style={s.exportBtn} onPress={exportCsv} disabled={exporting}>
                    {exporting ? (
                      <ActivityIndicator color={t.primary} />
                    ) : (
                      <Text style={s.exportBtnText}>Export {filteredRows.length} rows to CSV</Text>
                    )}
                  </Pressable>
                </>
              }
              renderItem={({ item }) => (
                <Pressable onPress={() => setDetailCustomer(item)}>
                  {({ pressed }) => (
                    <SoftCard style={[s.row, pressed && { opacity: 0.7 }]}>
                      <View style={s.rowText}>
                        <Text style={s.rowTitle} numberOfLines={1}>{item.customer_name}</Text>
                        <Text style={s.rowMeta}>
                          {item.transaction_count} transaction{item.transaction_count === 1 ? "" : "s"}
                        </Text>
                      </View>
                      <View style={s.rowRight}>
                        <Text style={s.rowValue}>₹{item.total_taxable_value.toLocaleString("en-IN")}</Text>
                        <Text style={s.rowChev}>›</Text>
                      </View>
                    </SoftCard>
                  )}
                </Pressable>
              )}
            />
          )}
        </>
      )}

      <Modal visible={repPickerOpen} transparent animationType="slide" onRequestClose={() => setRepPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setRepPickerOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Sales person</Text>
            <Pressable onPress={() => setRepPickerOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <FlatList
            data={salesPeople ?? []}
            keyExtractor={(name) => name}
            style={s.modalList}
            renderItem={({ item: name, index }) => (
              <Pressable
                style={[s.modalOption, { borderLeftColor: optionAccent(t, index) }, name === selectedRep && s.modalOptionActive]}
                onPress={() => {
                  setSelectedRep(name);
                  setRows(null);
                  setRepPickerOpen(false);
                }}
              >
                <Text style={s.modalOptionText}>{name}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>{salesPeople === null ? "Loading…" : "No sales people found."}</Text>}
          />
        </View>
      </Modal>

      <Modal visible={customerPickerOpen} transparent animationType="slide" onRequestClose={() => setCustomerPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setCustomerPickerOpen(false)} />
        <View style={s.modalSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Customer</Text>
            <Pressable onPress={() => setCustomerPickerOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <FlatList
            data={["", ...(customerNames ?? [])]}
            keyExtractor={(name, i) => name || `all-${i}`}
            style={s.modalList}
            renderItem={({ item: name, index }) => (
              <Pressable
                style={[s.modalOption, { borderLeftColor: optionAccent(t, index) }, name === selectedCustomer && s.modalOptionActive]}
                onPress={() => {
                  setSelectedCustomer(name);
                  setRows(null);
                  setCustomerPickerOpen(false);
                }}
              >
                <Text style={s.modalOptionText}>{name || "All customers"}</Text>
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>{customerNames === null ? "Loading…" : "No customers found."}</Text>}
          />
        </View>
      </Modal>

      <Modal visible={fromPickerOpen} transparent animationType="fade" onRequestClose={() => setFromPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setFromPickerOpen(false)} />
        <View style={s.datePickerSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>From date</Text>
            <Pressable onPress={() => setFromPickerOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <DateTimePicker
            value={dateFrom ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            themeVariant="light"
            accentColor={t.primary}
            style={s.datePicker}
            maximumDate={dateTo ?? undefined}
            onChange={(_event, selected) => {
              if (Platform.OS === "android") setFromPickerOpen(false);
              if (selected) setDateFrom(selected);
            }}
          />
        </View>
      </Modal>

      <Modal visible={toPickerOpen} transparent animationType="fade" onRequestClose={() => setToPickerOpen(false)}>
        <Pressable style={s.modalBackdrop} onPress={() => setToPickerOpen(false)} />
        <View style={s.datePickerSheet}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>To date</Text>
            <Pressable onPress={() => setToPickerOpen(false)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <DateTimePicker
            value={dateTo ?? new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            themeVariant="light"
            accentColor={t.primary}
            style={s.datePicker}
            minimumDate={dateFrom ?? undefined}
            onChange={(_event, selected) => {
              if (Platform.OS === "android") setToPickerOpen(false);
              if (selected) setDateTo(selected);
            }}
          />
        </View>
      </Modal>

      <Modal visible={!!detailCustomer} transparent animationType="slide" onRequestClose={() => setDetailCustomer(null)}>
        <Pressable style={s.modalBackdrop} onPress={() => setDetailCustomer(null)} />
        <View style={s.modalSheet}>
          {/* "customer name make it more visible with address so that we
              can identify easily" -- was a single truncated line sharing
              the row with the Done button; now its own block, full name
              (wraps to 2 lines rather than clipping with "…"), plus the
              customer's registered address underneath so a same-named
              branch/location is unambiguous. */}
          <View style={s.detailHeader}>
            <View style={s.detailHeaderText}>
              <Text style={s.detailCustomerName}>{detailCustomer?.customer_name}</Text>
              {detailCustomer?.address ? (
                <Text style={s.detailCustomerAddress} numberOfLines={2}>{detailCustomer.address}</Text>
              ) : null}
            </View>
            <Pressable onPress={() => setDetailCustomer(null)}><Text style={s.modalClose}>Done</Text></Pressable>
          </View>
          <View style={s.detailSummaryRow}>
            <Text style={s.detailSummaryText}>
              {detailCustomer?.transaction_count} transaction{detailCustomer?.transaction_count === 1 ? "" : "s"}
            </Text>
            <Text style={s.detailSummaryValue}>₹{detailCustomer?.total_taxable_value.toLocaleString("en-IN")}</Text>
          </View>
          {/* "the detail we added in previous section is sufficient some of
              them missing and if there are multi line items it is missing
              so let them open in diferent screena dn show them nicely like
              a bill" -- one row per Bill (same customer + invoice_date)
              instead of one row per raw product line, so multi-line bills
              show as a single row with their full line count rather than
              several same-date rows that looked like missing/duplicate
              data. Tapping a bill opens it on its own screen, styled like
              an actual invoice. */}
          <FlatList
            data={detailCustomer?.bills ?? []}
            keyExtractor={(bill, i) => `${bill.date ?? "—"}-${i}`}
            style={s.modalList}
            renderItem={({ item: bill, index }) => (
              <Pressable
                onPress={() => {
                  if (!detailCustomer) return;
                  router.push({
                    pathname: "/bill",
                    params: {
                      customerName: detailCustomer.customer_name,
                      address: detailCustomer.address ?? "",
                      gstin: detailCustomer.gstin ?? "",
                      date: bill.date ?? "",
                      invoiceNo: bill.invoiceNo ?? "",
                      campaign: bill.campaign ?? "",
                      location: bill.location ?? "",
                      placeOfSupply: bill.placeOfSupply ?? "",
                      total: String(bill.total),
                      gstAmount: String(bill.gstAmount),
                      lines: JSON.stringify(bill.lines),
                    },
                  });
                }}
              >
                {({ pressed }) => (
                  <View style={[s.detailRow, { borderLeftColor: optionAccent(t, index) }, pressed && { opacity: 0.7 }]}>
                    <View style={s.detailRowTop}>
                      <Text style={s.detailRowDate}>{bill.invoiceNo ?? formatISOToDMY(bill.date)}</Text>
                      <Text style={s.detailRowValue}>₹{(bill.total + bill.gstAmount).toLocaleString("en-IN")}</Text>
                    </View>
                    <View style={s.detailRowTop}>
                      <Text style={s.detailRowProduct}>
                        {formatISOToDMY(bill.date)} · {bill.lines.length} item{bill.lines.length === 1 ? "" : "s"}
                        {bill.lines[0]?.item_description
                          ? `  ·  ${bill.lines[0].item_description}${bill.lines.length > 1 ? " + more" : ""}`
                          : ""}
                      </Text>
                      <Text style={s.detailRowChev}>›</Text>
                    </View>
                  </View>
                )}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={s.modalEmpty}>No bills.</Text>}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    filters: { padding: 16, gap: 12 },

    chartSectionTitle: { ...sectionLabelStyle(t), marginTop: 10, marginHorizontal: 16, marginBottom: 2 },
    chartCard: { marginHorizontal: 16, marginBottom: 4, padding: 14 },

    pickerField: {
      minHeight: 44, borderRadius: 22,
      backgroundColor: t.surfaceRaised, paddingHorizontal: 16, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    },
    pickerText: { flex: 1, fontSize: 16, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 16, color: t.inkMuted },
    // Customer picker before a sales person is chosen -- same field, just
    // dimmed and non-interactive rather than hidden, so the flow (sales
    // person, then customer, then date) stays visible even before it's
    // usable.
    pickerFieldDisabled: { opacity: 0.5 },
    pickerChevron: { fontSize: 16, color: t.inkMuted },

    dateRow: { flexDirection: "row", gap: 12 },
    dateField: { flex: 1, gap: 4 },
    label: { fontSize: 12, fontWeight: "500", color: t.inkSecondary },

    dateInput: {
      minHeight: 44, borderRadius: 14, justifyContent: "center",
      backgroundColor: t.surfaceRaised, paddingHorizontal: 12,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    dateInputText: { fontSize: 15, fontWeight: "500", color: t.ink },
    dateInputPlaceholder: { fontSize: 15, color: t.inkMuted },
    // "Sale sby rep date is not appearing" -- the iOS inline calendar was
    // collapsing to a sliver (one visible day, default blue) because
    // neither the sheet nor the picker itself had an explicit size, and an
    // inline UIDatePicker needs one to lay out its full month grid. A fixed
    // sheet height + stretched/tall picker plus themeVariant/accentColor
    // (so it reads as part of the red theme, not default iOS blue) fixes
    // both the layout collapse and the color mismatch in one pass.
    datePickerSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, paddingBottom: 24, minHeight: 400 },
    datePicker: { alignSelf: "stretch", height: 340 },

    // "total sales block looks pretty dominent" -- was flex:1.2 (wider
    // than its two siblings) with more padding and a bigger value than
    // either, on top of already being the only solid-filled card in the
    // row; all three together made it read as commanding the screen
    // rather than sitting alongside Customers/Transactions. Same width
    // now (flex:1), tighter padding, smaller value -- still the visually
    // distinct "hero" figure, just not an oversized one.
    statRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
    statCardHero: { flex: 1, justifyContent: "center", gap: 4 },
    statCardHeroFlat: {
      backgroundColor: t.inkMuted, borderRadius: 16, padding: 11,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.1, shadowRadius: 16, elevation: 4,
    },
    statLabelHero: { fontSize: 11, color: t.onGradient, opacity: 0.85 },
    statValueHero: { fontSize: 18, fontWeight: "700", color: t.onGradient },
    statCardCol: { flex: 1, gap: 8 },
    statCard: { padding: 10, gap: 2 },
    statLabel: { fontSize: 11, color: t.inkSecondary },
    statValue: { fontSize: 16, fontWeight: "600", color: t.ink },

    exportBtn: { minHeight: 40, marginBottom: 4, borderRadius: radius.md, borderWidth: 1.5, borderColor: t.primary, alignItems: "center", justifyContent: "center" },
    exportBtnText: { fontSize: 14, fontWeight: "600", color: t.primary },

    empty: { padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },

    flatList: { flex: 1 },
    list: { paddingHorizontal: 16, paddingBottom: 32, gap: 8 },
    row: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 12 },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 15, color: t.ink },
    rowMeta: { fontSize: 13, color: t.inkSecondary, marginTop: 2 },
    rowValue: { fontSize: 15, fontWeight: "600", color: t.ink },
    // "after generating sales by customers should open detail transactions"
    rowRight: { flexDirection: "row", alignItems: "center", gap: 4 },
    rowChev: { fontSize: 18, color: t.inkMuted },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "70%", paddingBottom: 24 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 15, fontWeight: "600", color: t.ink },
    modalClose: { fontSize: 15, fontWeight: "600", color: t.primary },
    modalList: { paddingHorizontal: 8 },
    // "drop down selction font should be smaller and more decorative with
    // each line with slighly colored" -- thin colored left rule per row.
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md, borderLeftWidth: 3, marginVertical: 1 },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 13, fontFamily: fonts.regular, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 14 },

    // Customer transaction-detail sheet.
    // "customer name make it more visible with address" -- replaces the
    // old single-line modalHeader/modalTitle combo for this sheet only
    // (other sheets in this file still use modalHeader/modalTitle).
    detailHeader: {
      flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 12,
      padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line,
    },
    detailHeaderText: { flex: 1, gap: 3 },
    detailCustomerName: { fontSize: 17, fontFamily: fonts.bold, color: t.ink },
    detailCustomerAddress: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary, lineHeight: 16 },
    detailSummaryRow: {
      flexDirection: "row", justifyContent: "space-between", alignItems: "center",
      paddingHorizontal: 16, paddingVertical: 10, backgroundColor: t.surfaceSunken,
    },
    detailSummaryText: { fontSize: 12, fontFamily: fonts.regular, color: t.inkSecondary },
    detailSummaryValue: { fontSize: 15, fontFamily: fonts.bold, color: t.ink },
    // Was a single row (date + amount); now a small column so the
    // product/qty/rate line can sit underneath each "bill" without
    // fighting the date/amount for horizontal space.
    detailRow: {
      gap: 2, paddingHorizontal: 12, paddingVertical: 8, borderLeftWidth: 3, marginVertical: 1,
    },
    detailRowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
    detailRowDate: { fontSize: 13, fontFamily: fonts.regular, color: t.ink },
    detailRowValue: { fontSize: 13, fontFamily: fonts.medium, color: t.inkSecondary },
    // "in small font. underneath each Bill" -- item count + first product.
    detailRowProduct: { fontSize: 11, fontFamily: fonts.regular, color: t.inkMuted, flexShrink: 1 },
    detailRowChev: { fontSize: 14, color: t.inkMuted },
  });

const TREND_TRACK_HEIGHT = 110;

// TrendChart/BreakdownBars' own styles -- separate from `styles` for the
// same reason cardStyles/overlayStyles are elsewhere in this app (used by
// module-level components, not just the screen component itself).
const chartStyles = (t: VibrantTheme) =>
  StyleSheet.create({
    chartEmpty: { fontSize: 13, color: t.inkMuted, textAlign: "center", paddingVertical: 12 },

    trendWrap: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 6 },
    trendCol: { flex: 1, alignItems: "center", gap: 4 },
    trendValue: { fontSize: 10, fontFamily: fonts.medium, color: t.inkSecondary },
    trendTrack: {
      width: "100%", height: TREND_TRACK_HEIGHT, borderRadius: 8,
      backgroundColor: t.surfaceSunken, justifyContent: "flex-end", overflow: "hidden",
    },
    trendFill: { width: "100%", borderRadius: 8 },
    trendMonth: { fontSize: 11, fontFamily: fonts.medium, color: t.inkMuted },

    breakdownRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    breakdownLabel: { width: 92, fontSize: 12, fontFamily: fonts.regular, color: t.ink },
    breakdownTrack: { flex: 1, height: 10, borderRadius: 5, backgroundColor: t.surfaceSunken, overflow: "hidden" },
    breakdownFill: { height: "100%", borderRadius: 5 },
    breakdownValue: { width: 78, fontSize: 12, fontFamily: fonts.medium, color: t.inkSecondary, textAlign: "right" },
  });
