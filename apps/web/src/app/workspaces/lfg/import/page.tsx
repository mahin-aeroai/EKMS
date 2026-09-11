"use client";

import dynamic from "next/dynamic";

// exceljs's browser build touches File/ArrayBuffer APIs that don't exist in
// the Node.js environment Next.js uses to prerender pages during `next
// build` -- same reasoning as Distribution's own import page. ssr: false
// keeps it out of the server render; the whole import happens client-side.
// No ToolAccessGuard here -- LFG Connect's other pages (Site Master, New
// Site, ...) aren't gated by one either; access to /workspaces/lfg itself
// is what controls this.
const LfgSiteImportClient = dynamic(() => import("@/components/workspaces/LfgSiteImportClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading import…</p>,
});

export default function LfgSiteImportPage() {
  return <LfgSiteImportClient />;
}
