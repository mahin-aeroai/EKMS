"use client";

import { Sparkles } from "lucide-react";
import { Button } from "./Button";
import { Badge } from "./Badge";
import { WorkflowTimeline, type WorkflowStage } from "./WorkflowTimeline";

/**
 * Approval Panel — Deliverable 3.5
 * Purpose: present a pending approval with full context for decisioning.
 * Behaviour: Approve/Reject/Delegate actions route through the Workflow Engine.
 * Usage rule: always shows the full record context inline — an approver should never
 * need to leave the panel to decide.
 * AI Integration: AI provides a recommendation with rationale, never an auto-decision
 * (Human Approval is the one non-negotiable guardrail in the AI Interaction Model).
 */
export function ApprovalPanel({
  title,
  requestedBy,
  value,
  stages,
  aiRecommendation,
  onApprove,
  onReject,
  onDelegate,
  canDecide = true,
}: {
  title: string;
  requestedBy: string;
  value: string;
  stages: WorkflowStage[];
  aiRecommendation?: string;
  onApprove: () => void;
  onReject: () => void;
  onDelegate: () => void;
  /** Set to false to hide the Approve/Reject/Delegate actions (e.g. for a Viewer-role user). Defaults to true. */
  canDecide?: boolean;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-sm font-semibold text-ink">{title}</h4>
          <p className="text-xs text-ink-muted">Requested by {requestedBy}</p>
        </div>
        <Badge status="warning">Pending your approval</Badge>
      </div>
      <p className="text-lg font-bold text-ink">{value}</p>
      <WorkflowTimeline stages={stages} />
      {aiRecommendation && (
        <div className="rounded-md bg-ai-tint p-3 text-sm text-ai">
          <p className="mb-1 flex items-center gap-1.5 font-semibold">
            <Sparkles size={12} /> AI Recommendation
          </p>
          {aiRecommendation}
        </div>
      )}
      {canDecide ? (
        <div className="flex gap-2">
          <Button size="sm" onClick={onApprove}>
            Approve
          </Button>
          <Button size="sm" variant="destructive" onClick={onReject}>
            Reject
          </Button>
          <Button size="sm" variant="secondary" onClick={onDelegate}>
            Delegate
          </Button>
        </div>
      ) : (
        <p className="text-xs text-ink-muted">You have read-only access and can&apos;t decide on this approval.</p>
      )}
    </div>
  );
}
