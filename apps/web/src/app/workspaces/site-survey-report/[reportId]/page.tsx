import { SiteSurveyReportEditorPageClient } from "@/components/siteSurveyReport/SiteSurveyReportEditorPageClient";

// Thin server component whose only job is unwrapping the async `params`
// (Next's convention for every dynamic-route page in this app, e.g.
// workspaces/lfg/sites/[siteId]/page.tsx) and handing the plain reportId
// string down to a client component. The actual editor can't be rendered
// from a Server Component with `next/dynamic(..., { ssr: false })` --
// Next disallows `ssr: false` inside a Server Component file -- so that
// import (and the pdf-lib/pdfjs-dist-touching code it eventually pulls in,
// same reasoning as workspaces/installation-report/page.tsx and
// workspaces/cut-file-tool/page.tsx) lives in
// SiteSurveyReportEditorPageClient.tsx instead, which is itself a Client
// Component.
export default async function SiteSurveyReportEditorPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <SiteSurveyReportEditorPageClient reportId={reportId} />;
}
