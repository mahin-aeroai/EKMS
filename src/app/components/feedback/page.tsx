"use client";

import { useState } from "react";
import { Pencil, Trash2, Copy } from "lucide-react";
import { PageHeader, DemoSection } from "@/components/DemoSection";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Drawer } from "@/components/ui/Drawer";
import { ContextMenu } from "@/components/ui/ContextMenu";
import { NotificationCenter } from "@/components/ui/Notifications";
import { useToast } from "@/components/ui/Notifications";

export default function FeedbackPage() {
  const { toast } = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <div>
      <PageHeader
        title="Feedback & Overlays"
        description="Transient and blocking feedback: toasts, the persistent notification center, dialogs, drawers, and contextual menus."
      />

      <DemoSection title="Notifications (toast)" deliverable="Deliverable 3.6" description="Fixed bottom-right stack, auto-dismisses after 4 seconds.">
        <div className="flex flex-wrap gap-3">
          <Button variant="secondary" onClick={() => toast("success", "PO-MU-2026-004521 approved")}>Trigger success</Button>
          <Button variant="secondary" onClick={() => toast("warning", "Stock below safety threshold")}>Trigger warning</Button>
          <Button variant="secondary" onClick={() => toast("danger", "Sync failed — retrying")}>Trigger danger</Button>
          <Button variant="secondary" onClick={() => toast("info", "Report generation queued")}>Trigger info</Button>
          <Button variant="secondary" onClick={() => toast("ai", "AI found 3 related lessons learned")}>Trigger AI</Button>
        </div>
      </DemoSection>

      <DemoSection title="Notification Center" deliverable="Deliverable 3.6" description="The persistent list opened from the Top Nav's bell icon — unread items highlighted, action-required items tagged.">
        <NotificationCenter items={[
          { id: "n1", kind: "warning", title: "PO-MU-2026-004521 needs your approval", time: "10m ago", actionRequired: true },
          { id: "n2", kind: "success", title: "Sales Order SO-MU-2026-007812 confirmed", time: "1h ago", read: true },
          { id: "n3", kind: "ai", title: "AI flagged a shortage risk on RM-0231", time: "3h ago" },
        ]} />
      </DemoSection>

      <DemoSection title="Dialog" deliverable="Deliverable 3.6" description="Reserved for tasks completable in one screen — confirm, form, and alert variants.">
        <div className="flex flex-wrap gap-3">
          <Button variant="destructive" onClick={() => setConfirmOpen(true)}>Delete record</Button>
          <Button variant="secondary" onClick={() => setFormOpen(true)}>Open form dialog</Button>
        </div>
        <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Delete this record?" destructive confirmLabel="Delete" onConfirm={() => { setConfirmOpen(false); toast("danger", "Record deleted"); }}>
          <p className="text-sm text-ink-secondary">This action cannot be undone. The record and its version history will be permanently removed.</p>
        </Dialog>
        <Dialog open={formOpen} onClose={() => setFormOpen(false)} title="Quick edit" variant="form" onConfirm={() => { setFormOpen(false); toast("success", "Saved"); }}>
          <label className="block text-sm text-ink-secondary">
            Customer name
            <input className="mt-1 w-full rounded-md border border-line-strong bg-surface px-3 py-2 text-sm outline-none focus:border-primary" defaultValue="Reliance Retail Ltd" />
          </label>
        </Dialog>
      </DemoSection>

      <DemoSection title="Drawer" deliverable="Deliverable 3.6" description="Right-side slide-over for longer tasks that don't warrant a full page — the AI Assistant panel uses this same component.">
        <Button variant="secondary" onClick={() => setDrawerOpen(true)}>Open drawer</Button>
        <Drawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Record detail">
          <p className="text-sm text-ink-secondary">Drawer content — typically a focused edit form or a secondary record view.</p>
        </Drawer>
      </DemoSection>

      <DemoSection title="Context Menu" deliverable="Deliverable 3.6" description="Reached via a visible 'more actions' button, never right-click-only.">
        <ContextMenu items={[
          { label: "Edit", icon: <Pencil size={13} />, onSelect: () => toast("info", "Edit") },
          { label: "Duplicate", icon: <Copy size={13} />, onSelect: () => toast("info", "Duplicated") },
          { label: "Delete", icon: <Trash2 size={13} />, onSelect: () => toast("danger", "Deleted"), destructive: true },
        ]} />
      </DemoSection>
    </div>
  );
}
