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

const SYSTEM_PROMPT = `You are the AI Copilot inside MMDI ONE, an internal operating platform for MMDI, an Indian packaging/printing manufacturer. Answer questions about customers, job orders, machines, raw materials, and sales using the tools available to you — never guess or invent data. If a tool returns no results, say so plainly rather than making something up. Keep answers concise (2-4 sentences unless the question calls for a list). When you reference a specific record, name it (e.g. "Job Order 7455" or "Apple India Pvt Ltd - Bangalore") so the person can look it up themselves.

Sales questions: use sales_summary for anything about sales broken down by material/product category, sales person, customer, or a time period (day/week/month) — it covers all of those via its group_by parameter, plus always returns a grand total for the filtered range even when grouped. Use search_sale_items for questions about a specific item's price/rate. "Sales" always means Taxable Value (pre-tax) from sales_transactions, never Voucher amount (GST-inclusive) — the tools already return the right figure, just don't relabel it as something else.

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
          enum: ["product_category", "sales_manager", "customer", "month", "week", "day"],
          description: "How to break down the sales figures. 'product_category' is the closest match to 'material category' or 'product group'; 'sales_manager' is the closest match to 'sales person'.",
        },
        sales_manager_filter: { type: "string", description: "Optional: restrict to this sales person (partial match) before grouping — use when the question names a specific sales person AND asks for a different breakdown (e.g. their customers, their category mix)" },
        customer_filter: { type: "string", description: "Optional: restrict to this customer name (partial match) before grouping" },
        product_category_filter: { type: "string", description: "Optional: restrict to this product/material category (partial match) before grouping" },
        date_from: { type: "string", description: "Optional start date (YYYY-MM-DD), inclusive" },
        date_to: { type: "string", description: "Optional end date (YYYY-MM-DD), inclusive" },
        top_n: { type: "number", description: "Max number of groups to return in detail, sorted by total value descending (default 20)" },
      },
      required: ["group_by"],
    },
  },
  {
    name: "search_sale_items",
    description: "Search individual sale line items by item code, item description, or product category (partial match) — use for 'price details' / 'what's the rate for X' questions. Returns matching line items (with per-unit rate, quantity, and taxable value) plus an aggregate (average rate, total taxable value) across all matches.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Text to search for in the item code, item description, or product category" } },
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

      // Paginated, not a bare .limit(): Supabase/PostgREST's server-side max-rows
      // setting clamps any single request (even .limit(20000)) to its own cap
      // (project default 1000) -- see fetchAllRows' comment above for the full story.
      const { rows, error } = await fetchAllRows((from, to) => {
        let q = supabase
          .from("sales_transactions")
          .select("product_category, sales_manager, customer_name, invoice_date, taxable_value")
          .range(from, to);
        if (dateFrom) q = q.gte("invoice_date", dateFrom);
        if (dateTo) q = q.lte("invoice_date", dateTo);
        if (salesManagerFilter) q = q.ilike("sales_manager", `%${salesManagerFilter}%`);
        if (customerFilter) q = q.ilike("customer_name", `%${customerFilter}%`);
        if (productCategoryFilter) q = q.ilike("product_category", `%${productCategoryFilter}%`);
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
      };
      const result = {
        group_by: groupBy,
        filters_applied: filtersApplied,
        date_range: dateFrom || dateTo ? { from: dateFrom, to: dateTo } : null,
        grand_total_taxable_value: grandTotal,
        grand_total_transactions: rows.length,
        groups: sortedGroups,
      };
      const filterLabel = [salesManagerFilter && `sales person "${salesManagerFilter}"`, customerFilter && `customer "${customerFilter}"`, productCategoryFilter && `category "${productCategoryFilter}"`]
        .filter(Boolean)
        .join(", ");
      return {
        result,
        citation: `Sales summary grouped by ${groupBy}${filterLabel ? `, filtered to ${filterLabel}` : ""}${dateFrom || dateTo ? ` (${dateFrom ?? "…"} to ${dateTo ?? "…"})` : ""}`,
      };
    }
    case "search_sale_items": {
      const query = String(input.query ?? "");
      const filter = `item_code.ilike.%${query}%,item_description.ilike.%${query}%,product_category.ilike.%${query}%`;
      const [top, allResult] = await Promise.all([
        supabase
          .from("sales_transactions")
          .select("item_code, item_description, product_category, rate, quantity, taxable_value, invoice_date, customer_name")
          .or(filter)
          .order("invoice_date", { ascending: false })
          .limit(20),
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
        most_recent_20: top.data,
      };
      return { result, citation: totalMatches ? `Sale item search: "${query}" (${totalMatches} matches)` : undefined };
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
