-- SpikeCut · one video library: creators' videos and your own uploads are "source" videos you can
-- find moments in or cartoonify. Each cartoon is its own "cartoon" stream that points back at its source.
-- Apply in Supabase → SQL Editor.

alter table public.streams
  add column if not exists role text not null default 'source' check (role in ('source', 'cartoon')),
  add column if not exists source_stream_id uuid references public.streams (id) on delete cascade;

-- Every upload made before this was created directly as a cartoon (it has its own cartoonify job).
-- Safe to re-run: plain uploads added later never have a cartoonify job of their own.
update public.streams s set role = 'cartoon'
where s.creator_id is null and s.role = 'source'
  and exists (select 1 from public.jobs j where j.type = 'cartoonify' and j.payload ->> 'streamId' = s.id::text);

create index if not exists streams_source_idx on public.streams (source_stream_id) where source_stream_id is not null;
create index if not exists streams_library_idx on public.streams (workspace_id, role, published_at desc);

notify pgrst, 'reload schema';

-- Self-check: expect the two new columns.
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'streams' and column_name in ('role', 'source_stream_id');
