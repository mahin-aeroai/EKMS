-- Fixes a real bug in the two prior Knowledge-files migrations
-- (supabase-knowledge-files-migration.sql and
-- supabase-knowledge-files-source-url-migration.sql): both created their
-- uniqueness indexes as PARTIAL indexes (`... WHERE relative_path IS NOT
-- NULL` / `... WHERE source_url IS NOT NULL`), reasoning that this was
-- needed to let multiple rows share a NULL value. That reasoning was wrong
-- -- standard SQL unique indexes already treat NULL as never equal to
-- NULL, so multiple NULLs are allowed with a plain (non-partial) unique
-- index too. The partial predicate bought nothing and broke something:
-- `INSERT ... ON CONFLICT (source_url) DO UPDATE` (used by
-- import-ikea-iway-documents.sql) and Supabase-js's
-- `.upsert(row, { onConflict: "relative_path" })` (used by
-- upload-knowledge-files.mjs) both generate a plain `ON CONFLICT (column)`
-- with no WHERE clause -- Postgres requires the ON CONFLICT target's
-- predicate to match the index's predicate EXACTLY to use it for conflict
-- inference, so a partial index is invisible to a plain ON CONFLICT clause.
-- Confirmed live: "ERROR: 42P10: there is no unique or exclusion
-- constraint matching the ON CONFLICT specification" when running
-- import-ikea-iway-documents.sql against the partial index.
--
-- Fix: drop the 6 partial indexes, recreate all 6 as plain unique indexes.
-- Idempotent, safe to re-run. Run this, then re-run
-- import-ikea-iway-documents.sql (unchanged -- it already uses a plain
-- ON CONFLICT (source_url) DO UPDATE, which will now match correctly).

drop index if exists public.documents_relative_path_key;
drop index if exists public.drawings_relative_path_key;
drop index if exists public.sops_relative_path_key;
drop index if exists public.documents_source_url_key;
drop index if exists public.drawings_source_url_key;
drop index if exists public.sops_source_url_key;

create unique index if not exists documents_relative_path_key on public.documents (relative_path);
create unique index if not exists drawings_relative_path_key on public.drawings (relative_path);
create unique index if not exists sops_relative_path_key on public.sops (relative_path);
create unique index if not exists documents_source_url_key on public.documents (source_url);
create unique index if not exists drawings_source_url_key on public.drawings (source_url);
create unique index if not exists sops_source_url_key on public.sops (source_url);

-- Verification: these should all succeed with no error (proves the plain
-- unique indexes correctly allow multiple NULLs to coexist).
insert into public.documents (title, category) values ('__index_test_a__', 'Other');
insert into public.documents (title, category) values ('__index_test_b__', 'Other');
delete from public.documents where title in ('__index_test_a__', '__index_test_b__');

select
  indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and indexname in (
    'documents_relative_path_key', 'drawings_relative_path_key', 'sops_relative_path_key',
    'documents_source_url_key', 'drawings_source_url_key', 'sops_source_url_key'
  )
order by indexname;
