import { getLfgIdentity } from "@/lib/lfg-auth";

// Placeholder LFG partner home -- the layout above already guarantees
// `identity` is non-null by the time this renders (it only renders
// `children` in that branch), so the fallbacks below are just belt-and-
// braces against the type, not a real code path. The real Site Master /
// Site 360 list (task #16 -- see the LFG portal task list) replaces this
// with a filtered, RLS-scoped table of the partner's assigned sites.
export default async function LfgHomePage() {
  const identity = await getLfgIdentity();

  return (
    <div className="rounded-lg border border-line bg-surface p-6 shadow-1">
      <h1 className="text-lg font-semibold text-ink">Welcome, {identity?.fullName || identity?.email}</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        Signed in for <span className="font-medium text-ink">{identity?.partnerName}</span>. Your assigned sites will
        appear here once the Site Master view is built.
      </p>
    </div>
  );
}
