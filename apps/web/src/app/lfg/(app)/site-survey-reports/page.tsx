"use client";

import dynamic from "next/dynamic";
import { useLfgHost, lfgHref } from "@/lib/lfg-links";

// Same ssr:false reasoning as the staff list page
// (workspaces/site-survey-report/page.tsx) -- this page doesn't itself
// touch pdf-lib/pdfjs-dist, but keeping the whole tool on one
// client-only pattern avoids a mixed-rendering trap later. No
// ToolAccessGuard here -- the real gate for /lfg/(app)/* is
// getLfgIdentity() in this app's own layout.tsx.
const SiteSurveyReportsListClient = dynamic(
  () => import("@/components/siteSurveyReport/SiteSurveyReportsListClient").then((m) => m.SiteSurveyReportsListClient),
  {
    ssr: false,
    loading: () => <p className="py-10 text-center text-sm text-ink-muted">Loading Site Survey Reports…</p>,
  }
);

export default function LfgSiteSurveyReportsPage() {
  const onLfgHost = useLfgHost();
  return (
    <SiteSurveyReportsListClient
      basePath={lfgHref("/site-survey-reports", onLfgHost)}
      homeHref={lfgHref("/", onLfgHost)}
      hideDefaultsLink
    />
  );
}
