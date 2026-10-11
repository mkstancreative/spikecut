-- SpikeCut · Phase 4: moment detection + clip rendering.
-- Apply in Supabase → SQL Editor.

-- Per-video analysis state, shown on the Clips page.
alter table public.streams
  add column analysis_status text not null default 'none'
    check (analysis_status in ('none', 'queued', 'running', 'done', 'failed')),
  add column analysis_message text,
  add column analyzed_at timestamptz;

-- ─────────────────────────────────────────── Job queue
-- A tiny Postgres queue (no Redis needed). Workers claim jobs with claim_job().

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  type text not null check (type in ('analyze', 'render')),
  payload jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  progress integer not null default 0,
  message text,
  attempts integer not null default 0,
  locked_by text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index jobs_queue_idx on public.jobs (created_at) where status = 'queued';

create or replace function public.claim_job(worker text)
returns setof public.jobs
language sql security definer set search_path = ''
as $$
  update public.jobs j
  set status = 'running', locked_by = worker, started_at = now(), attempts = j.attempts + 1
  where j.id = (
    select q.id from public.jobs q
    where q.status = 'queued'
    order by q.created_at
    for update skip locked
    limit 1
  )
  returning j.*;
$$;
revoke execute on function public.claim_job(text) from public, anon, authenticated;

-- ─────────────────────────────────────────── Moments & clips

create table public.moments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  stream_id uuid not null references public.streams (id) on delete cascade,
  start_seconds numeric(10, 2) not null,
  end_seconds numeric(10, 2) not null,
  score integer not null,
  title text,
  transcript text,
  signals jsonb not null default '{}', -- scoring breakdown + word timings for captions
  status text not null default 'detected'
    check (status in ('detected', 'queued', 'rendering', 'rendered', 'failed')),
  created_at timestamptz not null default now()
);
create index moments_stream_idx on public.moments (stream_id, score desc);

create table public.clips (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  moment_id uuid not null unique references public.moments (id) on delete cascade,
  stream_id uuid not null references public.streams (id) on delete cascade,
  video_path text,
  thumbnail_path text,
  duration_seconds numeric(8, 2),
  width integer,
  height integer,
  status text not null default 'rendering' check (status in ('rendering', 'ready', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index clips_workspace_idx on public.clips (workspace_id, created_at desc);

alter table public.jobs enable row level security;
alter table public.moments enable row level security;
alter table public.clips enable row level security;

create policy "members read jobs" on public.jobs
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read moments" on public.moments
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read clips" on public.clips
  for select to authenticated using (public.is_member(workspace_id));

-- ─────────────────────────────────────────── Storage
-- Private bucket; files live at <workspace_id>/<clip_id>.mp4 so members can create signed URLs.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('clips', 'clips', false, 52428800, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "members read clip files" on storage.objects;
create policy "members read clip files" on storage.objects
  for select to authenticated
  using (bucket_id = 'clips' and public.is_member(((storage.foldername(name))[1])::uuid));

notify pgrst, 'reload schema';

-- Self-check: expect 3 tables with rls_enabled = true, the claim_job function, and the clips bucket.
select 'table' as kind, relname::text as name, relrowsecurity::text as detail
from pg_class where relnamespace = 'public'::regnamespace and relname in ('jobs', 'moments', 'clips')
union all
select 'function', proname::text, null from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'claim_job'
union all
select 'bucket', id, case when public then 'public' else 'private' end from storage.buckets where id = 'clips'
order by 1, 2;
