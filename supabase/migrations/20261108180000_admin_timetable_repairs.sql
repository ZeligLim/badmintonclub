-- BC-16/BC-39: the committee could only re-roll a schedule, and once it was
-- released it could not be corrected at all. A repair is one deliberate swap:
-- take a player out of the saved timetable and put a waiting member in.
alter table public.admin_audit_log
  add column if not exists details jsonb;

comment on column public.admin_audit_log.details is
  'What changed, for changes that need more than an action name.';

-- The release freeze still stands for ordinary clients; the audited repair
-- below raises this transaction-local flag to make one deliberate write.
create or replace function private.prevent_published_timetable_changes()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_session_id uuid;
  v_event_date date;
  v_starts_at time;
  v_role text := coalesce((select auth.role()), '');
  v_override text := coalesce(
    current_setting('badminton.allow_locked_timetable_write', true),
    ''
  );
begin
  if v_role = 'service_role' or v_override = 'on' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  v_session_id := case when tg_op = 'DELETE' then old.session_id else new.session_id end;

  select session.event_date, session.starts_at
  into v_event_date, v_starts_at
  from public.sessions as session
  where session.id = v_session_id;

  if not found then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  if now() >= (v_event_date + v_starts_at) at time zone 'Europe/London'
    - interval '30 minutes' then
    raise exception using
      errcode = 'P0001',
      message = 'The timetable has already been released to players and can no longer be changed.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function private.prevent_published_timetable_changes()
  from public, anon, authenticated;

create or replace function public.admin_swap_session_player(
  p_session_id uuid,
  p_out_user_id uuid,
  p_in_user_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_out_status text;
  v_in_status text;
  v_out_slot integer;
  v_is_locked boolean;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles as caller
      where caller.id = v_admin_id and caller.is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can repair a timetable.';
  end if;

  if p_session_id is null or p_out_user_id is null or p_in_user_id is null then
    raise exception using errcode = '22023', message = 'Choose both players.';
  end if;

  if p_out_user_id = p_in_user_id then
    raise exception using
      errcode = '22023',
      message = 'Choose two different players.';
  end if;

  select signup.status, signup.slot_number
  into v_out_status, v_out_slot
  from public.session_signups as signup
  where signup.session_id = p_session_id and signup.user_id = p_out_user_id;

  if v_out_status is null or v_out_status not in ('selected', 'played') then
    raise exception using
      errcode = '22023',
      message = 'That player is not currently in the timetable.';
  end if;

  select signup.status
  into v_in_status
  from public.session_signups as signup
  where signup.session_id = p_session_id and signup.user_id = p_in_user_id;

  if v_in_status is null or v_in_status not in ('requested', 'waitlisted') then
    raise exception using
      errcode = '22023',
      message = 'That member is not waiting for a place.';
  end if;

  if not exists (
    select 1
    from public.session_timetables as timetable
    cross join lateral jsonb_array_elements(timetable.court_schedule) as game
    cross join lateral jsonb_array_elements_text(game -> 'players') as player
    where timetable.session_id = p_session_id
      and player = p_out_user_id::text
  ) then
    raise exception using
      errcode = '22023',
      message = 'That player is not in the saved timetable.';
  end if;

  v_is_locked := now() >= (
    select (session.event_date + session.starts_at) at time zone 'Europe/London'
    from public.sessions as session
    where session.id = p_session_id
  ) - interval '30 minutes';

  perform set_config('badminton.allow_locked_timetable_write', 'on', true);

  update public.session_timetables as timetable
  set court_schedule = (
        select jsonb_agg(
          jsonb_set(
            game.value,
            '{players}',
            (
              select jsonb_agg(
                case
                  when player.value = p_out_user_id::text then p_in_user_id::text
                  else player.value
                end
                order by player.ordinality
              )
              from jsonb_array_elements_text(game.value -> 'players')
                with ordinality as player (value, ordinality)
            )
          )
          order by game.ordinality
        )
        from jsonb_array_elements(timetable.court_schedule)
          with ordinality as game (value, ordinality)
      ),
      generated_at = now(),
      generated_by = v_admin_id
  where timetable.session_id = p_session_id;

  perform set_config('badminton.allow_locked_timetable_write', 'off', true);

  update public.session_signups
  set status = 'waitlisted', slot_number = null
  where session_id = p_session_id and user_id = p_out_user_id;

  update public.session_signups
  set status = 'selected', slot_number = v_out_slot
  where session_id = p_session_id and user_id = p_in_user_id;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_in_user_id,
    'swap-player',
    jsonb_build_object(
      'session_id', p_session_id,
      'out_user_id', p_out_user_id,
      'in_user_id', p_in_user_id,
      'was_locked', v_is_locked,
      'reason', nullif(btrim(coalesce(p_reason, '')), '')
    )
  );
end;
$$;

revoke all on function public.admin_swap_session_player(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.admin_swap_session_player(uuid, uuid, uuid, text)
  to authenticated;

-- Promoting somebody off the waitlist is the other half of a manual repair: it
-- is only possible when a place has actually come free.
create or replace function public.admin_promote_from_waitlist(
  p_session_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_admin_id uuid := (select auth.uid());
  v_admin_email text;
  v_status text;
  v_capacity integer;
  v_selected integer;
  v_next_slot integer;
  v_is_locked boolean;
begin
  select email into v_admin_email from auth.users where id = v_admin_id;

  if v_admin_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false)
    or not private.is_club_email(v_admin_email)
    or not exists (
      select 1 from public.profiles as caller
      where caller.id = v_admin_id and caller.is_committee_admin
    ) then
    raise exception using
      errcode = '42501',
      message = 'Only a club administrator can promote a member.';
  end if;

  select session.capacity into v_capacity
  from public.sessions as session
  where session.id = p_session_id;

  if v_capacity is null then
    raise exception using errcode = '22023', message = 'That session does not exist.';
  end if;

  select signup.status into v_status
  from public.session_signups as signup
  where signup.session_id = p_session_id and signup.user_id = p_user_id;

  if v_status is null or v_status not in ('requested', 'waitlisted') then
    raise exception using
      errcode = '22023',
      message = 'That member is not waiting for a place.';
  end if;

  select count(*) into v_selected
  from public.session_signups
  where session_id = p_session_id and status in ('selected', 'played');

  if v_selected >= v_capacity then
    raise exception using
      errcode = '22023',
      message = 'Every place is already taken.';
  end if;

  select coalesce(max(slot_number), 0) + 1 into v_next_slot
  from public.session_signups
  where session_id = p_session_id and status in ('selected', 'played');

  update public.session_signups
  set status = 'selected', slot_number = v_next_slot
  where session_id = p_session_id and user_id = p_user_id;

  -- A saved timetable that no longer lists everybody has to be rebuilt, but the
  -- released one is frozen; the swap repair is the tool for that case.
  v_is_locked := now() >= (
    select (session.event_date + session.starts_at) at time zone 'Europe/London'
    from public.sessions as session
    where session.id = p_session_id
  ) - interval '30 minutes';

  if not v_is_locked then
    delete from public.session_timetables where session_id = p_session_id;
  end if;

  insert into public.admin_audit_log (actor_id, target_user_id, action, details)
  values (
    v_admin_id,
    p_user_id,
    'promote-from-waitlist',
    jsonb_build_object('session_id', p_session_id, 'was_locked', v_is_locked)
  );
end;
$$;

revoke all on function public.admin_promote_from_waitlist(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_promote_from_waitlist(uuid, uuid)
  to authenticated;
