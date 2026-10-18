-- SpikeCut · Animate v2: turn uploaded videos into cartoons (local "Light filter" or fal.ai Lucy Restyle).
-- Apply in Supabase → SQL Editor, after 0006.

-- New job type for the worker queue.
alter table public.jobs drop constraint if exists jobs_type_check;
alter table public.jobs add constraint jobs_type_check check (type in ('analyze', 'render', 'cartoonify'));

-- Cartoon renders are their own clip style. 'animated' stays valid for rows made by the first Animate build.
alter table public.clips drop constraint if exists clips_style_check;
alter table public.clips add constraint clips_style_check check (style in ('standard', 'animated', 'cartoon'));

notify pgrst, 'reload schema';

-- Self-check: expect both constraints, each mentioning the new value.
select conname::text as name, pg_get_constraintdef(oid) as definition
from pg_constraint
where conname in ('jobs_type_check', 'clips_style_check')
order by 1;
