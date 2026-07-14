"use client";

import { Building2, Search } from "lucide-react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import {
  Card,
  StatCard,
  AICard,
  EntityCard,
  SearchCard,
  KnowledgeCard,
  CitationCard,
  AIFeedback,
} from "@/components/ui/Card";
import { useToast } from "@/components/ui/Notifications";

export default function CardsPage() {
  const { toast } = useToast();

  return (
    <div>
      <PageHeader
        title="Cards"
        description="The base surface for grouped content, plus the specialized card variants used across workspaces and Enterprise Search."
      />

      <DemoSection title="Card (base)" deliverable="Deliverable 3.2">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card padding="sm"><p className="text-sm text-ink-secondary">Small padding</p></Card>
          <Card padding="md"><p className="text-sm text-ink-secondary">Medium padding (default)</p></Card>
          <Card padding="lg"><p className="text-sm text-ink-secondary">Large padding</p></Card>
        </div>
      </DemoSection>

      <DemoSection title="Stat Card" deliverable="Deliverable 3.2" description="A single KPI with trend direction and an optional AI-generated insight banner.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard label="On-Time Delivery" value="94.2%" trend="up" trendLabel="+2.1 pts vs last month" />
          <StatCard label="Machine OEE — Line 3" value="71%" trend="down" trendLabel="-4 pts vs target" aiInsight="Trending toward the 65% threshold that historically precedes a bearing failure on this line." />
          <StatCard label="Open NCRs" value="12" trend="flat" trendLabel="No change" />
        </div>
      </DemoSection>

      <DemoSection title="AI Card" deliverable="Deliverable 3.2 / 7" description="Insight, Recommendation and Summary variants — the standard container for any AI-generated content, always paired with Accept/Dismiss and a citation.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <AICard variant="insight" title="Demand spike detected" citation="Sales Order history, last 90 days" onAccept={() => toast("success", "Insight accepted")} onDismiss={() => toast("info", "Insight dismissed")}>
            PVC-free vinyl demand is up 34% quarter-over-quarter, concentrated in IKEA project orders.
          </AICard>
          <AICard variant="recommendation" title="Reorder Raw Material RM-0231" citation="Inventory Master, Reorder Policy" onAccept={() => toast("success", "Reorder queued")} onDismiss={() => toast("info", "Recommendation dismissed")}>
            Stock will fall below safety threshold in 6 days at current consumption rate.
          </AICard>
          <AICard variant="summary" title="Version diff summary" citation="Document DOC-SOP-0044, v3 → v4">
            Section 4.2 tolerance changed from ±0.3mm to ±0.2mm; two new inspection steps added.
          </AICard>
        </div>
      </DemoSection>

      <DemoSection title="Entity Card" deliverable="Deliverable 3.2" description="Summarizes any master record — Customer, Machine, Raw Material, Project — uniformly. The restricted state masks fields for role-based visibility instead of hiding the record.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <EntityCard icon={<Building2 size={18} />} title="Reliance Retail Ltd" subtitle="Customer — CUST-MU-002104" status="success" statusLabel="Active" chips={["Retail", "Mumbai Region", "Net 45", "Tier 1"]} />
          <EntityCard icon={<Building2 size={18} />} title="Injection Molding Machine M-14" subtitle="Machine — MC-MU-000891" status="warning" statusLabel="PM Due" chips={["Line 3", "OEE 71%", "MTBF 412h"]} />
          <EntityCard icon={<Building2 size={18} />} title="Customer Contract — Confidential" subtitle="Customer — CUST-MU-002210" restricted />
        </div>
      </DemoSection>

      <DemoSection title="Search Card" deliverable="Deliverable 3.4" description="One Enterprise Search result — used inside the Search Results page.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SearchCard icon={<Search size={14} />} entityType="Project" title="IKEA Wardrobe Program — Phase 2" snippet="Cross-functional project covering tooling, molding and assembly for the IKEA PAX wardrobe line." aiRationale="Matched because 3 of your last 5 searches referenced IKEA projects." />
          <SearchCard icon={<Search size={14} />} entityType="Raw Material" title="RM-0231 — PVC-Free Vinyl Sheet" snippet="ICC profile: ISO Coated v2. Compatible substrates: BOPP 20µ, PET 12µ." />
        </div>
      </DemoSection>

      <DemoSection title="Knowledge Card" deliverable="Deliverable 3.2" description="Lesson Learned, Engineering Note, and FAQ — the atomic unit of the Knowledge Graph's tacit-knowledge layer.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KnowledgeCard type="Lesson Learned" title="Tooling misalignment on M-14" source="NCR-2025-0442">
            Root cause was a worn locating pin, not the operator error initially logged — replace pins every 6 months on this machine model.
          </KnowledgeCard>
          <KnowledgeCard type="Engineering Note" title="ICC profile mismatch on proofing" source="Print Ops, June 2026">
            Always verify the customer&apos;s supplied ICC profile against press calibration before running IKEA jobs.
          </KnowledgeCard>
          <KnowledgeCard type="FAQ" title="What's our standard PO approval threshold?">
            Purchase Orders above ₹5,00,000 require Plant Head approval per the current Approval Matrix.
          </KnowledgeCard>
        </div>
      </DemoSection>

      <DemoSection title="Citation Card & AI Feedback" deliverable="Deliverable 3.2 / 7" description="The trust mechanism behind every AI answer: numbered sources plus a thumbs up/down control.">
        <div className="flex flex-col gap-3">
          <CitationCard sources={["Customer Master — Reliance Retail", "Sales Order SO-MU-2026-007812", "Approval Matrix v6"]} />
          <AIFeedback onFeedback={(pos) => toast(pos ? "success" : "info", pos ? "Thanks — feedback recorded" : "Feedback recorded, we'll refine this")} />
        </div>
      </DemoSection>
    </div>
  );
}
