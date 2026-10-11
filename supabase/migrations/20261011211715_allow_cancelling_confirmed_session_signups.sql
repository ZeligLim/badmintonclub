create or replace function public.cancel_session_signup(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session public.sessions%rowtype;
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

  if v_session.status = 'open' then
    if now() >= v_session.confirmation_at then
      raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
    end if;
  elsif v_session.status = 'confirmed' then
    if now() >= (
      (v_session.event_date + v_session.starts_at) at time zone 'Europe/London'
    ) then
      raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
    end if;
  else
    raise exception using errcode = 'P0001', message = 'This session can no longer be changed.';
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
