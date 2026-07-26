import { redirect } from "next/navigation";

// "Projects" (sponsor/budget-utilization/schedule-health) never matched how
// MMDI actually works — the real unit of work is a job order. This route is
// kept only so old links/bookmarks to /workspaces/project still land
// somewhere. See src/app/workspaces/job-orders/page.tsx for the real
// workspace, and PROJECT_STATUS.md for the full story (the underlying
// projects/project_comments/project_approvals tables are left in place,
// unused, rather than dropped).
export default function ProjectWorkspaceRedirect() {
  redirect("/workspaces/job-orders");
}
