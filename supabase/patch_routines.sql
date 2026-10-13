-- Ironbook v13 — saved routines
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- A routine is a named list of exercises (and how many sets, which are warm-ups) that you can start
-- a workout from, e.g. "Upper A". Routines are private: each person only sees and edits their own.
-- Until this runs, the app works as before and "Save as routine" explains that this patch is needed.

begin;

create table if not exists public.routines (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 60),
  entries    jsonb not null default '[]',   -- [{ exercise, muscle, sets: [{ warmup? }] }]
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

alter table public.routines enable row level security;

drop policy if exists "read own routines" on public.routines;
create policy "read own routines" on public.routines
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "insert own routines" on public.routines;
create policy "insert own routines" on public.routines
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "update own routines" on public.routines;
create policy "update own routines" on public.routines
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "delete own routines" on public.routines;
create policy "delete own routines" on public.routines
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.routines to authenticated;

commit;
