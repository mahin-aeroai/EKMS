"use client";

import { useState } from "react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import { Comments, type Comment } from "@/components/ui/Comments";
import { ApprovalPanel } from "@/components/ui/ApprovalPanel";
import { useToast } from "@/components/ui/Notifications";

const INITIAL_COMMENTS: Comment[] = [
  { id: "c1", author: "Priya Nair", content: "Can we confirm the tolerance on the rear panel before we quote?", time: "2 days ago", resolved: true },
  { id: "c2", author: "Arjun Rao", content: "Confirmed with engineering — ±0.2mm per the latest SOP revision.", time: "2 days ago" },
  { id: "c3", author: "AI Assistant", content: "Flagging: this differs from the tolerance used on the last IKEA order (±0.3mm).", time: "1 day ago" },
  { id: "c4", author: "Priya Nair", content: "Good catch — updating the quote now.", time: "6 hours ago" },
];

export default function CollaborationPage() {
  const [comments, setComments] = useState(INITIAL_COMMENTS);
  const { toast } = useToast();

  return (
    <div>
      <PageHeader
        title="Collaboration"
        description="Discussion and decisioning primitives available uniformly across every record type."
      />

      <DemoSection title="Comments" deliverable="Deliverable 3.5" description="Threaded discussion attached to any record; a 'Summarize this thread' affordance appears past three comments.">
        <Comments comments={comments} onAdd={(text) => setComments((c) => [...c, { id: crypto.randomUUID(), author: "You", content: text, time: "just now" }])} />
      </DemoSection>

      <DemoSection title="Approval Panel" deliverable="Deliverable 3.5" description="AI provides a recommendation with rationale, never an auto-decision — Human Approval is the one non-negotiable guardrail in the AI Interaction Model.">
        <ApprovalPanel
          title="Purchase Order PO-MU-2026-004521"
          requestedBy="Arjun Rao, Procurement"
          value="₹6,80,000 — Cosmo Films Ltd"
          aiRecommendation="Spend is within the approved supplier's contracted rate card and within your delegated authority. No exceptions detected."
          stages={[
            { id: "s1", label: "Submitted", status: "complete", actor: "Arjun Rao", timestamp: "10 Jul" },
            { id: "s2", label: "Your Approval", status: "current" },
            { id: "s3", label: "Finance Sign-off", status: "upcoming" },
          ]}
          onApprove={() => toast("success", "PO-MU-2026-004521 approved")}
          onReject={() => toast("danger", "PO-MU-2026-004521 rejected")}
          onDelegate={() => toast("info", "Delegated to Finance Manager")}
        />
      </DemoSection>
    </div>
  );
}
