import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, Tool, ToolResultBlockParam } from "@anthropic-ai/sdk/resources/messages";
import { createServerSupabaseClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// Real LLM grounding for the AI Copilot workspace (src/app/workspaces/ai-copilot/page.tsx).
// Every other "AI insight" surface in this app is still static/templated copy — this is
// the first (and, per the user's chosen scope, only) one backed by an actual model call.
//
// Requires ANTHROPIC_API_KEY as a server-side Vercel environment variable. Never exposed
// to the client — this route runs on the server only. If it's not set, this route returns
// a clear 503 rather than crashing, and the client shows a helpful message instead of a
// generic error.
//
// Grounding approach: Claude tool use. Rather than guessing what data might be relevant to
// a question and stuffing it into the prompt upfront, Claude is given a small set of
// read-only tools backed by real Supabase queries (search/get customers, job orders,
// machines, raw materials; list pending approvals; list compliance findings) and decides
// which to call based on the question. This mirrors how the rest of MMDI ONE's data is
// shaped — nothing here is fabricated or pre-summarized, every fact traces back to an
// actual table.

const MODEL = "claude-sonnet-5";
const MAX_TOKENS = 1024;
const MAX_TOOL_ITERATIONS = 5;

const SYSTEM_PROMPT = `You are the AI Copilot inside MMDI ONE, an internal operating platform for MMDI, an Indian packaging/printing manufacturer. Answer questions about customers, job orders, machines, raw materials, sales, and purchases using the tools available to you — never guess or invent data. If a tool returns no results, say so plainly rather than making something up. Keep answers concise (2-4 sentences unless the question calls for a list). When you reference a specific record, name it (e.g. "Job Order 7455" or "Apple India Pvt Ltd - Bangalore") so the person can look it up themselves.

Sales questions: use sales_summary for anything about sales broken down by material/product category, sales person, customer, or a time period (day/week/month) — it covers all of those via its group_by parameter, plus always returns a grand total for the filtered range even when grouped. Use search_sale_items for questions about a specific item's price/rate. "Sales" always means Taxable Value (pre-tax) from sales_transactions, never Voucher amount (GST-inclusive) — the tools already return the right figure, just don't relabel it as something else.

Purchase/spend questions: use purchase_summary for anything about what MMDI bought/spent — broken down by supplier, material/product category, item_type, or a time period (day/week/month) — same group_by pattern as sales_summary, and it also supports combining a filter with a different group_by. Use search_purchase_items for a specific item's buy price/rate. "Purchases"/"spend" always means Taxable Value (pre-tax) from purchase_transactions, covering Jan-Jun 2026 (a different, wider date range than sales' Apr-Jun 2026 — don't assume they cover the same period). Some purchase line items have no product_category (the item wasn't in the item master) — these show as "Uncategorized", which is a real, if imprecise, answer, not an error.

Raw materials vs. capital goods vs. services: purchase_transactions has a real item_type field (Raw material / Finished goods / Service / Intermediate item / Non stock item) — use group_by='item_type' or item_type_filter='Raw material' whenever a question wants "raw materials only" or wants capital equipment/capital goods excluded, NOT product_category_filter (product_category is a finer material grouping within item_type, not a substitute for it). Important gotcha: capital equipment purchases (product_category='FIXED ASSETS', a meaningful ~₹3 Cr) are classified as item_type='Intermediate item' in the source item master, not their own type — so item_type_filter='Raw material' already correctly excludes them, but item_type_filter='Intermediate item' would NOT be "everything except raw materials and capital goods," it still includes FIXED ASSETS. sales_transactions has no item_type field at all (it was never enriched against the item master) — a "raw materials only" filter is only possible on the purchase side.

Capital goods/capital equipment/capital investment questions specifically: ALWAYS call purchase_summary or search_purchase_items with product_category_filter='FIXED ASSETS' directly to get the real figure. NEVER estimate capital-goods spend by subtracting a raw-material-filtered total from an unfiltered total — that gap also contains Service, Finished goods, Non stock item, and Uncategorized spend, not just capital goods, and will overstate the true number (this exact mistake happened once already in this deployment: an inferred ₹1,25,25,043/15 transactions vs. the real, directly-filtered ₹16,73,000/4 transactions for June 2026 — a ~7.5x overstatement). If asked "did we buy any capital equipment," run the direct FIXED ASSETS query before answering, don't infer.

Branch/office questions: MMDI operates through 9 branches — Hyderabad, Noida, Mumbai, Bangalore, Chennai, Kolkata, Kochi, Visakhapatnam, and Pune. Both sales_summary and purchase_summary support group_by='location' and a location_filter for "which branch" / "sales at the Hyderabad office" type questions — use group_by='location', not customer/supplier, when the question names a city/branch rather than a company. Two things worth knowing: the data spells it "Vishakapatnam" (one fewer syllable than the standard spelling), and a handful of rows use "Chandanvelly" or "Head Office" instead of a branch name — these are real values in the source data (a plant/godown location and central office respectively, not one of the 9 sales branches), not errors — report them as-is rather than folding them into the nearest branch.

Financial year: MMDI's financial year runs 1 April to 31 March, e.g. FY26-27 = 1 Apr 2026 to 31 Mar 2027, and FY26-27 Q1 = Apr-Jun 2026, Q2 = Jul-Sep 2026, Q3 = Oct-Dec 2026, Q4 = Jan-Mar 2027 (note Q4 of an FY falls in the NEXT calendar year). There is no fiscal_year column in the data — only raw calendar dates — so for a question about a specific FY or FY quarter, compute date_from/date_to yourself using this rule and pass them to sales_summary/purchase_summary (e.g. "FY26-27 Q4 purchases" -> date_from='2027-01-01', date_to='2027-03-31'). Both tools also support group_by='fiscal_year' and group_by='fiscal_quarter' for breaking a wider range down BY financial year/quarter in one call (e.g. "compare purchases across FY25-26 Q4 and FY26-27 Q1" -> one purchase_summary call with group_by='fiscal_quarter', date_from='2026-01-01', date_to='2026-06-30', no need for two separate calls). Remember the underlying date ranges differ: sales_transactions only covers Apr-Jun 2026 (all FY26-27 Q1), while purchase_transactions covers Jan-Jun 2026 (spanning FY25-26 Q4 AND FY26-27 Q1) — don't assume a "total" on one ledger reflects the same financial-year scope as the other.

Listing every matching transaction (not just a summary): search_sale_items and search_purchase_items both accept an optional limit parameter (default 20, max 150) and both return total_matches plus detail_rows_are_complete. When someone wants a full itemized list (e.g. "list all the capital goods purchases with vendor and value"), first check total_matches from a normal call — if it's small (roughly under 150), call the same tool again with limit set to total_matches to get every row in ONE additional call, rather than manually slicing the request by month/branch/supplier yourself. Only fall back to slicing (e.g. one month at a time) if total_matches is too large even for limit=150. Each detail row already includes branch/location, supplier or customer, item name, rate, and taxable value — present them as a plain numbered list (no markdown tables, see Formatting below), one transaction per line.

Formatting: the chat UI renders your reply as plain text only — no markdown. Never use markdown tables (| pipes |), headers (#), or bold (**). For lists, use a simple numbered or dashed list with one item per line, or short plain sentences. Keep it readable as plain prose.

Totals: when search_customers or search_job_orders returns more matches than the detail list shows, use the tool's own total_* aggregate fields for any sum/total the person asks for — never add up just the visible detail rows yourself, since that list is capped and may exclude the largest matches (it's sorted by value, but a common search term can still match more records than fit in the list).`;

const TOOLS: Tool[] = [
  {
    name: "search_customers",
    description: "Search customers by name (partial match). Returns total_matches and a true aggregate sum (total_lifetime_value_across_all_matches, total_open_orders_across_all_matches) across EVERY match, not just the ones shown — always use these totals when asked for a sum/total, never add up the detail list yourself, since the detail list is capped. Also returns top_20_by_lifetime_value: the 20 highest-value matches for detail.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for in the customer name" } },
      required: ["query"],
    },
  },
  {
    name: "get_customer",
    description: "Get full detail for one customer by its code (e.g. 'C03739'), including contacts and recent comments/approvals.",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "The customer's code" } },
      required: ["code"],
    },
  },
  {
    name: "search_job_orders",
    description: "Search job orders by customer name (partial match) or job order code. Returns total_matches and a true aggregate sum (total_value_across_all_matches, total_sqft_across_all_matches) across EVERY match, not just the ones shown — always use these totals when asked for a sum/total, never add up the detail list yourself, since the detail list is capped. Also returns top_20_by_value: the 20 highest-value matches for detail.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Customer name or job order code to search for" } },
      required: ["query"],
    },
  },
  {
    name: "get_job_order",
    description: "Get full detail for one job order by its code (e.g. '7455').",
    input_schema: {
      type: "object",
      properties: { code: { type: "string", description: "The job order's code" } },
      required: ["code"],
    },
  },
  {
    name: "search_machines",
    description: "Search machines by name or code (partial match). Returns up to 20 matches with line, status, and OEE.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for in the machine name or code" } },
      required: ["query"],
    },
  },
  {
    name: "search_raw_materials",
    description: "Search raw materials by name or category (partial match). Returns up to 20 matches with stock level, reorder point, and category.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for in the material name or category" } },
      required: ["query"],
    },
  },
  {
    name: "list_pending_approvals",
    description: "List all pending approvals across customers, job orders, machines, and raw materials.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "get_compliance_findings",
    description: "List compliance findings on record.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "sales_summary",
    description: "Real sales figures (Taxable Value, not Voucher amount) from the full Q1 FY26-27 sales ledger (9,274 line items), grouped by whichever dimension answers the question: material/product category, sales person, customer, or time period (day/week/month). Always returns a grand total for the filtered range in addition to the grouped breakdown, so it also answers plain 'total sales' questions. Supports combining a filter with a different group_by — e.g. 'which customers did Jayaraj sell to in June' is sales_manager_filter='Jayaraj', group_by='customer', date_from/date_to for June, NOT a separate lookup.",
    input_schema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["product_category", "sales_manager", "customer", "location", "fiscal_year", "fiscal_quarter", "month", "week", "day"],
          description: "How to break down the sales figures. 'product_category' is the closest match to 'material category' or 'product group'; 'sales_manager' is the closest match to 'sales person'; 'location' is the closest match to 'branch' or 'sales office' (MMDI's 9 branches: Hyderabad, Noida, Mumbai, Bangalore, Chennai, Kolkata, Kochi, Visakhapatnam, Pune); 'fiscal_year'/'fiscal_quarter' bucket by MMDI's Apr-Mar financial year (e.g. 'FY26-27', 'FY26-27 Q1') rather than calendar month/week.",
        },
        sales_manager_filter: { type: "string", description: "Optional: restrict to this sales person (partial match) before grouping — use when the question names a specific sales person AND asks for a different breakdown (e.g. their customers, their category mix)" },
        customer_filter: { type: "string", description: "Optional: restrict to this customer name (partial match) before grouping" },
        product_category_filter: { type: "string", description: "Optional: restrict to this product/material category (partial match) before grouping" },
        location_filter: { type: "string", description: "Optional: restrict to this branch/location (partial match) before grouping — e.g. 'Hyderabad', 'Bangalore'" },
        date_from: { type: "string", description: "Optional start date (YYYY-MM-DD), inclusive" },
        date_to: { type: "string", description: "Optional end date (YYYY-MM-DD), inclusive" },
        top_n: { type: "number", description: "Max number of groups to return in detail, sorted by total value descending (default 20)" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "search_sale_items",
    description: "Search individual sale line items by item code, item description, product category, OR customer name (partial match) — use for 'price details' / 'what's the rate for X' questions, for finding every line item tied to a specific customer, or to list out every matching transaction. Returns matching line items (with per-unit rate, quantity, taxable value, and branch/location) plus an aggregate (total_matches, average rate, total taxable value) across ALL matches regardless of limit. The detail list defaults to 20 rows — if total_matches from an initial call is small (roughly under 150) and the person wants the full list, call again with a higher `limit` (e.g. limit=total_matches) to return every row in one shot instead of splitting the request into slices yourself.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in the item code, item description, or product category" },
        limit: { type: "number", description: "Max number of detail rows to return, sorted by most recent first (default 20, max 150). Raise this when total_matches is small and the person wants every row listed." },
      },
      required: ["query"],
    },
  },
  {
    name: "purchase_summary",
    description: "Real purchase/spend figures (Taxable Value, not GST-inclusive) from the full Jan-Jun 2026 purchase ledger (9,528 line items, sourced from goods-receipt/MRN records), grouped by whichever dimension answers the question: supplier, material/product category, or time period (day/week/month). Always returns a grand total for the filtered range in addition to the grouped breakdown, so it also answers plain 'total spend'/'total purchases' questions. Supports combining a filter with a different group_by — e.g. 'what categories did we buy from Dovetail Furniture' is supplier_filter='Dovetail Furniture', group_by='product_category', NOT a separate lookup.",
    input_schema: {
      type: "object",
      properties: {
        group_by: {
          type: "string",
          enum: ["product_category", "supplier", "location", "item_type", "fiscal_year", "fiscal_quarter", "month", "week", "day"],
          description: "How to break down the purchase figures. 'product_category' is the closest match to 'material category'; 'supplier' is the closest match to 'vendor'; 'location' is the closest match to 'branch' (MMDI's 9 branches: Hyderabad, Noida, Mumbai, Bangalore, Chennai, Kolkata, Kochi, Visakhapatnam, Pune); 'item_type' is the broad purchase class (Raw material / Finished goods / Service / Intermediate item / Non stock item) — use this for 'raw materials vs capital goods vs services' type questions, not product_category; 'fiscal_year'/'fiscal_quarter' bucket by MMDI's Apr-Mar financial year (e.g. 'FY26-27', 'FY25-26 Q4') rather than calendar month/week — the purchase ledger spans FY25-26 Q4 and FY26-27 Q1, so this is the only tool where a fiscal-year comparison spans a real boundary in the data.",
        },
        supplier_filter: { type: "string", description: "Optional: restrict to this supplier name (partial match) before grouping" },
        product_category_filter: { type: "string", description: "Optional: restrict to this product/material category (partial match) before grouping" },
        location_filter: { type: "string", description: "Optional: restrict to this branch/location (partial match) before grouping — e.g. 'Hyderabad', 'Bangalore'" },
        item_type_filter: { type: "string", description: "Optional: restrict to this item type (partial match) before grouping — one of 'Raw material', 'Finished goods', 'Service', 'Intermediate item', 'Non stock item'. Use item_type_filter='Raw material' whenever the question says 'raw materials only' or asks to exclude capital equipment/capital goods — capital equipment purchases (the 'FIXED ASSETS' product_category) fall under item_type='Intermediate item' in the source data, NOT its own type, so excluding by item_type='Raw material' is the correct way to isolate true raw-material spend." },
        date_from: { type: "string", description: "Optional start date (YYYY-MM-DD), inclusive" },
        date_to: { type: "string", description: "Optional end date (YYYY-MM-DD), inclusive" },
        top_n: { type: "number", description: "Max number of groups to return in detail, sorted by total value descending (default 20)" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "search_purchase_items",
    description: "Search individual purchase line items by item code, item name, product category, OR supplier name (partial match) — use for 'what do we pay for X' / 'buy price of X' questions, for finding every line item bought from a specific supplier (e.g. 'Arrow Digital'), or to list out every matching transaction (e.g. all capital goods purchases with vendor/branch/value). Returns matching line items (with per-unit rate, quantity, taxable value, supplier, and branch/location) plus an aggregate (total_matches, average rate, total taxable value) across ALL matches regardless of limit. The detail list defaults to 20 rows — if total_matches from an initial call is small (roughly under 150) and the person wants the full list, call again with a higher `limit` (e.g. limit=total_matches) to return every row in one shot instead of splitting the request into month-by-month or other slices yourself.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Text to search for in the item code, item name, or product category" },
        limit: { type: "number", description: "Max number of detail rows to return, sorted by most recent first (default 20, max 150). Raise this when total_matches is small and the person wants every row listed." },
      },
      required: ["query"],
    },
  },
];

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// IMPORTANT: Supabase/PostgREST enforces its own server-side "max rows" setting
// (project default: 1000) that silently clamps a response to that many rows
// regardless of what .limit() a client requests -- a .limit(20000) call can still
// come back with exactly 1000 rows if the project's cap is 1000. This bit us twice:
// once via a missing .limit() (undercounted well below even 1000 in some cases),
// and again via a .limit(20000) "fix" that was still clamped to 1000 server-side
// (confirmed live: grand_total_transactions read exactly 1000 against a 9,274-row
// table). The only reliable fix is pagination with .range(), fetching page after
// page until one comes back shorter than requested -- that works no matter what
// the project's max-rows setting is. Every "fetch everything to aggregate" query
// in this file must use this helper now, not a bare .limit().
async function fetchAllRows<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 1000,
  hardCap = 50000
): Promise<{ rows: T[]; error?: string }> {
  let rows: T[] = [];
  let from = 0;
  while (rows.length < hardCap) {
    const to = from + pageSize - 1;
    const { data, error } = await buildPage(from, to);
    if (error) return { rows, error: error.message };
    const batch = data ?? [];
    rows = rows.concat(batch);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return { rows };
}

// MMDI's financial year runs 1 April - 31 March, e.g. FY26-27 = 1 Apr 2026 to
// 31 Mar 2027. There's no fiscal_year column in either ledger -- only raw
// calendar dates -- so this derives the FY label from a plain YYYY-MM-DD
// string. Shared by sales_summary and purchase_summary's group_by='fiscal_year'
// / 'fiscal_quarter' (see SYSTEM_PROMPT for why this matters: the purchase
// ledger spans FY25-26 Q4 and FY26-27 Q1, a real boundary the sales ledger
// never crosses).
function fiscalYearLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.getUTCMonth() + 1; // 1-12
  const startYear = month >= 4 ? d.getUTCFullYear() : d.getUTCFullYear() - 1;
  const yy = (n: number) => String(n % 100).padStart(2, "0");
  return `FY${yy(startYear)}-${yy(startYear + 1)}`;
}

function fiscalQuarterLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00Z");
  const month = d.getUTCMonth() + 1; // 1-12
  const quarter = month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 && month <= 12 ? 3 : 4;
  return `${fiscalYearLabel(dateStr)} Q${quarter}`;
}

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  supabase: Supabase
): Promise<{ result: unknown; citation?: string }> {
  switch (name) {
    case "search_customers": {
      const query = String(input.query ?? "");
      const [top, allResult] = await Promise.all([
        supabase
          .from("customers")
          .select("code, name, region, tier, account_owner, lifetime_value, open_orders")
          .ilike("name", `%${query}%`)
          .order("lifetime_value", { ascending: false })
          .limit(20),
        fetchAllRows((from, to) =>
          supabase.from("customers").select("lifetime_value, open_orders").ilike("name", `%${query}%`).range(from, to)
        ),
      ]);
      if (top.error || allResult.error) return { result: { error: (top.error ?? { message: allResult.error })?.message } };
      const allRows = allResult.rows;
      const totalMatches = allRows.length;
      const result = {
        total_matches: totalMatches,
        total_lifetime_value_across_all_matches: allRows.reduce((sum, r) => sum + (r.lifetime_value ?? 0), 0),
        total_open_orders_across_all_matches: allRows.reduce((sum, r) => sum + (r.open_orders ?? 0), 0),
        top_20_by_lifetime_value: top.data,
      };
      return { result, citation: totalMatches ? `Customer search: "${query}" (${totalMatches} matches)` : undefined };
    }
    case "get_customer": {
      const code = String(input.code ?? "");
      const { data: customer, error } = await supabase.from("customers").select("*").eq("code", code).maybeSingle();
      if (error || !customer) return { result: { error: error?.message ?? "Not found" } };
      const [{ data: contacts }, { data: comments }, { data: approvals }] = await Promise.all([
        supabase.from("customer_contacts").select("name, role, email").eq("customer_id", customer.id),
        supabase.from("customer_comments").select("author, content, created_at").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("customer_approvals").select("title, status, value").eq("customer_id", customer.id).order("created_at", { ascending: false }).limit(5),
      ]);
      return { result: { customer, contacts, recent_comments: comments, recent_approvals: approvals }, citation: `Customer ${customer.code} — ${customer.name}` };
    }
    case "search_job_orders": {
      const query = String(input.query ?? "");
      const filter = `customer_name.ilike.%${query}%,code.ilike.%${query}%`;
      const [top, allResult] = await Promise.all([
        supabase
          .from("job_orders")
          .select("code, name, customer_name, status, order_date, primary_machine, total_value, total_sqft")
          .or(filter)
          .order("total_value", { ascending: false })
          .limit(20),
        fetchAllRows((from, to) =>
          supabase.from("job_orders").select("total_value, total_sqft").or(filter).range(from, to)
        ),
      ]);
      if (top.error || allResult.error) return { result: { error: (top.error ?? { message: allResult.error })?.message } };
      const allRows = allResult.rows;
      const totalMatches = allRows.length;
      const result = {
        total_matches: totalMatches,
        total_value_across_all_matches: allRows.reduce((sum, r) => sum + (r.total_value ?? 0), 0),
        total_sqft_across_all_matches: allRows.reduce((sum, r) => sum + (r.total_sqft ?? 0), 0),
        top_20_by_value: top.data,
      };
      return { result, citation: totalMatches ? `Job order search: "${query}" (${totalMatches} matches)` : undefined };
    }
    case "get_job_order": {
      const code = String(input.code ?? "");
      const { data: jobOrder, error } = await supabase.from("job_orders").select("*").eq("code", code).maybeSingle();
      if (error || !jobOrder) return { result: { error: error?.message ?? "Not found" } };
      const [{ data: comments }, { data: approvals }] = await Promise.all([
        supabase.from("job_order_comments").select("author, content, created_at").eq("job_order_id", jobOrder.id).order("created_at", { ascending: false }).limit(5),
        supabase.from("job_order_approvals").select("title, status, value").eq("job_order_id", jobOrder.id).order("created_at", { ascending: false }).limit(5),
      ]);
      return { result: { job_order: jobOrder, recent_comments: comments, recent_approvals: approvals }, citation: `Job Order ${jobOrder.code} — ${jobOrder.customer_name}` };
    }
    case "search_machines": {
      const query = String(input.query ?? "");
      const { data, error } = await supabase
        .from("machines")
        .select("code, name, line, status, oee, vendor, model")
        .or(`name.ilike.%${query}%,code.ilike.%${query}%`)
        .limit(20);
      if (error) return { result: { error: error.message } };
      return { result: data, citation: data?.length ? `Machine search: "${query}"` : undefined };
    }
    case "search_raw_materials": {
      const query = String(input.query ?? "");
      const { data, error } = await supabase
        .from("raw_materials")
        .select("code, name, category, current_stock, reorder_point, unit_cost")
        .or(`name.ilike.%${query}%,category.ilike.%${query}%`)
        .limit(20);
      if (error) return { result: { error: error.message } };
      return { result: data, citation: data?.length ? `Raw material search: "${query}"` : undefined };
    }
    case "list_pending_approvals": {
      const [customerApprovals, jobOrderApprovals, machineApprovals, materialApprovals] = await Promise.all([
        supabase.from("customer_approvals").select("title, requested_by, value, customer_id").eq("status", "pending"),
        supabase.from("job_order_approvals").select("title, requested_by, value, job_order_id").eq("status", "pending"),
        supabase.from("machine_approvals").select("title, requested_by, value, machine_id").eq("status", "pending"),
        supabase.from("raw_material_approvals").select("title, requested_by, value, raw_material_id").eq("status", "pending"),
      ]);
      const result = {
        customer_approvals: customerApprovals.data ?? [],
        job_order_approvals: jobOrderApprovals.data ?? [],
        machine_approvals: machineApprovals.data ?? [],
        raw_material_approvals: materialApprovals.data ?? [],
      };
      return { result, citation: "Pending approvals across all workspaces" };
    }
    case "get_compliance_findings": {
      const { data, error } = await supabase.from("compliance_findings").select("item, area, status, status_label");
      if (error) return { result: { error: error.message } };
      return { result: data, citation: "Compliance findings" };
    }
    case "sales_summary": {
      const groupBy = String(input.group_by ?? "product_category");
      const dateFrom = input.date_from ? String(input.date_from) : null;
      const dateTo = input.date_to ? String(input.date_to) : null;
      const topN = typeof input.top_n === "number" ? input.top_n : 20;
      const salesManagerFilter = input.sales_manager_filter ? String(input.sales_manager_filter) : null;
      const customerFilter = input.customer_filter ? String(input.customer_filter) : null;
      const productCategoryFilter = input.product_category_filter ? String(input.product_category_filter) : null;
      const locationFilter = input.location_filter ? String(input.location_filter) : null;

      // Paginated, not a bare .limit(): Supabase/PostgREST's server-side max-rows
      // setting clamps any single request (even .limit(20000)) to its own cap
      // (project default 1000) -- see fetchAllRows' comment above for the full story.
      const { rows, error } = await fetchAllRows((from, to) => {
        let q = supabase
          .from("sales_transactions")
          .select("product_category, sales_manager, customer_name, location, invoice_date, taxable_value")
          .range(from, to);
        if (dateFrom) q = q.gte("invoice_date", dateFrom);
        if (dateTo) q = q.lte("invoice_date", dateTo);
        if (salesManagerFilter) q = q.ilike("sales_manager", `%${salesManagerFilter}%`);
        if (customerFilter) q = q.ilike("customer_name", `%${customerFilter}%`);
        if (productCategoryFilter) q = q.ilike("product_category", `%${productCategoryFilter}%`);
        if (locationFilter) q = q.ilike("location", `%${locationFilter}%`);
        return q;
      });
      if (error) return { result: { error } };
      const grandTotal = rows.reduce((sum, r) => sum + (r.taxable_value ?? 0), 0);

      // Monday-starting week bucket, labeled by that Monday's date.
      function weekLabel(dateStr: string): string {
        const d = new Date(dateStr + "T00:00:00Z");
        const dayOffset = (d.getUTCDay() + 6) % 7; // 0 = Monday
        d.setUTCDate(d.getUTCDate() - dayOffset);
        return `week of ${d.toISOString().slice(0, 10)}`;
      }

      function labelFor(row: (typeof rows)[number]): string {
        switch (groupBy) {
          case "sales_manager":
            return row.sales_manager ?? "Unknown";
          case "customer":
            return row.customer_name ?? "Unknown";
          case "location":
            return row.location ?? "Unknown";
          case "fiscal_year":
            return row.invoice_date ? fiscalYearLabel(row.invoice_date) : "Unknown";
          case "fiscal_quarter":
            return row.invoice_date ? fiscalQuarterLabel(row.invoice_date) : "Unknown";
          case "month":
            return row.invoice_date ? row.invoice_date.slice(0, 7) : "Unknown";
          case "week":
            return row.invoice_date ? weekLabel(row.invoice_date) : "Unknown";
          case "day":
            return row.invoice_date ?? "Unknown";
          case "product_category":
          default:
            return row.product_category ?? "Unknown";
        }
      }

      const groups = new Map<string, { total: number; count: number }>();
      for (const row of rows) {
        const label = labelFor(row);
        const g = groups.get(label) ?? { total: 0, count: 0 };
        g.total += row.taxable_value ?? 0;
        g.count += 1;
        groups.set(label, g);
      }

      const sortedGroups = [...groups.entries()]
        .map(([label, g]) => ({ label, total_taxable_value: g.total, transaction_count: g.count }))
        .sort((a, b) => b.total_taxable_value - a.total_taxable_value)
        .slice(0, topN);

      const filtersApplied = {
        sales_manager: salesManagerFilter,
        customer: customerFilter,
        product_category: productCategoryFilter,
        location: locationFilter,
      };
      const result = {
        group_by: groupBy,
        filters_applied: filtersApplied,
        date_range: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
        grand_total_taxable_value: grandTotal,
        grand_total_transactions: rows.length,
        groups: sortedGroups,
      };
      const filterLabel = [salesManagerFilter && `sales person "${salesManagerFilter}"`, customerFilter && `customer "${customerFilter}"`, productCategoryFilter && `category "${productCategoryFilter}"`, locationFilter && `branch "${locationFilter}"`]
        .filter(Boolean)
        .join(", ");
      return {
        result,
        citation: `Sales summary grouped by ${groupBy}${filterLabel ? `, filtered to ${filterLabel}` : ""}${dateFrom || dateTo ? ` (${dateFrom ?? "…"} to ${dateTo ?? "…"})` : ""}`,
      };
    }
    case "search_sale_items": {
      const query = String(input.query ?? "");
      const detailLimit = Math.min(Math.max(typeof input.limit === "number" ? Math.floor(input.limit) : 20, 1), 150);
      const filter = `item_code.ilike.%${query}%,item_description.ilike.%${query}%,product_category.ilike.%${query}%,customer_name.ilike.%${query}%`;
      const [top, allResult] = await Promise.all([
        supabase
          .from("sales_transactions")
          .select("item_code, item_description, product_category, rate, quantity, taxable_value, invoice_date, customer_name, location")
          .or(filter)
          .order("invoice_date", { ascending: false })
          .limit(detailLimit),
        fetchAllRows((from, to) =>
          supabase.from("sales_transactions").select("rate, taxable_value").or(filter).range(from, to)
        ),
      ]);
      if (top.error || allResult.error) return { result: { error: (top.error ?? { message: allResult.error })?.message } };
      const matches = allResult.rows;
      const totalMatches = matches.length;
      const avgRate = totalMatches ? matches.reduce((sum, r) => sum + (r.rate ?? 0), 0) / totalMatches : 0;
      const result = {
        total_matches: totalMatches,
        average_rate_across_all_matches: avgRate,
        total_taxable_value_across_all_matches: matches.reduce((sum, r) => sum + (r.taxable_value ?? 0), 0),
        detail_rows_shown: top.data?.length ?? 0,
        detail_rows_are_complete: (top.data?.length ?? 0) >= totalMatches, // false means more rows exist than shown -- raise `limit` to get them all
        most_recent: top.data,
      };
      return { result, citation: totalMatches ? `Sale item search: "${query}" (${totalMatches} matches, showing ${result.detail_rows_shown})` : undefined };
    }
    case "purchase_summary": {
      const groupBy = String(input.group_by ?? "product_category");
      const dateFrom = input.date_from ? String(input.date_from) : null;
      const dateTo = input.date_to ? String(input.date_to) : null;
      const topN = typeof input.top_n === "number" ? input.top_n : 20;
      const supplierFilter = input.supplier_filter ? String(input.supplier_filter) : null;
      const productCategoryFilter = input.product_category_filter ? String(input.product_category_filter) : null;
      const locationFilter = input.location_filter ? String(input.location_filter) : null;
      const itemTypeFilter = input.item_type_filter ? String(input.item_type_filter) : null;

      // Paginated (see fetchAllRows comment above) -- purchase_transactions is
      // 9,528 rows, well past the point a bare .limit() would be trustworthy.
      const { rows, error } = await fetchAllRows((from, to) => {
        let q = supabase
          .from("purchase_transactions")
          .select("product_category, supplier_name, location, item_type, grn_date, taxable_value")
          .range(from, to);
        if (dateFrom) q = q.gte("grn_date", dateFrom);
        if (dateTo) q = q.lte("grn_date", dateTo);
        if (supplierFilter) q = q.ilike("supplier_name", `%${supplierFilter}%`);
        if (productCategoryFilter) q = q.ilike("product_category", `%${productCategoryFilter}%`);
        if (locationFilter) q = q.ilike("location", `%${locationFilter}%`);
        if (itemTypeFilter) q = q.ilike("item_type", `%${itemTypeFilter}%`);
        return q;
      });
      if (error) return { result: { error } };
      const grandTotal = rows.reduce((sum, r) => sum + (r.taxable_value ?? 0), 0);

      // Monday-starting week bucket, labeled by that Monday's date.
      function weekLabel(dateStr: string): string {
        const d = new Date(dateStr + "T00:00:00Z");
        const dayOffset = (d.getUTCDay() + 6) % 7; // 0 = Monday
        d.setUTCDate(d.getUTCDate() - dayOffset);
        return `week of ${d.toISOString().slice(0, 10)}`;
      }

      function labelFor(row: (typeof rows)[number]): string {
        switch (groupBy) {
          case "supplier":
            return row.supplier_name ?? "Unknown";
          case "location":
            return row.location ?? "Unknown";
          case "item_type":
            return row.item_type ?? "Uncategorized";
          case "fiscal_year":
            return row.grn_date ? fiscalYearLabel(row.grn_date) : "Unknown";
          case "fiscal_quarter":
            return row.grn_date ? fiscalQuarterLabel(row.grn_date) : "Unknown";
          case "month":
            return row.grn_date ? row.grn_date.slice(0, 7) : "Unknown";
          case "week":
            return row.grn_date ? weekLabel(row.grn_date) : "Unknown";
          case "day":
            return row.grn_date ?? "Unknown";
          case "product_category":
          default:
            return row.product_category ?? "Uncategorized"; // ~9.7% of rows have no item-master match, see schema notes
        }
      }

      const groups = new Map<string, { total: number; count: number }>();
      for (const row of rows) {
        const label = labelFor(row);
        const g = groups.get(label) ?? { total: 0, count: 0 };
        g.total += row.taxable_value ?? 0;
        g.count += 1;
        groups.set(label, g);
      }

      const sortedGroups = [...groups.entries()]
        .map(([label, g]) => ({ label, total_taxable_value: g.total, transaction_count: g.count }))
        .sort((a, b) => b.total_taxable_value - a.total_taxable_value)
        .slice(0, topN);

      const filtersApplied = {
        supplier: supplierFilter,
        product_category: productCategoryFilter,
        location: locationFilter,
        item_type: itemTypeFilter,
      };
      const result = {
        group_by: groupBy,
        filters_applied: filtersApplied,
        date_range: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
        grand_total_taxable_value: grandTotal,
        grand_total_transactions: rows.length,
        groups: sortedGroups,
      };
      const filterLabel = [supplierFilter && `supplier "${supplierFilter}"`, productCategoryFilter && `category "${productCategoryFilter}"`, locationFilter && `branch "${locationFilter}"`, itemTypeFilter && `item type "${itemTypeFilter}"`]
        .filter(Boolean)
        .join(", ");
      return {
        result,
        citation: `Purchase summary grouped by ${groupBy}${filterLabel ? `, filtered to ${filterLabel}` : ""}${dateFrom || dateTo ? ` (${dateFrom ?? "…"} to ${dateTo ?? "…"})` : ""}`,
      };
    }
    case "search_purchase_items": {
      const query = String(input.query ?? "");
      const detailLimit = Math.min(Math.max(typeof input.limit === "number" ? Math.floor(input.limit) : 20, 1), 150);
      const filter = `item_code.ilike.%${query}%,item_name.ilike.%${query}%,product_category.ilike.%${query}%,supplier_name.ilike.%${query}%`;
      const [top, allResult] = await Promise.all([
        supabase
          .from("purchase_transactions")
          .select("item_code, item_name, product_category, rate, quantity, taxable_value, grn_date, supplier_name, location")
          .or(filter)
          .order("grn_date", { ascending: false })
          .limit(detailLimit),
        fetchAllRows((from, to) =>
          supabase.from("purchase_transactions").select("rate, taxable_value").or(filter).range(from, to)
        ),
      ]);
      if (top.error || allResult.error) return { result: { error: (top.error ?? { message: allResult.error })?.message } };
      const matches = allResult.rows;
      const totalMatches = matches.length;
      const avgRate = totalMatches ? matches.reduce((sum, r) => sum + (r.rate ?? 0), 0) / totalMatches : 0;
      const result = {
        total_matches: totalMatches,
        average_rate_across_all_matches: avgRate,
        total_taxable_value_across_all_matches: matches.reduce((sum, r) => sum + (r.taxable_value ?? 0), 0),
        detail_rows_shown: top.data?.length ?? 0,
        detail_rows_are_complete: (top.data?.length ?? 0) >= totalMatches, // false means more rows exist than shown -- raise `limit` to get them all
        most_recent: top.data,
      };
      return { result, citation: totalMatches ? `Purchase item search: "${query}" (${totalMatches} matches, showing ${result.detail_rows_shown})` : undefined };
    }
    default:
      return { result: { error: `Unknown tool: ${name}` } };
  }
}

export async function POST(request: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "not_configured", message: "ANTHROPIC_API_KEY isn't set. Add it as a Vercel environment variable to enable the AI Copilot." },
      { status: 503 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: { messages?: { role: "user" | "assistant"; content: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const incoming = body.messages ?? [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "no_messages" }, { status: 400 });
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: MessageParam[] = incoming.map((m) => ({ role: m.role, content: m.content }));
  const citations = new Set<string>();

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await anthropic.messages.create({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages,
        tools: TOOLS,
      });

      messages.push({ role: "assistant", content: response.content });

      if (response.stop_reason !== "tool_use") {
        const text = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === "text")
          .map((block) => block.text)
          .join("\n")
          .trim();
        return NextResponse.json({
          content: text || "I couldn't find a clear answer to that.",
          citations: Array.from(citations),
        });
      }

      const toolResults: ToolResultBlockParam[] = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        const { result, citation } = await executeToolCall(block.name, block.input as Record<string, unknown>, supabase);
        if (citation) citations.add(citation);
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }
      messages.push({ role: "user", content: toolResults });
    }

    return NextResponse.json({
      content: "That question needed more lookups than I could complete — try narrowing it down.",
      citations: Array.from(citations),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "ai_error", message }, { status: 502 });
  }
}
