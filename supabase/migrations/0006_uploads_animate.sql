-- SpikeCut · Animate: upload your own videos, render motion-graphics edits, post them (incl. TikTok).
-- Apply in Supabase → SQL Editor.
--
-- Also raise the project-wide upload limit (Dashboard → Storage → Settings → "Upload file size limit")
-- to at least the uploads bucket limit below; the free tier caps every file at 50 MB.

-- Uploaded videos are streams with no creator. The file lives in the uploads bucket at source_path.
alter table public.streams
  alter column creator_id drop not null,
  add column source_path text;

-- Which look a clip was rendered with. 'standard' is the original Clips render.
alter table public.clips
  add column style text not null default 'standard' check (style in ('standard', 'animated')),
  add column preset text;

-- Per-post platform options, e.g. TikTok privacy level.
alter table public.publications
  add column options jsonb not null default '{}';

-- ─────────────────────────────────────────── Storage
-- Browsers upload straight into <workspace_id>/… (resumable), since the API can't take large bodies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('uploads', 'uploads', false, 5368709120,
        array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'])
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Whole-video animated renders can be well over 50 MB.
update storage.buckets set file_size_limit = 2147483648 where id = 'clips';

drop policy if exists "members upload videos" on storage.objects;
create policy "members upload videos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members read uploads" on storage.objects;
create policy "members read uploads" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "members delete uploads" on storage.objects;
create policy "members delete uploads" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and public.is_member(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';

-- Self-check: expect the 4 new columns, the uploads bucket and its 3 policies.
select 'column' as kind, table_name || '.' || column_name as name, data_type::text as detail
from information_schema.columns
where table_schema = 'public'
  and ((table_name = 'streams' and column_name = 'source_path')
    or (table_name = 'clips' and column_name in ('style', 'preset'))
    or (table_name = 'publications' and column_name = 'options'))
union all
select 'bucket', id, file_size_limit::text from storage.buckets where id in ('uploads', 'clips')
union all
select 'policy', policyname::text, cmd::text from pg_policies
where schemaname = 'storage' and tablename = 'objects' and policyname like '%upload%'
order by 1, 2;
