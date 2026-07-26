"use client";

import dynamic from "next/dynamic";

// pdfjs-dist touches browser-only APIs (DOMMatrix, Path2D, etc.) at module
// evaluation time, which don't exist in the Node.js environment Next.js
// uses to prerender pages during `next build`. Loading the real page with
// ssr: false keeps it out of the server render entirely -- it only ever
// runs in the browser, which is also where we want it: this tool never
// sends files anywhere, everything happens on the visitor's machine.
const CutFileToolClient = dynamic(() => import("@/components/cutfile/CutFileToolClient"), {
  ssr: false,
  loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Cut File Tool…</p>,
});

export default function CutFileToolPage() {
  return <CutFileToolClient />;
}
