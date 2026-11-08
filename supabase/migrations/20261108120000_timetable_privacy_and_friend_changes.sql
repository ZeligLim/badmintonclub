-- 1. Timetables are club data, not public data. Anonymous visitors could read
--    every saved court assignment (with member names) through PostgREST.
drop policy if exists "Anyone can read session timetables" on public.session_timetables;

create policy "Club members can read session timetables" on public.session_timetables
  for select to authenticated
  using (
    exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
    )
  );

revoke select on public.session_timetables from anon;
grant select on public.session_timetables to authenticated, service_role;

-- 2. A timetable is only editable until 30 minutes before the session starts.
create or replace function private.session_timetable_is_locked(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select coalesce(
    (
      select now() >= (session.event_date + session.starts_at) at time zone 'Europe/London'
        - interval '30 minutes'
      from public.sessions as session
      where session.id = p_session_id
    ),
    true
  );
$$;

revoke all on function private.session_timetable_is_locked(uuid)
  from public, anon, authenticated;

-- 3. Changing who you want to play with changes the grouping. The app used to
--    invalidate on signup and preference updates from TypeScript only, so a
--    direct club-friend change left every saved timetable stale.
create or replace function private.invalidate_timetable_on_friend_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session_id uuid;
  v_user_id uuid;
begin
  if tg_table_name = 'session_friend_preferences' then
    v_session_id := coalesce(new.session_id, old.session_id);
    v_user_id := coalesce(new.user_id, old.user_id);
  else
    v_user_id := coalesce(new.user_id, old.user_id);
  end if;

  if v_session_id is not null then
    delete from public.session_timetables as timetable
    where timetable.session_id = v_session_id
      and not private.session_timetable_is_locked(v_session_id);
    return null;
  end if;

  -- A club-friend change affects every session this member is part of. Release
  -- times are respected, so a published timetable stays authoritative.
  delete from public.session_timetables as timetable
  using public.sessions as session
  where timetable.session_id = session.id
    and not private.session_timetable_is_locked(session.id)
    and exists (
      select 1
      from public.session_signups as signup
      where signup.session_id = session.id
        and signup.user_id = v_user_id
        and signup.status in ('requested', 'selected', 'played')
    );

  return null;
end;
$$;

revoke all on function private.invalidate_timetable_on_friend_change()
  from public, anon, authenticated;

drop trigger if exists invalidate_timetable_on_friend_change
  on public.club_friend_list;

create trigger invalidate_timetable_on_friend_change
  after insert or update or delete on public.club_friend_list
  for each row execute function private.invalidate_timetable_on_friend_change();

drop trigger if exists invalidate_timetable_on_friend_preference_change
  on public.session_friend_preferences;

create trigger invalidate_timetable_on_friend_preference_change
  after insert or update or delete on public.session_friend_preferences
  for each row execute function private.invalidate_timetable_on_friend_change();
