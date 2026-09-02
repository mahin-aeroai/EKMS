import { LfgPartnerSiteSurveyReportBridge } from "@/components/lfg/LfgPartnerSiteSurveyReportBridge";

// Thin server component whose only job is unwrapping the async `params`,
// same convention as every other dynamic-route page in this app (e.g.
// workspaces/site-survey-report/[reportId]/page.tsx, this route's staff
// counterpart). The actual editor can't be rendered from a Server
// Component with next/dynamic(..., { ssr: false }) -- that lives inside
// LfgPartnerSiteSurveyReportBridge.tsx instead, itself a Client Component.
export default async function LfgSiteSurveyReportEditorPage({ params }: { params: Promise<{ reportId: string }> }) {
  const { reportId } = await params;
  return <LfgPartnerSiteSurveyReportBridge reportId={reportId} />;
}
