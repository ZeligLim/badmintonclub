-- Allow setting and viewing friend preferences for confirmed sessions until 30 minutes before session start.
-- At 30 minutes before session start, the timetable is released and session changes are locked.

-- 1. Helper function to re-match court slots for selected players based on friend preferences and player levels
create or replace function private.rematch_session_slots(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_remaining_ids uuid[];
  v_slot_number smallint := 1;
  v_court_ids uuid[];
begin
  select array_agg(signup.user_id order by signup.slot_number nulls last, signup.signed_up_at, signup.user_id)
  into v_remaining_ids
  from public.session_signups as signup
  where signup.session_id = p_session_id
    and signup.status = 'selected';

  v_remaining_ids := coalesce(v_remaining_ids, '{}'::uuid[]);

  while cardinality(v_remaining_ids) >= 4 loop
    with candidate_courts as (
      select
        array[first_player.user_id, second_player.user_id, third_player.user_id, fourth_player.user_id] as user_ids,
        first_player.ordinality + second_player.ordinality
          + third_player.ordinality + fourth_player.ordinality as rank_sum
      from unnest(v_remaining_ids) with ordinality as first_player(user_id, ordinality)
      cross join unnest(v_remaining_ids) with ordinality as second_player(user_id, ordinality)
      cross join unnest(v_remaining_ids) with ordinality as third_player(user_id, ordinality)
      cross join unnest(v_remaining_ids) with ordinality as fourth_player(user_id, ordinality)
      where first_player.ordinality < second_player.ordinality
        and second_player.ordinality < third_player.ordinality
        and third_player.ordinality < fourth_player.ordinality
    ),
    scored_courts as (
      select
        candidate_courts.user_ids,
        candidate_courts.rank_sum,
        (
          select count(*)
          from public.session_friend_preferences as preference
          where preference.session_id = p_session_id
            and preference.user_id = any(candidate_courts.user_ids)
            and preference.friend_user_id = any(candidate_courts.user_ids)
        ) as friend_score,
        (
          select coalesce(sum(abs(
            case first_profile.player_level
              when 'BEGINNER' then 1
              when 'INTERMEDIATE' then 2
              else 3
            end
            -
            case second_profile.player_level
              when 'BEGINNER' then 1
              when 'INTERMEDIATE' then 2
              else 3
            end
          )), 0)
          from public.profiles as first_profile
          join public.profiles as second_profile
            on first_profile.id < second_profile.id
          where first_profile.id = any(candidate_courts.user_ids)
            and second_profile.id = any(candidate_courts.user_ids)
        ) as level_gap
      from candidate_courts
    )
    select user_ids
    into v_court_ids
    from scored_courts
    order by friend_score desc, level_gap asc, rank_sum asc, user_ids asc
    limit 1;

    update public.session_signups
    set slot_number = v_slot_number
    where session_id = p_session_id
      and user_id = any(v_court_ids);

    select array_agg(remaining.user_id order by remaining.ordinality)
    into v_remaining_ids
    from unnest(v_remaining_ids) with ordinality as remaining(user_id, ordinality)
    where remaining.user_id <> all(v_court_ids);

    v_slot_number := v_slot_number + 1;
  end loop;

  if cardinality(v_remaining_ids) > 0 then
    update public.session_signups
    set slot_number = v_slot_number
    where session_id = p_session_id
      and user_id = any(v_remaining_ids);
  end if;
end;
$$;

revoke all on function private.rematch_session_slots(uuid) from public, anon, authenticated;
grant execute on function private.rematch_session_slots(uuid) to service_role;

-- 2. Update get_session_friend_preferences to allow confirmed sessions
create or replace function public.get_session_friend_preferences(p_session_id uuid)
returns table (
  user_id uuid,
  display_name text,
  student_id text,
  player_level text,
  is_selected boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to view saved friend choices.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can view saved friend choices.';
  end if;
  if not exists (
    select 1 from public.sessions
    where id = p_session_id and status in ('open', 'confirmed')
  ) then
    raise exception using errcode = 'P0001', message = 'Saved friend choices are not available for this session.';
  end if;

  return query
  select
    friend_user.id,
    coalesce(nullif(btrim(profile.display_name), ''), split_part(lower(friend_user.email), '@', 1)),
    split_part(lower(friend_user.email), '@', 1),
    coalesce(profile.player_level, 'INTERMEDIATE'),
    true
  from public.session_friend_preferences as preference
  join auth.users as friend_user on friend_user.id = preference.friend_user_id
  left join public.profiles as profile on profile.id = friend_user.id
  where preference.session_id = p_session_id
    and preference.user_id = v_user_id
    and private.is_club_email(friend_user.email)
  order by profile.display_name nulls last, friend_user.id;
end;
$$;

revoke all on function public.get_session_friend_preferences(uuid)
  from public, anon, authenticated;
grant execute on function public.get_session_friend_preferences(uuid)
  to authenticated;

-- 3. Update update_session_friend_preferences to allow confirmed sessions until 30 min before session starts
create or replace function public.update_session_friend_preferences(
  p_session_id uuid,
  p_friend_ids uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_email text;
  v_session public.sessions%rowtype;
  v_friend_ids uuid[] := coalesce(p_friend_ids, '{}'::uuid[]);
  v_lock_deadline timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to update your friend choices.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie club members can update friend choices.';
  end if;
  if cardinality(v_friend_ids) > 3 then
    raise exception using errcode = '22023', message = 'Select no more than three friends.';
  end if;
  if exists (
    select 1
    from unnest(v_friend_ids) as requested(friend_user_id)
    left join auth.users as friend_user
      on friend_user.id = requested.friend_user_id
    left join public.profiles as friend_profile
      on friend_profile.id = friend_user.id
    where requested.friend_user_id = v_user_id
      or friend_user.id is null
      or friend_profile.id is null
      or not private.is_club_email(friend_user.email)
  ) then
    raise exception using errcode = '22023', message = 'Select existing ATU club members only.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status not in ('open', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
  end if;
  if now() < v_session.signup_opens_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have not opened yet.';
  end if;

  -- Locked 30 minutes before session start when timetable is released
  v_lock_deadline := (v_session.event_date + v_session.starts_at)
                       at time zone 'Europe/London'
                       - interval '30 minutes';

  if now() >= v_lock_deadline then
    raise exception using errcode = 'P0001', message = 'Friend choices can no longer be changed once the timetable is released.';
  end if;

  if not exists (
    select 1 from public.session_signups
    where session_id = p_session_id
      and user_id = v_user_id
      and status in ('requested', 'selected', 'waitlisted')
  ) then
    raise exception using errcode = 'P0001', message = 'You need an active session signup to update friend choices.';
  end if;

  delete from public.session_friend_preferences
  where session_id = p_session_id
    and user_id = v_user_id;

  insert into public.session_friend_preferences (
    session_id,
    user_id,
    friend_user_id
  )
  select p_session_id, v_user_id, selected_friend.friend_user_id
  from (
    select distinct friend_user_id
    from unnest(v_friend_ids) as requested(friend_user_id)
  ) as selected_friend;

  if v_session.status = 'confirmed' then
    perform private.rematch_session_slots(p_session_id);
  end if;
end;
$$;

revoke all on function public.update_session_friend_preferences(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function public.update_session_friend_preferences(uuid, uuid[])
  to authenticated;

-- 4. Update join_confirmed_session to rematch slots and respect the 30-min lock
create or replace function public.join_confirmed_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_existing_status text;
  v_filled_count integer;
  v_next_slot smallint;
  v_display_name text;
  v_lock_deadline timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'confirmed' then
    raise exception using errcode = 'P0001', message = 'This session is not available for late joining.';
  end if;

  -- Locked 30 minutes before session start when timetable is released
  v_lock_deadline := (v_session.event_date + v_session.starts_at)
                       at time zone 'Europe/London'
                       - interval '30 minutes';

  if now() >= v_lock_deadline then
    raise exception using errcode = 'P0001', message = 'Sign-ups are locked. The timetable has already been released.';
  end if;

  if v_session.event_date < (now() at time zone 'Europe/London')::date then
    raise exception using errcode = 'P0001', message = 'This session has already taken place.';
  end if;

  select count(*) into v_filled_count
  from public.session_signups
  where session_id = p_session_id
    and status in ('selected', 'played');

  if v_filled_count >= v_session.capacity then
    raise exception using errcode = 'P0001', message = 'This session is now full.';
  end if;

  -- Ensure a profile row exists (idempotent; trigger may not have fired).
  v_display_name := left(
    nullif(btrim(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 1)), ''),
    80
  );
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(v_display_name, 'Player'))
  on conflict (id) do nothing;

  select status into v_existing_status
  from public.session_signups
  where session_id = p_session_id and user_id = v_user_id;

  if found and v_existing_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'You already have a place in this session.';
  end if;

  v_next_slot := ((v_filled_count / 4) + 1)::smallint;

  if found then
    update public.session_signups
    set status = 'selected',
        signed_up_at = now(),
        slot_number = v_next_slot
    where session_id = p_session_id and user_id = v_user_id;
  else
    insert into public.session_signups (session_id, user_id, status, slot_number)
    values (p_session_id, v_user_id, 'selected', v_next_slot);
  end if;

  perform private.rematch_session_slots(p_session_id);

  update public.profiles
  set last_played_at = greatest(
    coalesce(last_played_at, '-infinity'::timestamptz),
    (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
  )
  where id = v_user_id;
end;
$$;

revoke all on function public.join_confirmed_session(uuid)
  from public, anon, authenticated;
grant execute on function public.join_confirmed_session(uuid)
  to authenticated;

-- 5. Update cancel_session_signup to rematch slots on cancellation
create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_cancel_deadline timestamptz;
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

  -- Timetable goes out 30 minutes before start; after that no changes allowed.
  v_cancel_deadline := (v_session.event_date + v_session.starts_at)
                         at time zone 'Europe/London'
                         - interval '30 minutes';

  if now() >= v_cancel_deadline then
    raise exception using errcode = 'P0001', message = 'The cancellation window for this session has passed.';
  end if;

  update public.session_signups
  set status = 'cancelled', slot_number = null
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
