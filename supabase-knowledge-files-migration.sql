-- Adds real file-storage + AI-grounding columns to the 3 Knowledge module
-- tables (documents, drawings, sops), which until now only held
-- illustrative metadata rows (title/summary/tags, no actual file). Mirrors
-- the pattern already used for apple_lfg_site_surveys: files live in
-- Cloudflare R2 (relative_path is the R2 object key), Postgres only stores
-- metadata + extracted text. Idempotent (safe to re-run) via
-- `ADD COLUMN IF NOT EXISTS`.
--
-- content_text holds extracted plain text (PDF/DOCX text layer, OCR'd where
-- needed) so the AI Copilot's search_knowledge_base tool can ground answers
-- in the actual file contents, not just title/tags -- same reasoning as
-- every other AI Copilot tool in this app: real data in, real citations out.
--
-- Run this AFTER supabase-role-based-rls-migration.sql and
-- supabase-module-access-migration.sql (both already live) -- it does not
-- touch RLS itself, since documents/drawings/sops already have role+group
-- policies from supabase-remaining-modules-schema.sql /
-- supabase-module-access-migration.sql (Knowledge group). New columns
-- inherit those same policies automatically; no new RLS needed.

alter table if exists public.documents
  add column if not exists category text,
  add column if not exists file_name text,
  add column if not exists relative_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists content_text text,
  add column if not exists uploaded_at timestamptz;

alter table if exists public.drawings
  add column if not exists category text,
  add column if not exists file_name text,
  add column if not exists relative_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists content_text text,
  add column if not exists uploaded_at timestamptz;

alter table if exists public.sops
  add column if not exists category text,
  add column if not exists file_name text,
  add column if not exists relative_path text,
  add column if not exists file_size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists content_text text,
  add column if not exists uploaded_at timestamptz;

-- relative_path doubles as the R2 object key (see upload-knowledge-files.mjs)
-- -- unique per table when set, same idempotency pattern as
-- apple_lfg_site_surveys.relative_path, so re-running an import/upload never
-- creates duplicate rows for the same file.
create unique index if not exists documents_relative_path_key on public.documents (relative_path) where relative_path is not null;
create unique index if not exists drawings_relative_path_key on public.drawings (relative_path) where relative_path is not null;
create unique index if not exists sops_relative_path_key on public.sops (relative_path) where relative_path is not null;

-- Verification query -- run after applying, confirm the new columns exist
-- and (once files are imported) row counts with a real file attached.
select
  (select count(*) from public.documents) as documents_total,
  (select count(*) from public.documents where relative_path is not null) as documents_with_file,
  (select count(*) from public.drawings) as drawings_total,
  (select count(*) from public.drawings where relative_path is not null) as drawings_with_file,
  (select count(*) from public.sops) as sops_total,
  (select count(*) from public.sops where relative_path is not null) as sops_with_file;
