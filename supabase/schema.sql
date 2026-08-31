-- Ironbook schema — run this once in Supabase: Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Crew model: every signed-in user can READ everyone's data; each user can WRITE only their own.

-- ============ TABLES ============

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null unique,
  unit text not null default 'kg' check (unit in ('kg', 'lbs')),
  created_at timestamptz not null default now()
);

create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  date date not null,
  name text not null,
  entries jsonb not null default '[]',
  created_at timestamptz not null default now()
);
create index workouts_user_date on public.workouts (user_id, date desc);

create table public.custom_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  muscle text not null,
  equipment text not null default '',
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

-- ============ AUTO-CREATE PROFILE ON SIGNUP ============
-- The app passes display_name in signup metadata; this trigger turns it into a profile row.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'Lifter ' || left(new.id::text, 4))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ ROW LEVEL SECURITY ============

alter table public.profiles enable row level security;
alter table public.workouts enable row level security;
alter table public.custom_exercises enable row level security;

-- Everyone signed in can see all profiles (that's the crew list)
create policy "profiles readable by crew" on public.profiles
  for select to authenticated using (true);
create policy "update own profile" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- Workouts: read all, write own
create policy "workouts readable by crew" on public.workouts
  for select to authenticated using (true);
create policy "insert own workouts" on public.workouts
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own workouts" on public.workouts
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own workouts" on public.workouts
  for delete to authenticated using (auth.uid() = user_id);

-- Custom exercises: read all (so friends' logs render with correct muscles), write own
create policy "custom exercises readable by crew" on public.custom_exercises
  for select to authenticated using (true);
create policy "insert own custom exercises" on public.custom_exercises
  for insert to authenticated with check (auth.uid() = user_id);
create policy "update own custom exercises" on public.custom_exercises
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "delete own custom exercises" on public.custom_exercises
  for delete to authenticated using (auth.uid() = user_id);
