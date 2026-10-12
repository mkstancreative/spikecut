-- SpikeCut · Phase 5: connected social accounts + scheduled publishing.
-- Apply in Supabase → SQL Editor.

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  platform text not null check (platform in ('youtube', 'instagram', 'facebook', 'tiktok')),
  external_id text not null, -- YouTube channel id / IG user id / Facebook page id
  display_name text not null,
  handle text,
  avatar_url text,
  -- Tokens are AES-GCM encrypted by the server (TOKEN_ENCRYPTION_KEY) and never readable by browsers.
  access_token_enc text,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb not null default '{}', -- e.g. the Facebook page an Instagram account publishes through
  status text not null default 'active' check (status in ('active', 'reconnect', 'disabled')),
  last_error text,
  connected_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, platform, external_id)
);

create table public.publications (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  clip_id uuid not null references public.clips (id) on delete cascade,
  social_account_id uuid not null references public.social_accounts (id) on delete cascade,
  platform text not null,
  title text,
  caption text,
  scheduled_at timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'publishing', 'published', 'failed', 'cancelled')),
  attempts integer not null default 0,
  platform_post_id text,
  permalink text,
  error text,
  published_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clip_id, social_account_id)
);
create index publications_due_idx on public.publications (scheduled_at) where status = 'scheduled';
create index publications_workspace_idx on public.publications (workspace_id, scheduled_at);

-- Worker grabs posts that are due; skip-locked so two workers never post the same thing twice.
create or replace function public.claim_due_publications(max_count integer)
returns setof public.publications
language sql security definer set search_path = ''
as $$
  update public.publications p
  set status = 'publishing', attempts = p.attempts + 1, updated_at = now()
  where p.id in (
    select q.id from public.publications q
    where q.status = 'scheduled' and q.scheduled_at <= now()
    order by q.scheduled_at
    for update skip locked
    limit max_count
  )
  returning p.*;
$$;
revoke execute on function public.claim_due_publications(integer) from public, anon, authenticated;

alter table public.social_accounts enable row level security;
alter table public.publications enable row level security;

create policy "members read social accounts" on public.social_accounts
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read publications" on public.publications
  for select to authenticated using (public.is_member(workspace_id));

-- Column-level lock-down: browsers can see account names, never the token columns.
revoke select on public.social_accounts from anon, authenticated;
grant select (id, workspace_id, platform, external_id, display_name, handle, avatar_url, token_expires_at,
              meta, status, last_error, created_at, updated_at)
  on public.social_accounts to authenticated;

notify pgrst, 'reload schema';

-- Self-check: expect 2 tables with rls_enabled = true and the claim function.
select 'table' as kind, relname::text as name, relrowsecurity::text as detail
from pg_class where relnamespace = 'public'::regnamespace and relname in ('social_accounts', 'publications')
union all
select 'function', proname::text, null from pg_proc
where pronamespace = 'public'::regnamespace and proname = 'claim_due_publications'
order by 1, 2;
