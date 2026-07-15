import { type ProjectRow } from "@/lib/supabase";
import { createServerSupabaseClient } from "@/lib/supabase-server";
import { ProjectWorkspaceClient } from "@/components/workspaces/ProjectWorkspaceClient";

// Always fetch fresh data from Supabase — this workspace is no longer a static demo.
export const dynamic = "force-dynamic";

export default async function ProjectWorkspacePage() {
  const supabase = await createServerSupabaseClient();

  const { data: rows, error: projectError } = await supabase
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1);

  const project = rows?.[0] as ProjectRow | undefined;

  if (projectError || !project) {
    return (
      <div className="rounded-lg border border-danger/30 bg-danger-tint p-6 text-sm text-danger">
        Couldn&apos;t load a project from Supabase. Confirm the project workspace schema has
        been run and that NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are set.
        {projectError && <pre className="mt-2 whitespace-pre-wrap text-xs">{projectError.message}</pre>}
      </div>
    );
  }

  const [{ data: comments }, { data: approvals }] = await Promise.all([
    supabase
      .from("project_comments")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("project_approvals")
      .select("*")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false }),
  ]);

  return (
    <ProjectWorkspaceClient
      project={project}
      initialComments={comments ?? []}
      initialApproval={approvals?.[0] ?? null}
    />
  );
}
