-- Addendum to supabase-knowledge-files-migration.sql (already run in
-- production). Adds source_url, for Knowledge-module rows whose real file
-- lives in Google Drive rather than being copied into R2.
--
-- Why: bulk-ingesting an entire Drive folder (dozens of files, some
-- multi-megabyte) by downloading each one's bytes and re-uploading to R2
-- isn't practical to do file-by-file through a chat session -- and Drive is
-- already the actual source of truth for these documents, so copying them
-- creates a second, driftable copy for no real benefit. Instead: extract
-- each file's text into content_text (already added by the prior
-- migration, used for AI Copilot grounding) and store source_url = the
-- original Drive viewUrl. The "View file" button on Documents/Drawings/SOPs
-- opens source_url directly when relative_path (the R2 path) isn't set.
--
-- relative_path (R2) and source_url (external link, e.g. Drive) are
-- mutually exclusive in practice but both nullable -- a row has at most one
-- of them set. Idempotent, safe to re-run.

alter table if exists public.documents add column if not exists source_url text;
alter table if exists public.drawings add column if not exists source_url text;
alter table if exists public.sops add column if not exists source_url text;

create unique index if not exists documents_source_url_key on public.documents (source_url) where source_url is not null;
create unique index if not exists drawings_source_url_key on public.drawings (source_url) where source_url is not null;
create unique index if not exists sops_source_url_key on public.sops (source_url) where source_url is not null;

select
  (select count(*) from public.documents where source_url is not null) as documents_with_source_url,
  (select count(*) from public.drawings where source_url is not null) as drawings_with_source_url,
  (select count(*) from public.sops where source_url is not null) as sops_with_source_url;
