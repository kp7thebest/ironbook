-- Ironbook v14 — effort rating (1–10) for each workout
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.
--
-- Adds one optional column. Existing workouts are untouched (their effort is simply empty).
-- Until this runs, the app keeps working and the effort picker says this patch is needed.

begin;

alter table public.workouts add column if not exists effort smallint;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'workouts_effort_range') then
    alter table public.workouts add constraint workouts_effort_range check (effort is null or effort between 1 and 10);
  end if;
end $$;

-- make PostgREST (the API the app talks to) see the new column straight away
notify pgrst, 'reload schema';

commit;
