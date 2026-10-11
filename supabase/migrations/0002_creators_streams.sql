-- SpikeCut · Phase 3: creators being watched, and the streams/videos we've seen from them.
-- Apply in Supabase → SQL Editor. Writes go through the API (service role) so plan limits are enforced.

create table public.creators (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'twitch', 'kick')),
  channel_id text not null,
  handle text,
  display_name text not null,
  avatar_url text,
  channel_url text not null,
  active boolean not null default true,
  is_live boolean not null default false,
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (workspace_id, platform, channel_id)
);
create index creators_active_idx on public.creators (platform) where active;

create table public.streams (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.creators (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null,
  external_id text not null, -- YouTube video id / Twitch stream or video id
  kind text not null check (kind in ('live', 'vod', 'upload')),
  status text not null check (status in ('live', 'upcoming', 'ended', 'available')),
  title text,
  thumbnail_url text,
  url text not null,
  viewer_count integer,
  duration_seconds integer,
  started_at timestamptz,
  ended_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (creator_id, external_id)
);
create index streams_workspace_idx on public.streams (workspace_id, status, published_at desc);

alter table public.creators enable row level security;
alter table public.streams enable row level security;

create policy "members read creators" on public.creators
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read streams" on public.streams
  for select to authenticated using (public.is_member(workspace_id));

notify pgrst, 'reload schema';

-- Self-check: expect both tables with rls_enabled = true.
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relname in ('creators', 'streams');
