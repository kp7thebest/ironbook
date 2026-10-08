-- Ironbook v11 — invite-only sign-up
-- Run in Supabase: SQL Editor -> New query -> paste -> EDIT THE CODE BELOW -> Run.
--
-- Before this patch, anyone who found the app's URL could create an account and (because the crew
-- can read each other's logs) see everyone's workouts. After it, a new account needs the crew's
-- invite code. The check runs inside the database, so it can't be skipped by calling Supabase
-- directly. Existing accounts are not affected. Safe to run again (e.g. to change the code).
--
-- The code is stored in a "private" schema the app's API can't read, and it's removed from the new
-- user's profile data as soon as it has been checked.

begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to supabase_auth_admin;

create table if not exists private.settings (
  key   text primary key,
  value text not null
);
revoke all on private.settings from public, anon, authenticated;

-- ▼▼▼ Put the crew's invite code between the quotes (replace CHANGE-ME). Share it only with the crew.
--     Use something hard to guess, e.g. three random words: 'barbell-otter-91'
insert into private.settings (key, value) values ('invite_code', 'CHANGE-ME')
on conflict (key) do update set value = excluded.value;
-- ▲▲▲

do $$
begin
  if (select trim(value) from private.settings where key = 'invite_code') in ('CHANGE-ME', '') then
    raise exception 'Set your invite code first: replace CHANGE-ME in this script, then run it again. Nothing was changed.';
  end if;
end $$;

-- Runs before every new auth user is saved. Wrong or missing code -> the sign-up is refused
-- (Supabase reports "Database error saving new user", which the app shows as "That invite code didn't work").
create or replace function private.check_invite_code()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  expected text;
begin
  select value into expected from private.settings where key = 'invite_code';
  if expected is null
     or coalesce(trim(new.raw_user_meta_data ->> 'invite_code'), '') <> trim(expected) then
    raise exception 'Ironbook: invalid invite code';
  end if;
  new.raw_user_meta_data := new.raw_user_meta_data - 'invite_code'; -- don't keep the code on the account
  return new;
end;
$$;

grant execute on function private.check_invite_code() to supabase_auth_admin;

drop trigger if exists ironbook_check_invite_code on auth.users;
create trigger ironbook_check_invite_code
  before insert on auth.users
  for each row execute function private.check_invite_code();

commit;

-- ---------------------------------------------------------------------------------------------
-- Handy afterwards (run separately, one at a time):
--
-- Who has an account? Check nobody unexpected signed up while sign-up was open:
--   select u.email, u.created_at, p.display_name
--   from auth.users u left join public.profiles p on p.id = u.id
--   order by u.created_at;
--
-- Change the code later:
--   update private.settings set value = 'new-code-here' where key = 'invite_code';
--
-- Turn the gate off again:
--   drop trigger if exists ironbook_check_invite_code on auth.users;
--
-- Note: "Add user" in the Supabase dashboard is also checked by this trigger. To add someone
-- by hand, turn the gate off, add them, then run this patch again.
