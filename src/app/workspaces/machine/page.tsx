import { type MachineRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { MachineWorkspaceClient } from "@/components/workspaces/MachineWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

const DEMO_MACHINE_CODE = "MC-HYD-001"; // Vutek GS 3250 LX Pro, Unit 1 — Hyderabad, real imported machine

export default async function MachineWorkspacePage() {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error: machineError } = await supabase
    .from("machines")
    .select("*")
    .eq("code", DEMO_MACHINE_CODE)
    .limit(1);

  const machine = rows?.[0] as MachineRow | undefined;

  if (machineError || !machine) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load a machine from Supabase. Confirm the machine workspace schema has
        been run and that NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
        {machineError && <pre className="mt-2 whitespace-pre-wrap text-xs">{machineError.message}</pre>}
      </div>
    );
  }

  const [{ data: comments }, { data: approvals }] = await Promise.all([
    supabase
      .from("machine_comments")
      .select("*")
      .eq("machine_id", machine.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("machine_approvals")
      .select("*")
      .eq("machine_id", machine.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <MachineWorkspaceClient
      machine={machine}
      initialComments={comments ?? []}
      initialApproval={approvals?.[0] ?? null}
    />
  );
}
