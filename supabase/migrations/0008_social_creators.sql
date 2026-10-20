-- SpikeCut · watch TikTok and Instagram creators alongside YouTube and Twitch.
-- Apply in Supabase → SQL Editor.

alter table public.creators drop constraint if exists creators_platform_check;
alter table public.creators
  add constraint creators_platform_check check (platform in ('youtube', 'twitch', 'kick', 'tiktok', 'instagram'));

notify pgrst, 'reload schema';

-- Self-check: expect the constraint to list tiktok and instagram.
select pg_get_constraintdef(oid) as platforms
from pg_constraint
where conname = 'creators_platform_check';
