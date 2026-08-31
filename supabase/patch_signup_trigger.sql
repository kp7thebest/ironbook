-- Ironbook — patch for "Database error saving new user"
-- Run this in Supabase: SQL Editor -> New query -> paste -> Run.
-- Safe to run even if you already ran schema.sql; it only replaces the trigger function and adds grants.

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.workouts to authenticated;
grant select, insert, update, delete on public.custom_exercises to authenticated;

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
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- Never let a profile hiccup block account creation; log it instead.
  raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  return new;
end;
$$;

grant execute on function public.handle_new_user() to supabase_auth_admin;
