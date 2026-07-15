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

const SYSTEM_PROMPT = `You are the AI Copilot inside MMDI ONE, an internal operating platform for MMDI, an Indian packaging/printing manufacturer. Answer questions about customers, job orders, machines, and raw materials using the tools available to you — never guess or invent data. If a tool returns no results, say so plainly rather than making something up. Keep answers concise (2-4 sentences unless the question calls for a list). When you reference a specific record, name it (e.g. "Job Order 7455" or "Apple India Pvt Ltd - Bangalore") so the person can look it up themselves.

Formatting: the chat UI renders your reply as plain text only — no markdown. Never use markdown tables (| pipes |), headers (#), or bold (**). For lists, use a simple numbered or dashed list with one item per line, or short plain sentences. Keep it readable as plain prose.`;

const TOOLS: Tool[] = [
  {
    name: "search_customers",
    description: "Search customers by name (partial match). Returns code, name, region, tier, account owner, lifetime value, and open orders for up to 20 matches, sorted by whatever the database returns first (not ranked by relevance) — if there might be more than 20, say so and suggest narrowing the search.",
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
    description: "Search job orders by customer name (partial match) or job order code. Returns up to 20 matches with status, dates, machine, and value.",
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
];

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

async function executeToolCall(
  name: string,
  input: Record<string, unknown>,
  supabase: Supabase
): Promise<{ result: unknown; citation?: string }> {
  switch (name) {
    case "search_customers": {
      const query = String(input.query ?? "");
      const { data, error } = await supabase
        .from("customers")
        .select("code, name, region, tier, account_owner, lifetime_value, open_orders")
        .ilike("name", `%${query}%`)
        .limit(20);
      if (error) return { result: { error: error.message } };
      return { result: data, citation: data?.length ? `Customer search: "${query}"` : undefined };
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
      const { data, error } = await supabase
        .from("job_orders")
        .select("code, name, customer_name, status, order_date, primary_machine, total_value, total_sqft")
        .or(`customer_name.ilike.%${query}%,code.ilike.%${query}%`)
        .limit(20);
      if (error) return { result: { error: error.message } };
      return { result: data, citation: data?.length ? `Job order search: "${query}"` : undefined };
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
