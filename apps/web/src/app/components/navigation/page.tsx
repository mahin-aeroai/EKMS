import { Building2, Package, FolderKanban } from "lucide-react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import { Breadcrumbs } from "@/components/ui/Breadcrumbs";
import { Tabs } from "@/components/ui/Tabs";
import { SearchResults } from "@/components/ui/SearchResults";

export default function NavigationPage() {
  return (
    <div>
      <PageHeader
        title="Navigation"
        description="Breadcrumbs, in-workspace Tabs, and the full Enterprise Search results view. Sidebar, Command Palette (⌘K) and Top Nav are already live in this app shell — try ⌘K now."
      />

      <DemoSection title="Breadcrumbs" deliverable="Deliverable 3.4">
        <Breadcrumbs items={[
          { label: "Home", href: "/" },
          { label: "Customers", href: "/components/navigation" },
          { label: "Reliance Retail Ltd" },
        ]} />
      </DemoSection>

      <DemoSection title="Tabs" deliverable="Deliverable 3.4" description="The mechanism behind every section of the Universal Workspace Pattern — Overview, Insights, Timeline, Documents.">
        <Tabs items={[
          { id: "overview", label: "Overview", content: <p className="pt-4 text-sm text-ink-secondary">Customer profile, key contacts, and account health.</p> },
          { id: "insights", label: "Insights", content: <p className="pt-4 text-sm text-ink-secondary">AI-surfaced patterns: order cadence, churn risk, upsell signals.</p> },
          { id: "timeline", label: "Timeline", content: <p className="pt-4 text-sm text-ink-secondary">Every interaction and status change, in order.</p> },
          { id: "documents", label: "Documents", content: <p className="pt-4 text-sm text-ink-secondary">Contracts, quotes, and correspondence attached to this record.</p> },
          { id: "restricted", label: "Finance (restricted)", content: <p className="pt-4 text-sm text-ink-secondary">Not visible to your role.</p>, disabled: true },
        ]} />
      </DemoSection>

      <DemoSection title="Search Results" deliverable="Deliverable 3.4" description="Full-page Enterprise Search results, grouped by entity type, with an AI-generated direct answer for question-phrased queries.">
        <SearchResults
          query="who supplies PVC-free vinyl"
          aiAnswer="Two approved suppliers currently ship PVC-free vinyl: Cosmo Films (BOPP 20µ) and UFlex Ltd (PET 12µ). Cosmo Films has the shorter average lead time (9 days vs 14)."
          groups={[
            {
              entityType: "Raw Material",
              icon: <Package size={13} />,
              results: [
                { id: "r1", title: "RM-0231 — PVC-Free Vinyl Sheet", snippet: "Supplied by Cosmo Films and UFlex Ltd. ICC profile: ISO Coated v2.", aiRationale: "Directly matches the material type in your query." },
              ],
            },
            {
              entityType: "Customer",
              icon: <Building2 size={13} />,
              results: [
                { id: "r2", title: "IKEA India", snippet: "3 open projects specify PVC-free substrates as a sustainability requirement." },
              ],
            },
            {
              entityType: "Project",
              icon: <FolderKanban size={13} />,
              results: [
                { id: "r3", title: "IKEA Wardrobe Program — Phase 2", snippet: "BOM references RM-0231 for the rear panel liner." },
              ],
            },
          ]}
        />
      </DemoSection>
    </div>
  );
}
