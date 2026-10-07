-- Allow players to join a confirmed session on a first-come-first-served basis
-- when there are still unfilled spots. Bypasses the lottery; slot is assigned
-- immediately at the next available slot number.
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
begin
  if v_user_id is null
    or coalesce(((select auth.jwt()) ->> 'is_anonymous')::boolean, false) then
    raise exception using errcode = '28000', message = 'Sign in to join a session.';
  end if;

  -- Lock the session row to prevent double-booking races.
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

  -- Count currently filled spots (selected + played; waitlisted don't hold a slot).
  select count(*) into v_filled_count
  from public.session_signups
  where session_id = p_session_id
    and status in ('selected', 'played');

  if v_filled_count >= v_session.capacity then
    raise exception using errcode = 'P0001', message = 'This session is now full.';
  end if;

  -- Check whether this user already has any non-cancelled signup.
  select status into v_existing_status
  from public.session_signups
  where session_id = p_session_id and user_id = v_user_id;

  if found and v_existing_status <> 'cancelled' then
    raise exception using errcode = 'P0001', message = 'You already have a place in this session.';
  end if;

  -- Assign the next slot number: ceil((filled + 1) / 4).
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

  -- Update play history immediately (mirrors what finalize_due_sessions does
  -- for lottery-selected players).
  update public.profiles
  set last_played_at = greatest(
    coalesce(last_played_at, '-infinity'::timestamptz),
    (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
  )
  where id = v_user_id;
end;
$$;

revoke all on function public.join_confirmed_session(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.join_confirmed_session(uuid) to authenticated;
