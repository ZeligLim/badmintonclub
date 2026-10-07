-- Fix: session_signups.user_id has a FK to profiles.id, but a user who signed
-- up via OTP may not have a profiles row yet if the trigger misfired. Both
-- request_session_signup and join_confirmed_session now upsert the profile
-- (deriving display_name from the JWT email prefix) before inserting a signup.

create or replace function public.request_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_existing_status text;
  v_display_name text;
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
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
    raise exception using errcode = 'P0001', message = 'You already have a place or waitlist request.';
  end if;

  if found then
    update public.session_signups
    set status = 'requested', signed_up_at = now(), slot_number = null
    where session_id = p_session_id and user_id = v_user_id;
  else
    insert into public.session_signups (session_id, user_id)
    values (p_session_id, v_user_id);
  end if;
end;
$$;

create or replace function public.join_confirmed_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
  v_existing_status text;
  v_filled_count integer;
  v_next_slot smallint;
  v_display_name text;
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

  update public.profiles
  set last_played_at = greatest(
    coalesce(last_played_at, '-infinity'::timestamptz),
    (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
  )
  where id = v_user_id;
end;
$$;
