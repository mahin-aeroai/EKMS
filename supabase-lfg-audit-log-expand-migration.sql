-- ============================================================
-- LFG Connect: expand lfg_audit_log to cover uploads + more tables
-- ============================================================
--
-- supabase-lfg-site-management-schema.sql's STEP 17 attaches the generic
-- lfg_audit_log_row() trigger to a fixed list of tables (audited_tables):
-- originally just lfg_sites, lfg_site_financials, lfg_installations,
-- lfg_installation_costs, lfg_shipments, lfg_production, lfg_partners.
--
-- That list never included lfg_site_documents (the table Site Survey /
-- Installation Report uploads actually write to -- see LfgSiteCardGrid.tsx
-- and LfgSiteWorkspaceClient.tsx's Documents tab) or lfg_site_surveys (the
-- structured survey-measurements form), so neither ever showed up in the
-- audit log at all -- a document upload was invisible to it. Also adding
-- lfg_installation_photos, lfg_issues, and lfg_deactivation_requests, the
-- remaining site-scoped tables a staff member's day-to-day actions touch
-- that weren't being logged either. This is what the new LFG Connect home
-- page Activity feed (LfgActivityFeed.tsx) reads from.
--
-- Idempotent and safe to re-run: DROP TRIGGER IF EXISTS + CREATE TRIGGER
-- per table, exactly the same pattern the original DO block in the master
-- schema file uses. Existing rows in lfg_audit_log are untouched -- this
-- only changes what gets logged FROM NOW ON. Run this once in the
-- Supabase SQL Editor; no need to re-run the entire master schema file.

DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    'lfg_sites', 'lfg_site_financials', 'lfg_installations', 'lfg_installation_costs',
    'lfg_shipments', 'lfg_production', 'lfg_partners',
    'lfg_site_documents', 'lfg_site_surveys', 'lfg_installation_photos',
    'lfg_issues', 'lfg_deactivation_requests'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_audit_trigger', t);
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.lfg_audit_log_row()',
      t || '_audit_trigger', t
    );
  END LOOP;
END $$;
