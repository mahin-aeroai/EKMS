import { type RawMaterialRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { RawMaterialWorkspaceClient } from "@/components/workspaces/RawMaterialWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

const DEMO_MATERIAL_CODE = "RM-11001"; // Frontlit Flex, real imported raw material, core signage substrate

export default async function RawMaterialWorkspacePage() {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error: materialError } = await supabase
    .from("raw_materials")
    .select("*")
    .eq("code", DEMO_MATERIAL_CODE)
    .limit(1);

  const material = rows?.[0] as RawMaterialRow | undefined;

  if (materialError || !material) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load a raw material from Supabase. Confirm the raw material workspace
        schema has been run and that NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
        are set.
        {materialError && <pre className="mt-2 whitespace-pre-wrap text-xs">{materialError.message}</pre>}
      </div>
    );
  }

  const [{ data: comments }, { data: approvals }] = await Promise.all([
    supabase
      .from("raw_material_comments")
      .select("*")
      .eq("raw_material_id", material.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("raw_material_approvals")
      .select("*")
      .eq("raw_material_id", material.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <RawMaterialWorkspaceClient
      material={material}
      initialComments={comments ?? []}
      initialApproval={approvals?.[0] ?? null}
    />
  );
}
