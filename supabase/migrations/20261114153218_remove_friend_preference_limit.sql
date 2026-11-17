-- Remove the friend preference count cap from signup and preference updates.
create or replace function public.request_session_signup(
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
  v_existing_status text;
  v_display_name text;
  v_friend_ids uuid[] := coalesce(p_friend_ids, '{}'::uuid[]);
  v_is_committee boolean := false;
  v_signup_status text := 'requested';
  v_slot_number smallint;
  v_release_deadline timestamptz;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  select email into v_email from auth.users where id = v_user_id;
  if not private.is_club_email(v_email) then
    raise exception using errcode = '28000', message = 'Only @atu.ie email addresses can sign up for sessions.';
  end if;

  select * into v_session
  from public.sessions
  where id = p_session_id
  for update;

  if not found or v_session.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'This session is no longer open.';
  end if;
  if now() < v_session.signup_opens_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have not opened yet.';
  end if;
  if now() >= v_session.confirmation_at then
    raise exception using errcode = 'P0001', message = 'Sign-ups have closed for this session.';
  end if;

  -- The timetable is released 30 minutes before the session. No join, whether
  -- the session is still open or already confirmed, may change the roster
  -- after this point.
  v_release_deadline := (v_session.event_date + v_session.starts_at)
                          at time zone 'Europe/London'
                          - interval '30 minutes';
  if now() >= v_release_deadline then
    raise exception using errcode = 'P0001', message = 'Sign-ups are locked. The timetable has already been released.';
  end if;

  v_display_name := left(
    nullif(btrim(split_part(coalesce((select auth.jwt()) ->> 'email', ''), '@', 1)), ''),
    80
  );
  insert into public.profiles (id, display_name)
  values (v_user_id, coalesce(v_display_name, 'Player'))
  on conflict (id) do nothing;

  select is_committee into v_is_committee
  from public.profiles
  where id = v_user_id;

  -- First-come-first-served sessions allocate a place straight away, and so
  -- do lottery sessions for committee members.
  if v_session.allocation_mode = 'fcfs' or v_is_committee then
    select available_slot.slot_number::smallint into v_slot_number
    from generate_series(1, (v_session.capacity + 3) / 4)
      as available_slot(slot_number)
    where (
      select count(*)
      from public.session_signups as signup
      where signup.session_id = p_session_id
        and signup.slot_number = available_slot.slot_number
        and signup.status in ('selected', 'played')
    ) < 4
    order by available_slot.slot_number
    limit 1;

    v_signup_status := case
      when v_slot_number is null then 'waitlisted'
      else 'selected'
    end;
  end if;

  select status into v_existing_status
  from public.session_signups
  where session_id = p_session_id and user_id = v_user_id;

  if found and v_existing_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'You already have a place or waitlist request.';
  end if;

  if found then
    update public.session_signups
    set status = v_signup_status,
        signed_up_at = now(),
        slot_number = v_slot_number
    where session_id = p_session_id and user_id = v_user_id;
  else
    insert into public.session_signups (
      session_id,
      user_id,
      status,
      slot_number
    )
    values (p_session_id, v_user_id, v_signup_status, v_slot_number);
  end if;

  delete from public.session_friend_preferences
  where session_id = p_session_id and user_id = v_user_id;

  insert into public.session_friend_preferences (
    session_id,
    user_id,
    friend_user_id
  )
  select p_session_id, v_user_id, selected_friend.friend_user_id
  from (
    select distinct friend_id as friend_user_id
    from unnest(v_friend_ids) as requested_friend(friend_id)
  ) as selected_friend
  join auth.users as friend_user on friend_user.id = selected_friend.friend_user_id
  join public.profiles as friend_profile on friend_profile.id = friend_user.id
  where selected_friend.friend_user_id <> v_user_id
    and private.is_club_email(friend_user.email);
end;
$$;

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
