-- Late cancellation, no-shows, and timetable change tracking.
--
-- Members may cancel right up to the first serve. After that the only action is
-- "I am not coming", which marks the player on the court without re-drawing the
-- evening (people are already on court; reshuffling their night mid-session
-- would be worse than an empty seat).
--
-- A cancellation before the start does refresh the timetable. Every save bumps
-- `session_timetables.version`; each player remembers the version they last saw
-- so the dashboard can say "someone cancelled, check your games" exactly once.

alter table public.session_timetables
  add column if not exists version integer not null default 1;

alter table public.session_signups
  add column if not exists no_show_at timestamptz,
  add column if not exists timetable_seen_version integer not null default 0;

-- 1. Cancelling is allowed until the session starts.
create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_starts_at timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to cancel a session request.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found then
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
  end if;

  if v_session.status not in ('open', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
  end if;

  -- Cancelling stays open until the first serve; after that a player can only
  -- mark themselves as not showing.
  v_starts_at := (v_session.event_date + v_session.starts_at)
                 at time zone 'Europe/London';

  if now() >= v_starts_at then
    raise exception
      using errcode = 'P0001',
      message = 'This session has already started. Mark yourself as not showing instead.';
  end if;

  update public.session_signups
  set status = 'cancelled',
      slot_number = null,
      no_show_at = null
  where session_id = p_session_id
    and user_id = v_user_id
    and status in ('requested', 'selected', 'waitlisted');

  if not found then
    raise exception using errcode = 'P0001', message = 'No open signup request was found to cancel.';
  end if;

  if v_session.status = 'confirmed' then
    perform private.rematch_session_slots(p_session_id);
  end if;
end;
$$;

revoke all on function public.cancel_session_signup(uuid)
  from public, anon, authenticated;
grant execute on function public.cancel_session_signup(uuid)
  to authenticated;

-- 2. "I am not coming" — a marker, never a re-draw.
create or replace function public.set_session_no_show(
  p_session_id uuid,
  p_no_show boolean default true
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_starts_at timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to change your attendance.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id;

  if not found then
    raise exception using errcode = 'P0001', message = 'This session no longer exists.';
  end if;

  v_starts_at := (v_session.event_date + v_session.starts_at)
                 at time zone 'Europe/London';

  if now() < v_starts_at then
    raise exception
      using errcode = 'P0001',
      message = 'This session has not started yet. Cancel your place instead.';
  end if;

  update public.session_signups
  set no_show_at = case when p_no_show then now() else null end
  where session_id = p_session_id
    and user_id = v_user_id
    and status in ('selected', 'played');

  if not found then
    raise exception
      using errcode = 'P0001',
      message = 'You do not have a place in this session.';
  end if;
end;
$$;

revoke all on function public.set_session_no_show(uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.set_session_no_show(uuid, boolean)
  to authenticated;

-- 3. One writer for saved timetables, so the version always moves with the data.
--    Runs as the caller's role; the app calls it with the service key because a
--    released timetable must still be refreshable after a cancellation.
create or replace function public.save_session_timetable(
  p_session_id uuid,
  p_court_schedule jsonb,
  p_generated_by uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_version integer;
begin
  -- A published timetable may be rewritten, but only through this function.
  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  insert into public.session_timetables as saved (
    session_id, court_schedule, generated_by, generated_at, version
  )
  values (p_session_id, p_court_schedule, p_generated_by, now(), 1)
  on conflict (session_id) do update
    set court_schedule = excluded.court_schedule,
        generated_by = excluded.generated_by,
        generated_at = now(),
        version = saved.version + 1
  returning version into v_version;

  return v_version;
end;
$$;

revoke all on function public.save_session_timetable(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.save_session_timetable(uuid, jsonb, uuid)
  to service_role;

-- 4. "I have seen the latest timetable", called when the player dismisses the
--    change notice.
create or replace function public.mark_session_timetable_seen(p_session_ids uuid[])
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
begin
  if v_user_id is null then
    return;
  end if;

  update public.session_signups as signup
  set timetable_seen_version = coalesce(
    (
      select timetable.version
      from public.session_timetables as timetable
      where timetable.session_id = signup.session_id
    ),
    0
  )
  where signup.user_id = v_user_id
    and signup.session_id = any(p_session_ids);
end;
$$;

revoke all on function public.mark_session_timetable_seen(uuid[])
  from public, anon, authenticated;
grant execute on function public.mark_session_timetable_seen(uuid[])
  to authenticated;

-- 5. The roster view needs to know who has said they are not coming.
drop function if exists public.get_schedule_inputs(uuid[]);

create function public.get_schedule_inputs(p_session_ids uuid[])
returns table (
  session_id uuid,
  user_id uuid,
  display_name text,
  slot_number integer,
  is_committee boolean,
  player_level text,
  friend_ids uuid[],
  no_show boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select s.id
    from public.sessions s
    where s.id = any(p_session_ids)
  ),
  roster as (
    select
      ss.session_id,
      ss.user_id,
      ss.slot_number,
      ss.no_show_at is not null as no_show
    from public.session_signups ss
    join target t on t.id = ss.session_id
    where ss.status in ('selected', 'played')
  )
  select
    r.session_id,
    r.user_id,
    p.display_name,
    r.slot_number,
    p.is_committee,
    p.player_level::text,
    coalesce(
      (
        select array_agg(distinct friend_id)
        from (
          select sfp.friend_user_id as friend_id
          from public.session_friend_preferences sfp
          where sfp.session_id = r.session_id
            and sfp.user_id = r.user_id
          union
          select cfl.friend_user_id
          from public.club_friend_list cfl
          where cfl.user_id = r.user_id
            and exists (
              select 1
              from roster mate
              where mate.session_id = r.session_id
                and mate.user_id = cfl.friend_user_id
            )
        ) friends
      ),
      '{}'::uuid[]
    ),
    r.no_show
  from roster r
  join public.profiles p on p.id = r.user_id
  order by r.session_id, r.slot_number nulls last, r.user_id;
$$;

revoke all on function public.get_schedule_inputs(uuid[]) from public, anon;
grant execute on function public.get_schedule_inputs(uuid[]) to authenticated;
