-- SpikeCut · Phase 2: accounts, workspaces, billing, credits
-- Apply in Supabase → SQL Editor (or `supabase db push` once the CLI is linked).

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────── Accounts

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  country text,
  currency text not null default 'NGN' check (currency in ('NGN', 'GHS', 'USD')),
  onboarded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Billing belongs to a workspace (not a user) so agencies can share one plan across seats.
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete cascade,
  paystack_customer_code text unique,
  created_at timestamptz not null default now()
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

-- ─────────────────────────────────────────── Billing

-- Paystack plan codes per (plan, currency). Filled by scripts/paystack-sync-plans.ts.
create table public.paystack_plans (
  plan_id text not null,
  currency text not null,
  amount integer not null, -- minor units (kobo / pesewas / cents)
  plan_code text not null unique,
  primary key (plan_id, currency)
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid references auth.users (id) on delete set null,
  reference text not null unique,
  kind text not null check (kind in ('day_pass', 'subscription')),
  plan_id text not null,
  currency text not null,
  amount integer not null, -- minor units
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'abandoned')),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_workspace_idx on public.payments (workspace_id, created_at desc);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  plan_id text not null,
  currency text not null,
  -- Mirrors Paystack: active | non-renewing | attention | completed | cancelled
  status text not null,
  paystack_subscription_code text not null unique,
  paystack_email_token text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subscriptions_workspace_idx on public.subscriptions (workspace_id);

create table public.day_passes (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  payment_reference text not null unique references public.payments (reference),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index day_passes_workspace_idx on public.day_passes (workspace_id, expires_at desc);

-- ─────────────────────────────────────────── Credits
-- Credits live in expiring buckets. Spending drains the soonest-expiring bucket first,
-- so day-pass credits (24h) are used before monthly ones.

create table public.credit_grants (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  source text not null check (source in ('subscription', 'day_pass', 'bonus', 'refund')),
  source_ref text not null unique, -- payment reference → makes grants idempotent
  amount integer not null check (amount > 0),
  remaining integer not null check (remaining >= 0),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index credit_grants_workspace_idx on public.credit_grants (workspace_id, expires_at);

create table public.credit_spends (
  id bigint generated always as identity primary key,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  amount integer not null check (amount > 0),
  ref text not null unique, -- e.g. clip id → a clip is never charged twice
  created_at timestamptz not null default now()
);

-- ─────────────────────────────────────────── Helpers

create or replace function public.is_member(ws uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws and m.user_id = (select auth.uid())
  );
$$;

-- New auth user → profile + personal workspace.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  ws_id uuid;
  display_name text := coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name');
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (new.id, display_name, new.raw_user_meta_data ->> 'avatar_url');

  insert into public.workspaces (name, owner_id)
  values (coalesce(split_part(display_name, ' ', 1) || '''s workspace', 'My workspace'), new.id)
  returning id into ws_id;

  insert into public.workspace_members (workspace_id, user_id, role) values (ws_id, new.id, 'owner');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- What a workspace can do right now. Plan limits themselves live in app code (src/lib/pricing.ts).
create or replace function public.get_entitlements(ws uuid)
returns table (
  plan_id text,
  subscription_status text,
  period_end timestamptz,
  day_pass_until timestamptz,
  credits integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  sub record;
  pass_until timestamptz;
begin
  if not public.is_member(ws) and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not a member of this workspace';
  end if;

  -- A cancelled plan keeps working until the end of the period already paid for.
  select s.plan_id, s.status, s.current_period_end into sub
  from public.subscriptions s
  where s.workspace_id = ws
    and s.status in ('active', 'non-renewing', 'cancelled')
    and s.current_period_end > now()
  order by s.current_period_end desc
  limit 1;

  select max(d.expires_at) into pass_until
  from public.day_passes d
  where d.workspace_id = ws and d.expires_at > now();

  return query select
    coalesce(sub.plan_id, case when pass_until is not null then 'day-pass' end, 'free'),
    sub.status::text,
    sub.current_period_end,
    pass_until,
    coalesce((
      select sum(g.remaining)::integer from public.credit_grants g
      where g.workspace_id = ws and g.expires_at > now()
    ), 0);
end;
$$;

-- Atomically spend credits (called by the render worker with the service role).
create or replace function public.spend_credits(ws uuid, n integer, spend_ref text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  g record;
  left_to_take integer := n;
  take integer;
begin
  if exists (select 1 from public.credit_spends where ref = spend_ref) then
    return true; -- already charged
  end if;

  if (select coalesce(sum(remaining), 0) from public.credit_grants
      where workspace_id = ws and expires_at > now()) < n then
    return false;
  end if;

  for g in
    select id, remaining from public.credit_grants
    where workspace_id = ws and expires_at > now() and remaining > 0
    order by expires_at
    for update
  loop
    exit when left_to_take = 0;
    take := least(g.remaining, left_to_take);
    update public.credit_grants set remaining = remaining - take where id = g.id;
    left_to_take := left_to_take - take;
  end loop;

  insert into public.credit_spends (workspace_id, amount, ref) values (ws, n, spend_ref);
  return true;
end;
$$;

revoke execute on function public.spend_credits(uuid, integer, text) from public, anon, authenticated;

-- ─────────────────────────────────────────── Row Level Security
-- Members can read their workspace's billing data. Only the server (service role) writes it.

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.paystack_plans enable row level security;
alter table public.payments enable row level security;
alter table public.subscriptions enable row level security;
alter table public.day_passes enable row level security;
alter table public.credit_grants enable row level security;
alter table public.credit_spends enable row level security;

create policy "own profile: read" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "own profile: update" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "members read workspace" on public.workspaces
  for select to authenticated using (public.is_member(id));
create policy "owner renames workspace" on public.workspaces
  for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy "members read membership" on public.workspace_members
  for select to authenticated using (public.is_member(workspace_id));

create policy "members read payments" on public.payments
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read subscriptions" on public.subscriptions
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read day passes" on public.day_passes
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read credit grants" on public.credit_grants
  for select to authenticated using (public.is_member(workspace_id));
create policy "members read credit spends" on public.credit_spends
  for select to authenticated using (public.is_member(workspace_id));

-- Users may only edit safe profile columns (not e.g. future admin flags).
revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, country, currency, onboarded, updated_at) on public.profiles to authenticated;
revoke update on public.workspaces from authenticated;
grant update (name) on public.workspaces to authenticated;
