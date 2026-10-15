-- Cancellation and timetable rules:
--   The timetable is released to players 30 minutes before the session starts.
--   Once the timetable is out no changes can be made, so cancellations are
--   accepted for both open and confirmed sessions up until that point:
--     deadline = (event_date + starts_at) AT TIME ZONE 'Europe/London' - 30 min
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
end;
$$;
