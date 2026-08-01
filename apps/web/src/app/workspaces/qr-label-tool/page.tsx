"use client";

import dynamic from "next/dynamic";
import { ToolAccessGuard } from "@/components/ToolAccessGuard";

// Canvas rendering only makes sense in the browser, and this tool never
// sends anything to a server — everything happens on the visitor's
// machine, same reasoning as the Cut File Tool next to it in the nav.
const QrLabelToolClient = dynamic(() => import("@/components/qrlabel/QrLabelToolClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading QR Label Tool…</p>,
});

export default function QrLabelToolPage() {
  return (
    <ToolAccessGuard toolId="qr-label-tool" toolLabel="QR Label Tool">
      <QrLabelToolClient />
    </ToolAccessGuard>
  );
}
