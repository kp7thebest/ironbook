-- Ironbook — add private profiles.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run once.

-- 1. Add the flag (default: visible to the crew, matching current behavior)
alter table public.profiles add column if not exists is_private boolean not null default false;

-- 2. Helper: is a given user visible to the current viewer?
--    Visible if it's yourself, or the profile isn't private.
create or replace function public.can_view(target uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = target
      and (p.id = auth.uid() or p.is_private = false)
  );
$$;

-- 3. Replace the blanket "readable by crew" policies with visibility-aware ones.

-- Profiles: you can always see your own; others only if not private.
drop policy if exists "profiles readable by crew" on public.profiles;
create policy "profiles readable if public or self" on public.profiles
  for select to authenticated
  using (id = auth.uid() or is_private = false);

-- Workouts: readable if you own them, or the owner's profile is visible to you.
drop policy if exists "workouts readable by crew" on public.workouts;
create policy "workouts readable if owner visible" on public.workouts
  for select to authenticated
  using (user_id = auth.uid() or public.can_view(user_id));

-- Custom exercises: same visibility rule (so a private user's customs stay hidden),
-- but everyone still needs the exercise NAMES to render shared history correctly.
-- We keep custom exercises readable by all so exercise metadata always resolves;
-- private only hides workouts + profile listing, not the exercise dictionary.
-- (No change needed to the existing "custom exercises readable by crew" policy.)

grant execute on function public.can_view(uuid) to authenticated;
