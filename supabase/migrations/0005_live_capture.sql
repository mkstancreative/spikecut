-- SpikeCut · Live capture: record live streams, find moments while they happen, optionally auto-clip.
-- Apply in Supabase → SQL Editor.

-- Per-creator live settings.
alter table public.creators
  add column capture_live boolean not null default true,
  add column auto_clip boolean not null default false,
  add column auto_clip_min_score integer not null default 80 check (auto_clip_min_score between 1 and 99);

-- One row per recording of a live stream (a stream can have several if the recorder restarts).
create table public.live_sessions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  stream_id uuid not null references public.streams (id) on delete cascade,
  creator_id uuid not null references public.creators (id) on delete cascade,
  status text not null default 'recording' check (status in ('recording', 'stopped', 'failed')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  seconds_captured numeric(10, 1) not null default 0,
  seconds_analyzed numeric(10, 1) not null default 0,
  last_analyzed_at timestamptz,
  moments_found integer not null default 0,
  message text,
  error text
);
create index live_sessions_stream_idx on public.live_sessions (stream_id, started_at desc);
create index live_sessions_workspace_idx on public.live_sessions (workspace_id, status);

alter table public.live_sessions enable row level security;
create policy "members read live sessions" on public.live_sessions
  for select to authenticated using (public.is_member(workspace_id));

notify pgrst, 'reload schema';

-- Self-check: expect the table with rls_enabled = true and the three new creator columns.
select 'table' as kind, relname::text as name, relrowsecurity::text as detail
from pg_class where relnamespace = 'public'::regnamespace and relname = 'live_sessions'
union all
select 'column', column_name::text, data_type::text from information_schema.columns
where table_schema = 'public' and table_name = 'creators' and column_name in ('capture_live', 'auto_clip', 'auto_clip_min_score')
order by 1, 2;
