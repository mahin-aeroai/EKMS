import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { radius } from "@mmdi/shared/theme";
import { vibrant, type VibrantTheme } from "../../theme/vibrant";
import { SoftCard, GradientCard, GradientButton } from "../../theme/components";
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
 * Two native-specific choices the web version didn't need:
 *  - HTML has no `<input type="date">` equivalent here without a new native
 *    dependency (@react-native-community/datetimepicker isn't installed
 *    yet) -- From/To are plain text fields (YYYY-MM-DD), same format
 *    Supabase expects, passed straight to .gte()/.lte() like the web
 *    version. A real native date picker is a reasonable follow-up, not
 *    done here to avoid a new native module + rebuild for a "quick win"
 *    round.
 *  - The sales-person picker is a bottom-sheet Modal + list (no native
 *    <select> equivalent), same pattern as EstimatorTab's PickerField.
 *  - CSV export shares the file via the native share sheet (Mail, Files,
 *    WhatsApp, etc.) instead of triggering a browser download.
 */

interface CustomerBreakdownRow {
  customer_name: string;
  transaction_count: number;
  total_taxable_value: number;
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

function formatCrore(rupees: number): string {
  return `₹${(rupees / 10000000).toFixed(2)} Cr`;
}

function csvEscape(value: string | number): string {
  const s = String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function SalesByRepScreen() {
  const t = vibrant;
  const s = styles(t);

  const [salesPeople, setSalesPeople] = useState<string[] | null>(null);
  const [repPickerOpen, setRepPickerOpen] = useState(false);
  const [selectedRep, setSelectedRep] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [rows, setRows] = useState<CustomerBreakdownRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const all = await fetchAllRows<{ sales_manager: string | null }>((from, to) =>
        supabase.from("sales_transactions").select("sales_manager").range(from, to)
      );
      if (cancelled) return;
      const unique = Array.from(new Set(all.map((r) => r.sales_manager).filter((v): v is string => !!v))).sort();
      setSalesPeople(unique);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function runReport() {
    if (!selectedRep) return;
    setLoading(true);
    setRows(null);
    try {
      const all = await fetchAllRows<{ customer_name: string | null; taxable_value: number; invoice_date: string | null }>(
        (from, to) => {
          let q = supabase
            .from("sales_transactions")
            .select("customer_name, taxable_value, invoice_date")
            .eq("sales_manager", selectedRep)
            .range(from, to);
          if (dateFrom.trim()) q = q.gte("invoice_date", dateFrom.trim());
          if (dateTo.trim()) q = q.lte("invoice_date", dateTo.trim());
          return q;
        }
      );
      const groups = new Map<string, { total: number; count: number }>();
      for (const r of all) {
        const name = r.customer_name ?? "Unknown";
        const g = groups.get(name) ?? { total: 0, count: 0 };
        g.total += r.taxable_value ?? 0;
        g.count += 1;
        groups.set(name, g);
      }
      const breakdown = [...groups.entries()]
        .map(([customer_name, g]) => ({ customer_name, transaction_count: g.count, total_taxable_value: g.total }))
        .sort((a, b) => b.total_taxable_value - a.total_taxable_value);
      setRows(breakdown);
    } finally {
      setLoading(false);
    }
  }

  async function exportCsv() {
    if (!rows || !selectedRep) return;
    setExporting(true);
    try {
      const header = ["Sales Person", "Customer", "Transactions", "Total Taxable Value"];
      const lines = [header.join(",")];
      for (const r of rows) {
        lines.push([selectedRep, r.customer_name, r.transaction_count, r.total_taxable_value].map(csvEscape).join(","));
      }
      const periodLabel = dateFrom || dateTo ? `-${dateFrom || "start"}-to-${dateTo || "end"}` : "";
      const filename = `sales-by-rep-${selectedRep.replace(/\s+/g, "-")}${periodLabel}.csv`;
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

  const totalSales = rows?.reduce((sum, r) => sum + r.total_taxable_value, 0) ?? 0;
  const totalTxns = rows?.reduce((sum, r) => sum + r.transaction_count, 0) ?? 0;

  return (
    <View style={s.screen}>
      <View style={s.filters}>
        <Pressable style={s.pickerField} onPress={() => setRepPickerOpen(true)}>
          <Text style={selectedRep ? s.pickerText : s.pickerPlaceholder} numberOfLines={1}>
            {selectedRep || (salesPeople === null ? "Loading…" : "Select a sales person")}
          </Text>
          <Text style={s.pickerChevron}>⌄</Text>
        </Pressable>

        <View style={s.dateRow}>
          <View style={s.dateField}>
            <Text style={s.label}>From (optional)</Text>
            <TextInput
              style={s.dateInput}
              value={dateFrom}
              onChangeText={setDateFrom}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.inkMuted}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
          <View style={s.dateField}>
            <Text style={s.label}>To (optional)</Text>
            <TextInput
              style={s.dateInput}
              value={dateTo}
              onChangeText={setDateTo}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={t.inkMuted}
              autoCorrect={false}
              autoCapitalize="none"
            />
          </View>
        </View>

        <GradientButton label="Run report" onPress={runReport} loading={loading} disabled={!selectedRep} />
      </View>

      {rows !== null && (
        <>
          <View style={s.statRow}>
            <GradientCard style={s.statCardHero}>
              <Text style={s.statLabelHero}>Total Sales</Text>
              <Text style={s.statValueHero}>{formatCrore(totalSales)}</Text>
            </GradientCard>
            <View style={s.statCardCol}>
              <SoftCard style={s.statCard}>
                <Text style={s.statLabel}>Customers</Text>
                <Text style={s.statValue}>{rows.length}</Text>
              </SoftCard>
              <SoftCard style={s.statCard}>
                <Text style={s.statLabel}>Transactions</Text>
                <Text style={s.statValue}>{totalTxns.toLocaleString("en-IN")}</Text>
              </SoftCard>
            </View>
          </View>

          {rows.length === 0 ? (
            <Text style={s.empty}>No sales found for {selectedRep} in this period.</Text>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.customer_name}
              contentInsetAdjustmentBehavior="automatic"
              contentContainerStyle={s.list}
              ListHeaderComponent={
                <Pressable style={s.exportBtn} onPress={exportCsv} disabled={exporting}>
                  {exporting ? (
                    <ActivityIndicator color={t.primary} />
                  ) : (
                    <Text style={s.exportBtnText}>Export {rows.length} rows to CSV</Text>
                  )}
                </Pressable>
              }
              renderItem={({ item }) => (
                <SoftCard style={s.row}>
                  <View style={s.rowText}>
                    <Text style={s.rowTitle} numberOfLines={1}>{item.customer_name}</Text>
                    <Text style={s.rowMeta}>
                      {item.transaction_count} transaction{item.transaction_count === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Text style={s.rowValue}>₹{item.total_taxable_value.toLocaleString("en-IN")}</Text>
                </SoftCard>
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
            renderItem={({ item: name }) => (
              <Pressable
                style={[s.modalOption, name === selectedRep && s.modalOptionActive]}
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
    </View>
  );
}

const styles = (t: VibrantTheme) =>
  StyleSheet.create({
    screen: { flex: 1, backgroundColor: t.surface },
    filters: { padding: 16, gap: 12 },

    pickerField: {
      minHeight: 44, borderRadius: 22,
      backgroundColor: t.surfaceRaised, paddingHorizontal: 16, paddingVertical: 10,
      flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3,
    },
    pickerText: { flex: 1, fontSize: 16, color: t.ink },
    pickerPlaceholder: { flex: 1, fontSize: 16, color: t.inkMuted },
    pickerChevron: { fontSize: 16, color: t.inkMuted },

    dateRow: { flexDirection: "row", gap: 12 },
    dateField: { flex: 1, gap: 4 },
    label: { fontSize: 12, fontWeight: "500", color: t.inkSecondary },
    dateInput: {
      minHeight: 40, borderRadius: 14,
      backgroundColor: t.surfaceRaised, paddingHorizontal: 12, fontSize: 15, color: t.ink,
      shadowColor: "#3D2E6B", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },

    statRow: { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
    statCardHero: { flex: 1.2, justifyContent: "center", gap: 4 },
    statLabelHero: { fontSize: 12, color: t.onGradient, opacity: 0.85 },
    statValueHero: { fontSize: 22, fontWeight: "700", color: t.onGradient },
    statCardCol: { flex: 1, gap: 8 },
    statCard: { padding: 10, gap: 2 },
    statLabel: { fontSize: 11, color: t.inkSecondary },
    statValue: { fontSize: 16, fontWeight: "600", color: t.ink },

    exportBtn: { minHeight: 40, marginBottom: 4, borderRadius: radius.md, borderWidth: 1.5, borderColor: t.primary, alignItems: "center", justifyContent: "center" },
    exportBtnText: { fontSize: 14, fontWeight: "600", color: t.primary },

    empty: { padding: 24, textAlign: "center", fontSize: 15, color: t.inkMuted },

    list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
    row: { flexDirection: "row", alignItems: "center", minHeight: 44, gap: 12 },
    rowText: { flex: 1 },
    rowTitle: { fontSize: 15, color: t.ink },
    rowMeta: { fontSize: 13, color: t.inkSecondary, marginTop: 2 },
    rowValue: { fontSize: 15, fontWeight: "600", color: t.ink },

    modalBackdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
    modalSheet: { backgroundColor: t.surfaceRaised, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, maxHeight: "70%", paddingBottom: 24 },
    modalHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.line },
    modalTitle: { fontSize: 15, fontWeight: "600", color: t.ink },
    modalClose: { fontSize: 15, fontWeight: "600", color: t.primary },
    modalList: { paddingHorizontal: 8 },
    modalOption: { minHeight: 44, justifyContent: "center", paddingHorizontal: 12, paddingVertical: 10, borderRadius: radius.md },
    modalOptionActive: { backgroundColor: t.primaryTint },
    modalOptionText: { fontSize: 15, color: t.ink },
    modalEmpty: { padding: 24, textAlign: "center", color: t.inkMuted, fontSize: 14 },
  });
